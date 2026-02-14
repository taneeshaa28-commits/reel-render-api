const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();

app.use(cors());
app.use(express.json());

ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 10000;

// health check
app.get("/", (req, res) => {
  res.status(200).send("API is live");
});

app.post("/render", async (req, res) => {
  try {
    const { image_url, title } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: "image_url required" });
    }

    const id = uuidv4();
    const tempImagePath = path.join(__dirname, `input-${id}.jpg`);
    const outputPath = path.join(__dirname, `output-${id}.mp4`);

    // download image
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
        .outputOptions([
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "30",
        ])
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          return res.status(500).json({ error: "FFmpeg failed" });
        })
        .on("end", () => {
          res.download(outputPath, "reel.mp4", () => {
            // cleanup
            fs.unlinkSync(tempImagePath);
            fs.unlinkSync(outputPath);
          });
        })
        .save(outputPath);
    });

    writer.on("error", (err) => {
      console.error("File write error:", err);
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
