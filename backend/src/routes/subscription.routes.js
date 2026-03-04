import { Router } from "express";
import {
    toggleSubscription,
    getSubscribedChannels,
    getUserChannelSubscribers,
    getSuggestedChannels,
    getSubscribedChannelsContent,
    checkSubscriptionStatus
} from '../controllers/subscription.controller.js'
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();

router.use(verifyJWT)

router
    .route("/c/:channelId")
    .get(getUserChannelSubscribers)
    .post(toggleSubscription);

router.route("/u/:subscriberId").get(getSubscribedChannels);
router.route("/suggested").get(getSuggestedChannels);
router.route("/content").get(getSubscribedChannelsContent);
router.route("/status/:channelId").get(checkSubscriptionStatus);

export default router