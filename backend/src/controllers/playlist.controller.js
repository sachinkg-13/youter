import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.models.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { ApiResponses } from "../utils/ApiResponses.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/videos.models.js";

const createPlaylist = asyncHandler(async (req, res) => {
  //TODO: create playlist
  const { name, description, videoIds } = req.body;
  if (!name || !description || !Array.isArray(videoIds)) {
    throw new ApiErrors(400, "Invalid playlist data");
  }

  const videos = await Video.find({ _id: { $in: videoIds } });
  if (videos.length !== videoIds.length) {
    throw new ApiErrors(400, "Some videos not found");
  }

  const playlist = await Playlist.create({
    name,
    description,
    allVideos: videoIds,
    owner: req.user._id,
  });
  // console.log("Playlist: " + JSON.stringify({ playlist }));
  if (!playlist) {
    throw new ApiErrors(500, "Playlist creation error");
  }
  return res
    .status(200)
    .json(new ApiResponses(201, { playlist }, "Playlist created successfully"));
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    throw new ApiErrors(400, "Invalid user Id");
  }

  const playlist = await Playlist.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "allVideos",
        foreignField: "_id",
        as: "playlistVideos",
        pipeline: [
          {
            $project: {
              _id: 1,
              thumbnail: 1,
              title: 1,
              description: 1,
              views: 1,
              owner: 1,
              updatedAt: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        totalVideos: {
          $size: "$playlistVideos",
        },
        totalViews: {
          $sum: "$playlistVideos.views",
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        playlistVideos: 1,
        description: 1,
        totalVideos: 1,
        totalViews: 1,
        updatedAt: 1,
      },
    },
  ]);
  console.log("Playlist: " + JSON.stringify(playlist));

  if (!playlist) {
    throw new ApiErrors(500, "Server error while finding the playlist");
  }

  return res
    .status(200)
    .json(
      new ApiResponses(200, playlist, "User playlist fetched successfully")
    );
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  //TODO: get playlist by id
  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiErrors(404, "Invalid Playlist ID");
  }

  const playlist = await Playlist.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "allVideos",
        foreignField: "_id",
        as: "playlistVideos",
        pipeline: [
          {
            $project: {
              _id: 1,
              thumbnail: 1,
              title: 1,
              description: 1,
              views: 1,
              owner: 1,
              updatedAt: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        totalVideos: {
          $size: "$playlistVideos",
        },
        totalViews: {
          $sum: "$playlistVideos.views",
        },
      },
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
              fullName: 1,
              username: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        playlistVideos: 1,
        description: 1,
        totalVideos: 1,
        totalViews: 1,
        owner: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  if (!playlist || playlist.length === 0) {
    throw new ApiErrors(404, "Playlist not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponses(
        200,
        { playlist: playlist[0] },
        `Playlist with ID ${playlistId} fetched successfully`
      )
    );
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  if (!isValidObjectId(playlistId)) {
    throw new ApiErrors(404, "Invalid Playlist ID");
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiErrors(404, "Invalid Video ID");
  }
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    throw new ApiErrors(404, "Playlist not found");
  }
  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiErrors(404, "Video not found");
  }
  if (playlist.allVideos.includes(videoId)) {
    throw new ApiErrors(400, "Video already in the playlist");
  }
  playlist.allVideos.push(videoId);

  const updatedPlaylist = await playlist.save();
  return res
    .status(200)
    .json(
      new ApiResponses(
        201,
        { updatedPlaylist },
        `Video added to playlistId: ${playlistId}`
      )
    );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  // TODO: remove video from playlist
  if (!isValidObjectId(playlistId)) {
    throw new ApiErrors(404, "Invalid Playlist ID");
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiErrors(404, "Invalid Video ID");
  }

  const playlist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $pull: { allVideos: videoId } },
    { new: true }
  );
  if (!playlist) {
    throw new ApiErrors(404, "Playlist with this ID not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponses(
        201,
        playlist,
        `Video removed from playlist: ${playlistId}`
      )
    );
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  // TODO: delete playlist
  if (!isValidObjectId(playlistId)) {
    throw new ApiErrors(404, "Invalid Playlist ID");
  }

  await Playlist.findByIdAndDelete(playlistId);

  return res
    .status(200)
    .json(new ApiResponses(201, `Playlist removed successfully`));
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;
  //TODO: update playlist
  if (!isValidObjectId(playlistId)) {
    throw new ApiErrors(404, "Invalid Playlist ID");
  }
  if (!name && !description) {
    throw new ApiErrors(404, "Name or Description not found");
  }
  const updateFields = {};
  if (name) updateFields.name = name;
  if (description) updateFields.description = description;

  // Find the playlist by playlistId and update it
  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  if (!updatedPlaylist) {
    res.status(404);
    throw new Error("Playlist not found");
  }
  return res
    .status(200)
    .json(
      new ApiResponses(
        201,
        { updatedPlaylist },
        "Playlist updated successfully"
      )
    );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};
