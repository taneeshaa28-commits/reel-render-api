const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();

app.use(cors());
app.use(express.json());

// point fluent-ffmpeg to the bundled ffmpeg binary
if (!ffmpegPath) {
  console.error("ffmpeg-static path not found");
} else {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.post("/render", async (req, res) => {
  const jobId = uuidv4();
  const tempDir = os.tmpdir();

  const tempImagePath = path.join(tempDir, `input-${jobId}.jpg`);
  const outputPath = path.join(tempDir, `output-${jobId}.mp4`);

  const cleanup = () => {
    try { if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  try {
    const { image_url } = req.body;

    if (!image_url) {
      cleanup();
      return res.status(400).json({ error: "image_url required" });
    }

    // download image to temp
    const response = await axios({
      url: image_url,
      method: "GET",
      responseType: "stream",
      timeout: 30000,
      headers: { "User-Agent": "reel-render-api/1.0" }
    });

    const writer = fs.createWriteStream(tempImagePath);

    response.data.on("error", (e) => {
      console.error("download stream error:", e);
      cleanup();
      return res.status(500).json({ error: "Image download failed" });
    });

    writer.on("error", (e) => {
      console.error("file write error:", e);
      cleanup();
      return res.status(500).json({ error: "Image save failed" });
    });

    writer.on("finish", () => {
      ffmpeg(tempImagePath)
        .inputOptions(["-loop 1"])
        .outputOptions([
          "-t 7",
          "-vf scale=1080:1920:force_original_aspect_ratio=cover,crop=1080:1920",
          "-pix_fmt yuv420p",
          "-r 30",
          "-movflags +faststart"
        ])
        .on("start", (cmd) => console.log("ffmpeg cmd:", cmd))
        .on("error", (e) => {
          console.error("ffmpeg error:", e);
          cleanup();
          if (!res.headersSent) return res.status(500).json({ error: "FFmpeg failed" });
        })
        .on("end", () => {
          res.download(outputPath, "reel.mp4", (err) => {
            if (err) console.error("download error:", err);
            cleanup();
          });
        })
        .save(outputPath);
    });

    response.data.pipe(writer);
  } catch (err) {
    console.error("render route error:", err);
    cleanup();
    if (!res.headersSent) res.status(500).json({ error: "Render failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
