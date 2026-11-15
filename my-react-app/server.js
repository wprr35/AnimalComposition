
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());


// ==========================================
// FOLDER PATHS
// ==========================================

const soundsFolder = path.resolve(
    __dirname,
    "..",
    "Sounds"
);

const pythonFolder = path.resolve(
    __dirname,
    "..",
    "AnimalComposition"
);

const resultsFolder = path.resolve(
    __dirname,
    "..",
    "Results"
);

const pythonScript = path.join(
    pythonFolder,
    "createsound.py"
);

const resultFile = path.join(
    resultsFolder,
    "result.json"
);


// Create folders if they don't exist

fs.mkdirSync(soundsFolder, { recursive: true });
fs.mkdirSync(resultsFolder, { recursive: true });


// ==========================================
// SERVE GENERATED FILES
// ==========================================

app.use(
    "/results",
    express.static(resultsFolder, {
        dotfiles: "deny",
        index: false
    })
);


// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, soundsFolder);
    },

    filename: (req, file, cb) => {

        const filename =
            `animal-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}.wav`;

        cb(null, filename);

    }

});

const upload = multer({

    storage,

    limits: {
        fileSize: 20 * 1024 * 1024
    }

});


// ==========================================
// PROCESSING STATUS
// ==========================================

let isProcessing = false;


// ==========================================
// SAVE AUDIO RECORDING
// ==========================================

app.post(
    "/api/save-audio",

    (req, res, next) => {

        if (isProcessing) {

            return res.status(409).json({
                message: "A batch is currently being processed."
            });

        }

        next();

    },

    upload.single("audio"),

    (req, res) => {

        if (!req.file) {

            return res.status(400).json({
                message: "No audio file received."
            });

        }

        res.json({

            message: "Audio saved successfully!",

            filename: req.file.filename

        });

    }

);


// ==========================================
// CLEAR SOUNDS FOLDER
// ==========================================

function clearSoundsFolder() {

    const files = fs.readdirSync(soundsFolder);

    for (const filename of files) {

        const filePath = path.join(
            soundsFolder,
            filename
        );

        const stats = fs.lstatSync(filePath);

        if (stats.isFile() || stats.isSymbolicLink()) {

            fs.unlinkSync(filePath);

        }

    }

}


// ==========================================
// PROCESS BATCH
// ==========================================

app.post("/api/process-batch", async (req, res) => {

    if (isProcessing) {

        return res.status(409).json({
            message: "A batch is already being processed."
        });

    }

    isProcessing = true;

    try {

        // Check recordings

        const recordings = fs.readdirSync(soundsFolder)
            .filter(filename =>
                filename.toLowerCase().endsWith(".wav")
            );

        if (recordings.length === 0) {

            return res.status(400).json({
                message: "No recordings found. Please record some animal sounds first."
            });

        }


        // Check Python script

        if (!fs.existsSync(pythonScript)) {

            throw new Error(
                `Python script not found: ${pythonScript}`
            );

        }


        // Remove old results

        const oldResults = [
            "hybrid_animal.png",
            "output.mp3",
            "name.txt",
            "info.mp3",
            "result.json"
        ];

        for (const filename of oldResults) {

            const filePath = path.join(
                resultsFolder,
                filename
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

        }


        // Run Python script

        const pythonExecutable =
            process.env.PYTHON_BIN || "python";

        console.log("Starting Python generation...");

        const { stdout, stderr } = await execFileAsync(
            pythonExecutable,
            [pythonScript],
            {
                cwd: pythonFolder,
                timeout: 900000,
                maxBuffer: 10 * 1024 * 1024
            }
        );

        if (stdout) {
            console.log(stdout);
        }

        if (stderr) {
            console.log(stderr);
        }


        // Read generated JSON

        if (!fs.existsSync(resultFile)) {

            throw new Error(
                "Python did not create result.json."
            );

        }

        const results = JSON.parse(
            fs.readFileSync(resultFile, "utf8")
        );


        // Validate output filenames

        const imageFilename = path.basename(results.image);
        const audioFilename = path.basename(results.audio);
        const infoAudioFilename = path.basename(results.infoAudio);

        if (
            imageFilename !== results.image ||
            audioFilename !== results.audio ||
            infoAudioFilename !== results.infoAudio
        ) {

            throw new Error("Invalid generated filenames.");

        }


        // Validate generated files

        const imagePath = path.join(
            resultsFolder,
            imageFilename
        );

        const audioPath = path.join(
            resultsFolder,
            audioFilename
        );

        const infoAudioPath = path.join(
            resultsFolder,
            infoAudioFilename
        );

        if (
            !fs.existsSync(imagePath) ||
            !fs.existsSync(audioPath)
        ) {

            throw new Error(
                "Generated image or audio file is missing."
            );

        }


        // ==========================================
        // CLEAR INPUT RECORDINGS AFTER SUCCESS
        // ==========================================

        clearSoundsFolder();

        console.log("Sounds folder cleared successfully.");


        // ==========================================
        // RETURN RESULTS TO REACT
        // ==========================================

        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const cacheVersion = Date.now();

        res.json({

            success: true,

            name: results.name,

            animals: results.animals,

            imageUrl:
                `${baseUrl}/results/${encodeURIComponent(imageFilename)}?v=${cacheVersion}`,

            audioUrl:
                `${baseUrl}/results/${encodeURIComponent(audioFilename)}?v=${cacheVersion}`,

            infoAudioUrl:
                `${baseUrl}/results/${encodeURIComponent(results.infoAudio)}?v=${cacheVersion}`,
            
            infoAudioUrl:
                `${baseUrl}/results/${encodeURIComponent(infoAudioFilename)}?v=${cacheVersion}`
        });


    } catch (error) {

        console.error("\n========== PROCESSING ERROR ==========");

        console.error("Error message:", error.message);
        console.error("Exit code:", error.code);

        console.error("\nPYTHON STDOUT:");
        console.error(error.stdout || "No stdout available");

        console.error("\nPYTHON STDERR:");
        console.error(error.stderr || "No stderr available");

        console.error("======================================\n");

        const details = [
            error.stderr,
            error.stdout,
            error.message
        ].filter(Boolean).join("\n\n");

        res.status(500).json({

            success: false,

            message: details ||
                "Animal generation failed."

        });

    } finally {

        isProcessing = false;

    }


});


// ==========================================
// START SERVER
// ==========================================

app.listen(5000, () => {

    console.log(
        "Audio server running on http://localhost:5000"
    );

    console.log("Sounds folder:", soundsFolder);

    console.log("Python folder:", pythonFolder);

    console.log("Results folder:", resultsFolder);

});
