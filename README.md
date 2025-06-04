# YouTube Summarizer

## Overview

**YouTube Summarizer** is a Node.js/Express backend service that:
- Accepts a YouTube URL or text input.
- For YouTube URLs: downloads the audio, transcribes it, and summarizes the content using an LLM (Ollama with the Mistral model).
- For text input: directly summarizes the provided text.
- Returns a structured summary, including title, key points, quotes, audience, and more.
- Tracks job progress and provides a polling endpoint for clients.

---

## Features

- **YouTube Audio Download:** Uses `yt-dlp` to fetch and extract audio from YouTube videos.
- **Transcription:** Uses `whisper` (OpenAI's Whisper CLI) to transcribe audio to text.
- **Summarization:** Uses `ollama` to run the Mistral LLM for generating structured summaries.
- **Job Tracking:** Each summarization request is tracked by a unique job ID, with progress and result polling.
- **Automatic Cleanup:** Old output files are deleted after a configurable retention period.

---

## Project Structure

```
server/
  src/
    index.ts         # Main Express server and logic
  output/            # Stores audio, transcripts, and summaries (auto-managed)
.env                 # Environment variables (optional)
```

---

## Prerequisites

### 1. Node.js and npm
- [Download and install Node.js (includes npm)](https://nodejs.org/)
- Verify installation:
  ```sh
  node -v
  npm -v
  ```

### 2. yt-dlp
- **Windows:**
  - Download the latest `yt-dlp.exe` from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and place it in a folder included in your PATH (e.g., `C:\Windows`).
  - Or install via pip:
    ```sh
    pip install -U yt-dlp
    ```
- **Unix/macOS:**
  ```sh
  pip install -U yt-dlp
  # or
  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  sudo chmod a+rx /usr/local/bin/yt-dlp
  ```

### 3. Whisper CLI
- **Requires Python 3.8+ and pip**
- Install:
  ```sh
  pip install git+https://github.com/openai/whisper.git 
  # or
  pip install openai-whisper
  ```
- Test installation:
  ```sh
  whisper --help
  ```

### 4. Ollama (with Mistral model)
- [Install Ollama](https://ollama.com/download)
- After installation, run:
  ```sh
  ollama pull mistral
  ```
- Ensure `ollama` is in your PATH and running.

---

## Setup & Installation

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd youtube-summarizer/server
   ```

2. **Install Node.js dependencies:**
   ```sh
   npm install
   ```

3. **Configure environment variables (optional):**
   Create a `.env` file in the `server` directory:
   ```
   RETENTION_DAYS=7
   ```

4. **Run the server:**
   ```sh
   npm start
   ```
   The server will run on [http://localhost:5000](http://localhost:5000) by default.

---

## API Endpoints

### 1. `POST /summarize`

**Description:**  
Starts a new summarization job for a YouTube URL or text input.

**Request Body:**
```json
{
  "prompt": "<YouTube URL or text to summarize>"
}
```

**Response:**
```json
{
  "jobId": "<unique-job-id>"
}
```

**Behavior:**
- If the prompt is a YouTube URL:
  - Downloads audio using `yt-dlp`.
  - Transcribes audio using `whisper`.
  - Summarizes transcript using `ollama` (Mistral model).
- If the prompt is plain text:
  - Directly summarizes the text using `ollama`.

---

### 2. `GET /progress/:jobId`

**Description:**  
Polls the progress and result of a summarization job.

**Response:**
```json
{
  "progress": <number>,   // Progress percentage: 0-100, or -1 for error
  "summary": "<summary or error message>"
}
```

**Progress Values:**
- `0`: Job created
- `10`: Downloading audio (YouTube)
- `33`: Transcribing audio (YouTube) or summarizing (text)
- `66`: Summarizing (YouTube)
- `100`: Done
- `-1`: Error

---

## Environment Variables

- `RETENTION_DAYS` (default: `7`):  
  Number of days to retain output files (audio, transcripts, summaries) before automatic deletion.

---

## Internal Logic

### Job Management
- Each request is assigned a unique `jobId` (UUID).
- Progress and results are tracked in memory (`jobProgress`, `jobResults`).
- Output files are stored in `server/output/<videoId>/`.

### Cleanup
- Every 12 hours, the server deletes output directories older than `RETENTION_DAYS`.
- Cleanup also runs once on server startup.

### Summarization Prompt
The LLM is prompted to return a structured summary with:
1. Title Suggestion
2. Concise Summary
3. Key Takeaways (5-10 bullet points)
4. Notable Quotes (2-3)
5. Intended Audience
6. Call to Action (if any)
7. Tone and Style

---

## Error Handling

- If a YouTube URL is invalid or any step fails, progress is set to `-1` and an error message is stored in `jobResults`.
- The `/progress/:jobId` endpoint will return the error message.

---

## Example Usage

### Summarize a YouTube Video

```sh
curl -X POST http://localhost:5000/summarize \
  -H "Content-Type: application/json" \
  -d '{"prompt": "https://www.youtube.com/watch?v=XXXXXXXXXXX"}'
```

### Poll for Progress

```sh
curl http://localhost:5000/progress/<jobId>
```

---

## Notes

- The server does not persist job progress/results across restarts.
- Ensure `yt-dlp`, `whisper`, and `ollama` are installed and accessible in your system PATH.
- The summarization quality depends on the models and their local setup.

---

## License

Specify your license here.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Contact

For questions or support, contact [your-email@example.com].
