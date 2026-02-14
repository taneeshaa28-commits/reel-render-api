const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();

// allow Hoppscotch (and other browsers) to call your API
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// optional: quick health check in browser
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.post("/render", async (req, res) => {
  try {
    const { image_url, title } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: "image_url required" });
    }

    const tempImagePath = path.join(__dirname, "input.jpg");
    const outputPath = path.join(__dirname, "output.mp4");

    // Download image
    const response = await axios({
      url: image_url,
      method: "GET",
      responseType: "stream",
    });

    const writer = fs.createWriteStream(tempImagePath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      ffmpeg(tempImagePath)
        .loop(7)
        .size("1080x1920")
        .outputOptions([
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=cover",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "30",
        ])
        .on("error", (e) => {
          console.error("ffmpeg error:", e);
          return res.status(500).json({ error: "FFmpeg failed" });
        })
        .on("end", () => {
          res.download(outputPath, "reel.mp4");
        })
        .save(outputPath);
    });

    writer.on("error", (e) => {
      console.error("file write error:", e);
      return res.status(500).json({ error: "Image save failed" });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Render failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
