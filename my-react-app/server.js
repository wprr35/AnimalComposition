
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());

// Folder where WAV files will be saved
const soundsFolder = path.join(
  __dirname,
  "..",
  "Sounds"
);

// Create folder if it doesn't exist
fs.mkdirSync(soundsFolder, { recursive: true });

// Configure file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, soundsFolder);
  },

  filename: (req, file, cb) => {
    const filename = `animal-${Date.now()}.wav`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Save WAV recording
app.post(
  "/api/save-audio",
  upload.single("audio"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "No audio file received",
      });
    }

    res.json({
      message: "Audio saved successfully!",
      filename: req.file.filename,
    });
  }
);


app.listen(5000, () => {
  console.log("Audio server running on http://localhost:5000");
});
