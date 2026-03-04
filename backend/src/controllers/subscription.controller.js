import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/users.models.js";
import { Subscription } from "../models/subscription.models.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { ApiResponses } from "../utils/ApiResponses.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  // TODO: toggle subscription
  const { channelId } = req.params;
  if (!isValidObjectId(channelId)) {
    throw new ApiErrors(404, "Channel ID is not valid");
  }

  const isSubscribed = await Subscription.findOne({
    subscriber: req.user._id,
    channel: channelId,
  });
  // console.log(isSubscribed);
  if (isSubscribed) {
    await Subscription.findByIdAndDelete(isSubscribed._id);

    return res
      .status(200)
      .json(
        new ApiResponses(
          201,
          { isSubscribed: false },
          "Unsubscribed successfully"
        )
      );
  } else {
    // console.log("IsSubscribed: " + isSubscribed);
    const subscribing = await Subscription.create({
      subscriber: req.user._id,
      channel: channelId,
    });
    if (!subscribing) {
      throw new ApiErrors(500, "Error while subscribing");
    }
    return res
      .status(200)
      .json(
        new ApiResponses(201, { isSubscribed: true }, "Subscribed successfully")
      );
  }
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiErrors(
      404,
      "Invalid channel id fetched while getUserChannelSubscribers"
    );
  }

  const subscribersAggregate = await Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriberList",
      },
    },
    {
      $addFields: {
        subscribersDetails: {
          $first: "$subscriberList",
        },
      },
    },
    {
      $group: {
        _id: null,
        subscribersCount: {
          $sum: 1,
        },
        userName: {
          $push: "$subscribersDetails.username",
        },
        avatar: {
          $push: "$subscribersDetails.avatar",
        },
      },
    },
    {
      $project: {
        _id: 0,
        subscribersCount: 1,
        userName: 1,
        avatar: 1,
      },
    },
  ]);

  let isSubscribed = false;
  if (req.user?._id) {
    const subscription = await Subscription.findOne({
      channel: channelId,
      subscriber: req.user._id,
    });
    isSubscribed = !!subscription;
  }

  const result = subscribersAggregate[0] || {
    subscribersCount: 0,
    userName: [],
    avatar: [],
  };

  return res
    .status(200)
    .json(
      new ApiResponses(
        200,
        { ...result, isSubscribed },
        "Subscriber count fetched successfully"
      )
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId)) {
    throw new ApiErrors(
      404,
      "Invalid subscriber id fetched while getSubscribedChannels"
    );
  }

  const channelSubscribedList = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channelDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              email: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "channel",
        foreignField: "channel",
        as: "subscriberCount",
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "channel",
        foreignField: "owner",
        as: "latestVideos",
        pipeline: [
          {
            $match: { isPublished: true },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 1,
          },
          {
            $project: {
              _id: 1,
              title: 1,
              thumbnail: 1,
              views: 1,
              createdAt: 1,
              duration: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        channelInfo: { $first: "$channelDetails" },
        subscribersCount: { $size: "$subscriberCount" },
        latestVideo: { $first: "$latestVideos" },
      },
    },
    {
      $project: {
        _id: 0,
        channelId: "$channel",
        username: "$channelInfo.username",
        fullName: "$channelInfo.fullName",
        avatar: "$channelInfo.avatar",
        email: "$channelInfo.email",
        subscribersCount: 1,
        latestVideo: 1,
        subscribedAt: "$createdAt",
        channelCreatedAt: "$channelInfo.createdAt",
      },
    },
    {
      $sort: { subscribedAt: -1 },
    },
  ]);

  if (!channelSubscribedList || channelSubscribedList.length === 0) {
    return res
      .status(200)
      .json(
        new ApiResponses(
          200,
          { channels: [], totalSubscriptions: 0 },
          "No channels subscribed yet"
        )
      );
  }

  return res.status(200).json(
    new ApiResponses(
      200,
      {
        channels: channelSubscribedList,
        totalSubscriptions: channelSubscribedList.length,
      },
      "Subscribed channels fetched successfully"
    )
  );
});

// controller to get suggested users (users not subscribed to)
const getSuggestedChannels = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { limit = 10 } = req.query;

  // Get channels that the user is already subscribed to
  const subscribedChannels = await Subscription.find({
    subscriber: userId,
  }).select("channel");

  const subscribedChannelIds = subscribedChannels.map((sub) => sub.channel);
  subscribedChannelIds.push(userId); // Exclude the user themselves

  // Get suggested channels (users not subscribed to)
  const suggestedChannels = await User.aggregate([
    {
      $match: {
        _id: { $nin: subscribedChannelIds },
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        as: "videos",
        pipeline: [
          {
            $match: { isPublished: true },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 1,
          },
        ],
      },
    },
    {
      $addFields: {
        subscribersCount: { $size: "$subscribers" },
        latestVideo: { $first: "$videos" },
        videosCount: { $size: "$videos" },
      },
    },
    {
      $project: {
        username: 1,
        fullName: 1,
        avatar: 1,
        email: 1,
        subscribersCount: 1,
        latestVideo: {
          _id: 1,
          title: 1,
          thumbnail: 1,
          views: 1,
          createdAt: 1,
          duration: 1,
        },
        videosCount: 1,
        createdAt: 1,
      },
    },
    {
      $sort: { subscribersCount: -1, createdAt: -1 },
    },
    {
      $limit: parseInt(limit),
    },
  ]);

  return res.status(200).json(
    new ApiResponses(
      200,
      {
        channels: suggestedChannels,
        totalSuggested: suggestedChannels.length,
      },
      "Suggested channels fetched successfully"
    )
  );
});

// controller to check if user is subscribed to a channel
const checkSubscriptionStatus = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiErrors(404, "Invalid channel ID");
  }

  const isSubscribed = await Subscription.findOne({
    subscriber: req.user._id,
    channel: channelId,
  });

  return res
    .status(200)
    .json(
      new ApiResponses(
        200,
        { isSubscribed: !!isSubscribed },
        "Subscription status fetched successfully"
      )
    );
});

// controller to get recent content from subscribed channels
const getSubscribedChannelsContent = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { limit = 20, type = "all" } = req.query; // type can be 'videos', 'tweets', or 'all'

  // Get subscribed channels
  const subscribedChannels = await Subscription.find({
    subscriber: userId,
  }).select("channel");

  if (!subscribedChannels.length) {
    return res
      .status(200)
      .json(
        new ApiResponses(
          200,
          { content: [], totalContent: 0 },
          "No subscribed channels found"
        )
      );
  }

  const channelIds = subscribedChannels.map((sub) => sub.channel);

  let content = [];

  if (type === "videos" || type === "all") {
    // Get recent videos from subscribed channels
    const videos = await mongoose.model("Video").aggregate([
      {
        $match: {
          owner: { $in: channelIds },
          isPublished: true,
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
                username: 1,
                fullName: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "video",
          as: "comments",
        },
      },
      {
        $lookup: {
          from: "likes",
          localField: "_id",
          foreignField: "video",
          as: "likes",
        },
      },
      {
        $addFields: {
          owner: { $first: "$owner" },
          commentsCount: { $size: "$comments" },
          likesCount: { $size: "$likes" },
          contentType: "video",
          isLiked: {
            $cond: {
              if: { $in: [userId, "$likes.isLikedBy"] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          comments: 0,
          likes: 0,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit:
          type === "all" ? Math.floor(parseInt(limit) / 2) : parseInt(limit),
      },
    ]);

    content = [...content, ...videos];
  }

  if (type === "tweets" || type === "all") {
    // Get recent tweets from subscribed channels
    const tweets = await mongoose.model("Tweet").aggregate([
      {
        $match: {
          owner: { $in: channelIds },
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
                username: 1,
                fullName: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "tweet",
          as: "comments",
        },
      },
      {
        $lookup: {
          from: "likes",
          localField: "_id",
          foreignField: "tweet",
          as: "likes",
        },
      },
      {
        $addFields: {
          owner: { $first: "$owner" },
          commentsCount: { $size: "$comments" },
          likesCount: { $size: "$likes" },
          contentType: "tweet",
          isLiked: {
            $cond: {
              if: { $in: [userId, "$likes.isLikedBy"] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          comments: 0,
          likes: 0,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit:
          type === "all" ? Math.floor(parseInt(limit) / 2) : parseInt(limit),
      },
    ]);

    content = [...content, ...tweets];
  }

  // Sort all content by creation date
  content.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (type === "all") {
    content = content.slice(0, parseInt(limit));
  }

  return res.status(200).json(
    new ApiResponses(
      200,
      {
        content,
        totalContent: content.length,
      },
      "Subscribed channels content fetched successfully"
    )
  );
});

export {
  toggleSubscription,
  getUserChannelSubscribers,
  getSubscribedChannels,
  getSuggestedChannels,
  getSubscribedChannelsContent,
  checkSubscriptionStatus,
};
