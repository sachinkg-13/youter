import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" })); //Limits the json FILE storage
app.use(express.urlencoded({ extended: true, limit: "16kb" })); //Limits the URL ENCODED data storage
app.use(express.static("public")); //
app.use(cookieParser());

//ROUTES
import userRoutes from "./routes/user.routes.js";
import videoRoutes from "./routes/video.routes.js";
import tweetRoutes from "./routes/tweet.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import playlistRoutes from "./routes/playlist.routes.js";
import likeRoutes from "./routes/like.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import commentRoutes from "./routes/comment.routes.js";

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/videos", videoRoutes);
app.use("/api/v1/tweets", tweetRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
app.use("/api/v1/playlists", playlistRoutes);
app.use("/api/v1/like", likeRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/comments", commentRoutes);

app.get("/api/v1/health", (req, res) => {
  res.json({ success: true, statuscode: 200, message: "Welcome to backend API" });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, statuscode: 404, message: "API not found " });
});

//http://localhost:3000/api/v1/users/register
export { app };
