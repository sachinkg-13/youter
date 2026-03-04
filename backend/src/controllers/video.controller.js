import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/users.models.js";
import { Video } from "../models/videos.models.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { ApiResponses } from "../utils/ApiResponses.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  let { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  // Convert page and limit to numbers
  page = parseInt(page);
  limit = parseInt(limit);

  console.log("req.query: " + JSON.stringify(req.query));
  const matchStage = { isPublished: true };

  if (query) {
    matchStage.$text = { $search: query };
  }

  if (userId) {
    matchStage.owner = new mongoose.Types.ObjectId(userId);
  }

  let sortOptions = {};
  if (sortBy && sortType) {
    sortOptions[sortBy] = sortType === "asc" ? 1 : -1;
  } else {
    sortOptions.createdAt = -1;
  }
  console.log("Sort options ", sortOptions);

  try {
    const videos = await Video.aggregate([
      {
        $match: matchStage
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                username: 1,
                fullName: 1,
                avatar: 1,
                email: 1
              }
            }
          ]
        }
      },
      {
        $unwind: "$owner"
      },
      {
        $lookup: {
          from: "likes",
          localField: "_id",
          foreignField: "video",
          as: "likes"
        }
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "video",
          as: "comments"
        }
      },
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          commentsCount: { $size: "$comments" },
          isLiked: {
            $cond: {
              if: req.user?._id ? {
                $in: [req.user._id, "$likes.isLikedBy"]
              } : false,
              then: true,
              else: false
            }
          }
        }
      },
      {
        $sort: sortOptions
      },
      {
        $skip: (page - 1) * limit
      },
      {
        $limit: limit
      },
      {
        $project: {
          likes: 0,  // Remove likes array from output
          comments: 0  // Remove comments array from output
        }
      }
    ]);

    const totalVideos = await Video.countDocuments(matchStage);

    console.log("Videos: " + videos.length + " out of " + totalVideos);
    res.status(200).json(
      new ApiResponses(
        200,
        {
          docs: videos,
          totalDocs: totalVideos,
          page,
          limit,
          totalPages: Math.ceil(totalVideos / limit),
          hasNextPage: page < Math.ceil(totalVideos / limit),
          hasPrevPage: page > 1
        },
        "Videos fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching videos:", error);
    res
      .status(500)
      .json(new ApiResponses(500, "Error occurred while getting all videos"));
  }
});

const publishAVideo = asyncHandler(async (req, res) => {
  // TODO: get video, upload to cloudinary, create video

  const { title, description } = req.body;
  if (!(title && description)) {
    throw new ApiErrors(404, "Video not found (title and description)");
  }
  // console.log("Title: "+title)

  // const existedVideo=await Video.findOne({$or:[{title},{description}]})

  const videoLocalPath = req.files?.videoFile[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

  // console.log("Video file: "+videoLocalPath)
  // console.log("Thumbnail file: "+thumbnailLocalPath)

  if (!videoLocalPath) {
    throw new ApiErrors(500, "Video not uploaded locally");
  }
  if (!thumbnailLocalPath) {
    throw new ApiErrors(500, "Thumbnail not uploaded locally");
  }

  const videoFile = await uploadOnCloudinary(videoLocalPath);
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

  if (!videoFile) {
    throw new ApiErrors(500, "Error uploading video to cloudinary");
  }
  if (!thumbnail) {
    throw new ApiErrors(500, "Error uploading thumbnail to cloudinary");
  }

  // Extract duration from cloudinary response (duration is in seconds)
  const duration = videoFile.duration || 0;

  // console.log("Video cloudinary path: "+videoFile)

  const video = await Video.create({
    videoFile: videoFile.url,
    thumbnail: thumbnail.url,
    title,
    description,
    duration,
    owner: req.user?._id,
  });
  // console.log("Single video: "+video)

  const videoUploaded = await Video.findOne(video._id);
  if (!videoUploaded) {
    throw new ApiErrors(500, "Error on saving the video");
  }
  return res
    .status(201)
    .json(new ApiResponses(200, videoUploaded, "Video uploaded successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: get video by id
  if (!videoId) {
    throw new ApiErrors(400, "Video ID not found");
  }
  
  const video = await Video.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(videoId) }
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              email: 1
            }
          }
        ]
      }
    },
    {
      $unwind: "$owner"
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes"
      }
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments"
      }
    },
    {
      $addFields: {
        likesCount: { $size: "$likes" },
        commentsCount: { $size: "$comments" },
        isLiked: {
          $cond: {
            if: req.user?._id ? {
              $in: [req.user._id, "$likes.isLikedBy"]
            } : false,
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project: {
        likes: 0,  // Remove likes array from output
        comments: 0  // Remove comments array from output
      }
    }
  ]);

  if (!video || video.length === 0) {
    throw new ApiErrors(404, "No video with this ID");
  }

  return res
    .status(200)
    .json(new ApiResponses(200, video[0], "Video retrieved Successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: update video details like title, description, thumbnail
  if (!videoId) {
    throw new ApiErrors(400, "Video ID not found");
  }

  const thumbnailLocalPath = req.file?.path;
  if (!thumbnailLocalPath) {
    throw new ApiErrors(404, "Thumbnail not found");
  }

  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  if (!thumbnail.url) {
    throw new ApiResponses(400, "Error while uploading thumbnail file");
  }

  let video = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        thumbnail: thumbnail.url,
      },
    },
    {
      new: true,
    }
  );
  if (!video) {
    throw new ApiErrors(404, "No video with this ID");
  }
  return res
    .status(200)
    .json(new ApiResponses(200, video?.url, "Thumbnail updated sucessful"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  //TODO: delete video
  const { videoId } = req.params;
  if (!videoId) {
    throw new ApiErrors(400, "Video ID not found while deleting video");
  }
  try {
    await Video.findByIdAndDelete(videoId);

    res.status(200).json(new ApiResponses(201, "Video deleted successfully"));
  } catch (error) {
    console.error("Error deleting video:", error);
    res.status(500).json({ success: false, error: "Could not delete video" });
  }
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
});

const incrementVideoViews = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  
  if (!isValidObjectId(videoId)) {
    throw new ApiErrors(400, "Invalid video ID");
  }

  // Increment video views
  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { views: 1 } },
    { new: true }
  );

  if (!video) {
    throw new ApiErrors(404, "Video not found");
  }

  // Add to user's watch history if user is logged in
  if (req.user?._id) {
    await User.findByIdAndUpdate(
      req.user._id,
      { 
        $addToSet: { watch: videoId } // $addToSet prevents duplicates
      }
    );
  }

  return res
    .status(200)
    .json(new ApiResponses(200, { views: video.views }, "Video view counted"));
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  incrementVideoViews,
};
