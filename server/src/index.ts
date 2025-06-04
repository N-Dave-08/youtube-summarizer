import express, { Request, Response } from "express";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 5000;

dotenv.config();

const OUTPUT_BASE = path.join(__dirname, "..", "output");
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "7", 10);

const jobProgress: Record<string, number> = {};
const jobResults: Record<string, string> = {};

function getOutputDir(videoId: string) {
  return path.join(OUTPUT_BASE, videoId);
}

function cleanupOldFiles() {
  const now = Date.now();
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(OUTPUT_BASE)) return;
  fs.readdirSync(OUTPUT_BASE).forEach((videoId) => {
    const dir = path.join(OUTPUT_BASE, videoId);
    try {
      const stats = fs.statSync(dir);
      if (stats.isDirectory()) {
        // Check the mtime of the directory
        if (now - stats.mtimeMs > retentionMs) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    } catch (e) {
      // Ignore errors
    }
  });
}

// Schedule cleanup every 12 hours
setInterval(cleanupOldFiles, 12 * 60 * 60 * 1000);
// Run cleanup on startup
cleanupOldFiles();

app.use(cors());
app.use(express.json());

console.log('Server CWD:', process.cwd());

function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function getVideoId(url: string): string | null {
  const match = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/);
  return match ? match[1] : null;
}

app.post("/summarize", async (req: Request, res: Response) => {
  const { prompt } = req.body;
  const jobId = uuidv4();
  jobProgress[jobId] = 0;
  res.setHeader('Content-Type', 'application/json');

  (async () => {
    try {
      if (isYouTubeUrl(prompt)) {
        const videoId = getVideoId(prompt);
        if (!videoId) {
          jobProgress[jobId] = -1;
          console.log(`[${jobId}] Invalid YouTube URL`);
          return;
        }
        const outputDir = getOutputDir(videoId);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const audioFile = path.join(outputDir, `${videoId}.mp3`);
        const transcriptFile = path.join(outputDir, `${videoId}.txt`);
        if (!fs.existsSync(audioFile)) {
          jobProgress[jobId] = 10;
          console.log(`[${jobId}] Step: Downloading audio...`);
          await new Promise((resolve, reject) => {
            const ytdlp = spawn("yt-dlp", [
              "-x",
              "--audio-format",
              "mp3",
              "--restrict-filenames",
              "-o",
              path.join(outputDir, `${videoId}.%(ext)s`),
              prompt,
            ]);
            ytdlp.on("close", (code) => {
              if (code === 0) resolve(0);
              else reject(new Error("yt-dlp failed"));
            });
          });
        }
        jobProgress[jobId] = 33;
        console.log(`[${jobId}] Step: Transcribing audio...`);
        if (!fs.existsSync(transcriptFile)) {
          await new Promise((resolve, reject) => {
            const whisper = spawn("whisper", [audioFile, "--model", "base", "--language", "en", "--output_dir", outputDir]);
            whisper.on("close", (code) => {
              if (code === 0) resolve(0);
              else reject(new Error("whisper failed"));
            });
          });
        }
        jobProgress[jobId] = 66;
        console.log(`[${jobId}] Step: Summarizing...`);
        const transcript = fs.readFileSync(transcriptFile, "utf8");
        const systemPrompt = `
You are a helpful AI assistant. I will provide the full transcript of a YouTube video. Your task is to summarize the content clearly and concisely.

Please follow this structure in your response:

1. **Title Suggestion** – Generate a compelling and accurate title based on the content.
2. **Concise Summary** – Write a paragraph summarizing the main topic and key points discussed.
3. **Key Takeaways** – List 5 to 10 bullet points highlighting the most important insights, ideas, or facts presented.
4. **Notable Quotes** – Include 2 to 3 impactful or thought-provoking quotes from the speaker.
5. **Intended Audience** – Who would benefit most from this video?
6. **Call to Action (if applicable)** – If the speaker encourages the audience to act on something, mention it.
7. **Tone and Style** – Describe the speaker's tone (e.g., motivational, educational, humorous).

Here is the transcript:
---
${transcript}
`;
        const ollama = spawn("ollama", ["run", "mistral"]);
        let output = "";
        let errorOutput = "";
        ollama.stdin.write(systemPrompt + "\n");
        ollama.stdin.end();
        ollama.stdout.on("data", (data) => {
          output += data.toString();
        });
        ollama.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });
        ollama.on("close", (code) => {
          jobProgress[jobId] = 100;
          jobResults[jobId] = code === 0 ? output : errorOutput || "Error generating summary.";
          console.log(`[${jobId}] Step: Done!`);
        });
      } else {
        jobProgress[jobId] = 33;
        console.log(`[${jobId}] Step: Summarizing (text input)...`);
        const ollama = spawn("ollama", ["run", "mistral"]);
        let output = "";
        let errorOutput = "";
        ollama.stdin.write(prompt + "\n");
        ollama.stdin.end();
        ollama.stdout.on("data", (data) => {
          output += data.toString();
        });
        ollama.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });
        ollama.on("close", (code) => {
          jobProgress[jobId] = 100;
          jobResults[jobId] = code === 0 ? output : errorOutput || "Error generating summary.";
          console.log(`[${jobId}] Step: Done!`);
        });
      }
    } catch (err: any) {
      jobProgress[jobId] = -1;
      jobResults[jobId] = err.message || "Unknown error";
      console.log(`[${jobId}] Step: Error - ${err.message}`);
    }
  })();
  res.json({ jobId });
});

app.get("/progress/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const progress = jobProgress[jobId];
  const summary = jobResults[jobId];
  res.json({ progress, summary });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
