# RoundTable AI

An automated, privacy-aware public speaking and group discussion assessment platform that analyzes multi-speaker verbal interactions and generates rubric-based evaluation scorecards using speech digital signal processing, speech-to-text diarization, acoustic/linguistic analytics, and anonymized AI evaluation.

**Project Status**: Local development and system audit completed. Prepared for repository publication and production single-host deployment.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Docker Architecture](#docker-architecture)
- [External API Integrations](#external-api-integrations)
- [API Architecture](#api-architecture)
- [Security & Privacy Controls](#security--privacy-controls)
- [Testing & Verification](#testing--verification)
- [Deployment Architecture](#deployment-architecture)
- [Production Deployment Checklist](#production-deployment-checklist)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Project Documentation](#project-documentation)
- [License](#license)

---

## Overview

Evaluating candidate performance in Group Discussions (GD) and public speaking assessments is essential for academic placement drives, corporate recruitment, and competitive evaluations. Traditional manual evaluation often suffers from evaluator cognitive fatigue, subjective scoring variance, lack of verifiable evidence, and an inability to track physical acoustic parameters across multiple speakers simultaneously.

**RoundTable AI** addresses these challenges by orchestrating local audio signal processing and cloud speech services:
- Isolates individual candidate dialogue turns from continuous audio recordings.
- Computes objective physical acoustic features (pitch frequency and range, loudness energy, pause distributions) and transcript metrics (speaking pace, filler word disfluencies, lexical diversity).
- Evaluates candidates across standardized communication rubrics using anonymized AI prompts that eliminate evaluative bias.
- Enforces strict data governance, participant consent tracking, and complete consent revocation data wiping.

---

## Key Features

### Speech & Audio Processing
- **Dual Audio Ingestion**: Supports live browser audio capture using WebAudio APIs (WaveSurfer.js) and file uploads (`.wav`, `.mp3`, `.m4a`, `.webm`) up to 300MB with duration validation (30 seconds to 90 minutes).
- **Audio Normalization**: Standardizes raw audio streams via `ffmpeg` into a uniform 16kHz single-channel (mono) 16-bit uncompressed WAV file format.
- **Automatic Speech Recognition (ASR)**: Transcribes verbal dialogue using AssemblyAI Universal-2 speech recognition with disfluency tracking.
- **Speaker Diarization**: Separates multi-speaker dialogue turns into distinct voice clusters.
- **Human-in-the-Loop Speaker Mapping**: Generates 5-second audio preview snippets per speaker cluster via `ffmpeg`, enabling administrators to map generic speaker labels (`Speaker A`, `Speaker B`) to verified candidate names.

### Speech & Acoustic Analytics
- **Pitch Tracking**: Computes mean voiced fundamental pitch ($F_0$) in Hertz ($\text{Hz}$) and pitch range in logarithmic semitones ($12 \times \log_2(F_{\max}/F_{\min})$) using Praat-Parselmouth autocorrelation.
- **Loudness Energy**: Calculates Root-Mean-Square (RMS) amplitude mean and standard deviation per speaker via Librosa.
- **Voice Activity Detection (VAD) & Pauses**: Analyzes 30ms audio frames using Google WebRTC VAD (`webrtcvad`) to track non-speech blocks $\ge 300\text{ms}$, computing total pause count and average pause duration.
- **Spectral Image Generation**: Renders session Waveform and Log-Frequency Spectrogram PNG graphics using Matplotlib.
- **Speaking Pace (WPM)**: Calculates Words Per Minute based on active speaking time.
- **Participation & Turns**: Measures individual speaking duration, participation percentage share, turn count, and mean turn duration.
- **Disfluency Scanning**: Scans transcripts for filler words (`um`, `uh`, `hm`, `mm`, `erm`) to calculate filler word counts and disfluency rates.
- **Vocabulary Diversity (MTLD)**: Measures lexical richness using McCarthy & Jarvis's Measure of Textual Lexical Diversity (MTLD) with a Type-Token Ratio threshold of 0.72.

### Anonymized Rubric Scoring & Reporting
- **Competency Rubrics**: Evaluates candidates out of 100 on four competencies: *Topic Relevance*, *Initiative & Engagement*, *Coherence & Structure*, and *Responsiveness*.
- **Identity Token Masking**: Replaces candidate display names with opaque tokens (`[TARGET STUDENT]`) before sending transcript metrics to LLM providers.
- **LLM Provider Routing & Fallback**: Evaluates candidate prompts using Google Gemini 2.0 Flash, with automatic rate-limit fallback to Groq (Llama 3.1 8B Instant).
- **Cohort Leaderboard**: Displays global candidate rankings, aggregate scores, and session completion records.
- **Scorecard View**: Provides candidate evaluation cards with expandable accordion rationales, speech statistics, strengths, and areas for improvement.
- **CSV Data Export**: Generates downloadable RFC 4180-compliant CSV files containing candidate metrics, scores, and utterances.

### Privacy & Data Controls
- **Explicit Consent Verification**: Requires recorded administrator confirmation of candidate consent before allowing audio processing.
- **Consent Revocation Data Wiping**: Invoking `POST /api/sessions/:id/withdraw` purges session audio files, generated plots, and database records from disk and database tables.

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Session   │ ──> │ 2. Audio     │ ──> │ 3. Speech    │
│    Setup     │     │    Upload    │     │    Diarize   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 6. Scorecard │ <── │ 5. Text &    │ <── │ 4. Speaker   │
│    Reporting │     │    Acoustics │     │    Mapping   │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. **Session Setup**: Administrator creates a session by entering topic, expected speaker count (3 to 6 candidates), and display names.
2. **Audio Ingestion**: Audio is recorded live or uploaded. Server validates consent, probes duration, and normalizes audio to 16kHz mono WAV.
3. **ASR & Diarization**: Background worker sends audio to AssemblyAI, returning timestamped dialogue utterances and speaker clusters.
4. **Speaker Mapping**: Administrator listens to 5-second audio snippets generated by `ffmpeg` and maps speaker tags to candidate names.
5. **Dual Analytics Execution**:
   - *Acoustic Path*: Python FastAPI service computes pitch semitones, RMS loudness, WebRTC VAD pauses, waveforms, and spectrograms.
   - *Linguistic Path*: Node.js worker computes WPM, turn counts, filler rates, and MTLD lexical diversity scores.
6. **Anonymized AI Scoring & Dashboard**: Display names are tokenized (`[TARGET STUDENT]`), transcripts/metrics are evaluated by Gemini or Groq, and structured scorecards are stored in PostgreSQL and rendered on the web dashboard.

---

## System Architecture

```mermaid
graph TD
    User["User Browser (Port 3000)"]
    
    subgraph AppContainer["App Docker Container (Node.js / Express)"]
        Frontend["React 19 / Vite SPA (dist/)"]
        Express["Express Backend Gateway & Job Queue Daemon"]
    end
    
    subgraph DSPContainer["DSP Docker Container (Python 3.11 / FastAPI)"]
        DSP["FastAPI Service (Parselmouth, Librosa, WebRTC VAD)"]
    end
    
    subgraph PostgresContainer["Postgres Docker Container (PostgreSQL 16)"]
        DB[(PostgreSQL Database)]
    end
    
    subgraph SharedDisk["Shared Docker Volume (/data)"]
        AudioFiles["Session WAV Audios & Matplotlib PNG Plots"]
    end
    
    subgraph ExternalAPIs["External Cloud APIs"]
        AssemblyAI["AssemblyAI API (ASR & Diarization)"]
        Gemini["Google Gemini API (Primary Rubric LLM)"]
        Groq["Groq API (Llama 3.1 Fallback LLM)"]
    end

    User -->|HTTP REST APIs| Express
    Express -->|Serves Static Bundle| Frontend
    Express -->|Prisma ORM Queries| DB
    Express -->|Internal HTTP POST :8000| DSP
    Express -->|Read / Write WAV & Snippets| SharedDisk
    DSP -->|Read WAV & Write PNG Plots| SharedDisk
    Express -->|HTTPS ASR Request| AssemblyAI
    Express -->|HTTPS Prompt Evaluation| Gemini
    Express -->|HTTPS Fallback Evaluation| Groq
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend UI** | React 19, Vite 8, Tailwind CSS | Single-page interface, glassmorphic dark theme, motion animations |
| **Backend Gateway** | Node.js (v23), Express (v5) | REST APIs, static file serving, auth cookies, multer audio ingestion |
| **Database ORM** | Prisma ORM, PostgreSQL 16 | Relational data persistence, schema migrations, ACID transactions |
| **DSP Microservice** | Python 3.11, FastAPI, Uvicorn | Dedicated signal processing microservice |
| **Acoustic Processing** | Praat-Parselmouth, Librosa, WebRTC VAD | Pitch semitone calculation, RMS energy, 300ms pause tracking |
| **Plot Rendering** | Matplotlib | Headless waveform and STFT spectrogram PNG rendering |
| **ASR & Diarization** | AssemblyAI Universal-2 API | Speech recognition, utterance timestamps, speaker diarization |
| **Generative Scoring** | Google Gemini API (2.0 Flash) | Anonymized competency scoring and rationale writing |
| **LLM Fallback** | Groq API (Llama 3.1 8B Instant) | Automated rate-limit fallback provider |
| **Media Preprocessing** | `ffmpeg` CLI, `fluent-ffmpeg` | Audio normalization to 16kHz mono WAV & 5s snippet slicing |
| **Container Runtime** | Docker, Docker Compose | Multi-service orchestration (`app`, `dsp`, `postgres`) |

---

## Project Structure

```
mini project/
├── .env.example                     # Environment variable template (no secrets)
├── docker-compose.yml               # Production & local Docker Compose stack
├── docker/
│   ├── app.Dockerfile               # Multi-stage Dockerfile for React + Node app
│   └── dsp.Dockerfile               # Python 3.11 Dockerfile with Praat & Librosa
├── app/
│   ├── index.html                   # HTML entry point
│   ├── package.json                 # Frontend/backend Node.js dependencies
│   ├── src/
│   │   ├── App.tsx                  # Main single-page router & state container
│   │   ├── App.css                  # Custom styling & responsive layouts
│   │   ├── server.ts                # Express REST gateway & static server
│   │   ├── components/              # UI widgets (Recording, StepTracker, Mapping)
│   │   ├── features/
│   │   │   ├── auth/                # Admin seed & password verification
│   │   │   ├── dashboard/           # Leaderboard & Session gallery views
│   │   │   ├── jobs/                # Background worker queue & retry logic
│   │   │   ├── scoring/             # Scorecards, PII masking & LLM providers
│   │   │   ├── sessions/            # Audio upload, consent & ffmpeg normalization
│   │   │   └── speech-metrics/      # WPM, MTLD, turn-taking & filler algorithms
│   │   └── lib/                     # DB client (Prisma) & env validation (Zod)
├── dsp_service/
│   ├── main.py                      # FastAPI microservice endpoint
│   ├── analysis.py                  # Pitch, RMS, VAD pause & plot functions
│   └── requirements.txt             # Python dependencies
├── prisma/
│   ├── schema.prisma                # Relational database schema
│   └── migrations/                  # Migration SQL history
├── README.md                        # Project documentation
├── BUILD_LOG.md                     # Development milestone logs
└── HANDOFF.md                       # Architecture handoff documentation
```

---

## Prerequisites

To run this application locally or on a deployment server, ensure the following are installed:

- **Docker Engine**: Version 24.0+
- **Docker Compose**: Version v2.20+
- **Node.js** (Optional, for local development outside Docker): Version 23.5+
- **Python** (Optional, for local development outside Docker): Version 3.11+
- **ffmpeg** (Optional, for local development outside Docker): Available on system path

---

## Environment Variables

Copy `.env.example` to `.env` in the root directory. Configure the following environment variables:

```env
POSTGRES_PASSWORD=roundtable_dev_pass
DATABASE_URL=postgresql://roundtable:roundtable_dev_pass@postgres:5432/roundtable?connection_limit=10
APP_BASE_URL=http://localhost:3000
DSP_SERVICE_URL=http://dsp:8000
BETTER_AUTH_SECRET=devsecret123456789012345678901234567890

ASSEMBLYAI_API_KEY=your_assemblyai_api_key
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key

SEED_ADMIN_EMAIL=admin@roundtable.local
SEED_ADMIN_PASSWORD=roundtable-admin
INSTITUTION_NAME=RoundTable AI Institute
```

| Variable Name | Description |
|---|---|
| `POSTGRES_PASSWORD` | Password for PostgreSQL container initialization |
| `DATABASE_URL` | Prisma SQL database connection string |
| `APP_BASE_URL` | Base URL of the web application |
| `DSP_SERVICE_URL` | Internal Docker URL for the Python DSP service |
| `BETTER_AUTH_SECRET` | Secret key for session cookie encryption |
| `ASSEMBLYAI_API_KEY` | API key for AssemblyAI ASR and speaker diarization |
| `GEMINI_API_KEY` | API key for Google Gemini generative rubric evaluation |
| `GROQ_API_KEY` | API key for Groq (Llama 3.1 8B) fallback evaluation |
| `SEED_ADMIN_EMAIL` | Default administrator account email |
| `SEED_ADMIN_PASSWORD` | Default administrator account password |
| `INSTITUTION_NAME` | Name of the evaluating institution |

---

## Local Setup

1. **Clone the Repository**:
   ```bash
   git clone <repository-url> "mini project"
   cd "mini project"
   ```

2. **Configure Environment File**:
   ```bash
   cp .env.example .env
   ```
   *(Edit `.env` to include your AssemblyAI, Gemini, and Groq API keys).*

3. **Start the Multi-Container Stack**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify Application Boot**:
   ```bash
   docker compose ps
   ```

5. **Access the Application**:
   Open **`http://localhost:3000`** in your browser.
   - **Default Admin Email**: `admin@roundtable.local`
   - **Default Admin Password**: `roundtable-admin`

---

## Docker Architecture

The application runs as three coordinated containers defined in `docker-compose.yml`:

- **`app` Container**:
  - Contains the built React frontend (`/app/dist`) and Express backend (`/app/dist-server`).
  - Listens on host port `3000`.
  - Connects to `postgres` on port `5432` and `dsp` on port `8000`.
- **`dsp` Container**:
  - Runs Python 3.11 with FastAPI, Uvicorn, Praat-Parselmouth, and Librosa.
  - Listens on internal port `8000`.
- **`postgres` Container**:
  - Runs PostgreSQL 16 Alpine image.
  - Mounts persistent database volume `pgdata`.
- **Shared Storage Volume (`audio_data`)**:
  - Mounted to `/data` in both `app` and `dsp` containers. Audio files, audio snippets, and Matplotlib PNG graphics are stored here.

---

## External API Integrations

| Service | Purpose | Used By | Fallback Behavior |
|---|---|---|---|
| **AssemblyAI** | Speech recognition & diarization | Node.js Worker (`worker.ts`) | If key is missing/empty, uses synthetic mock transcript path for offline testing. |
| **Google Gemini** | Anonymized rubric evaluation | Node.js Scoring (`score-participant.ts`) | Primary model (`gemini-2.0-flash`). Swaps to Groq if rate limits (429) occur. |
| **Groq (Llama 3.1 8B)** | LLM Fallback provider | Node.js Scoring (`score-participant.ts`) | Invoked automatically if Gemini returns rate limits or API errors. |

*All API keys are securely stored server-side and are never sent to or accessible by the browser client.*

---

## API Architecture

Major Express REST API endpoints implemented in `server.ts` and `score.routes.ts`:

- **Authentication**:
  - `POST /api/login` — Authenticate admin credentials and issue HTTP-only cookie.
  - `POST /api/logout` — Invalidate session token and clear authentication cookie.
  - `GET /api/session` — Retrieve active session profile.
- **Sessions & Processing**:
  - `GET /api/sessions` — List created discussions and session metadata.
  - `POST /api/sessions` — Create a new session setup with participant names.
  - `POST /api/sessions/:id/consent` — Record participant consent confirmation.
  - `POST /api/sessions/:id/upload` — Ingest audio recording, validate duration, and normalize to 16kHz mono WAV.
  - `GET /api/sessions/:id/status` — Fetch job queue status, detected speaker labels, and mapping state.
  - `POST /api/sessions/:id/map-speakers` — Submit human-in-the-loop voice-to-candidate mappings.
  - `POST /api/sessions/:id/withdraw` — Withdraw consent, purge local audio files/plots, and delete database records.
- **Scoring & Reports**:
  - `GET /api/scoring` — Fetch cohort scorecards and global leaderboard data.
  - `GET /api/scoring/:sessionId` — Fetch granular participant scores, metrics, rationales, and synchronized transcript.
  - `GET /api/sessions/:id/export` — Download RFC 4180-compliant CSV report of session metrics and scorecards.

---

## Security & Privacy Controls

- **Server-Side API Credentials**: Third-party API keys remain enclosed in server environment variables. Zero `VITE_` keys exist in frontend bundles.
- **Git Protection**: Root `.env` file is excluded in `.gitignore` and has never been committed. `.env.example` contains zero real secrets.
- **PII Anonymization**: Student display names are masked as `[TARGET STUDENT]` prior to sending transcripts and metrics to LLM endpoints.
- **Explicit Consent Records**: File uploads require prior consent logging (`prisma.consentRecord`).
- **Consent Revocation & Right to Erasure**: Executing `POST /api/sessions/:id/withdraw` triggers transaction deletion in PostgreSQL and deletes audio files and plot images from `/data`.
- **Isolated DSP Network**: The Python DSP container is enclosed within the internal Docker bridge network (`miniproject_default`) and is not exposed to the public internet.

---

## Testing & Verification

The codebase has undergone system testing across the following layers:

- **Frontend Production Build**: Tested via `npm run build` inside `app/` (`tsc -b` and `vite build`). Verified 0 compilation errors.
- **Multi-Container Stack Execution**: Tested via `docker compose up -d --build`. Verified all 3 containers (`app`, `dsp`, `postgres`) launch cleanly into an `Up` status.
- **Inter-Service Connectivity**: Tested HTTP communication between `app` and `dsp` microservices (`http://dsp:8000/health`), confirming `{"status": "ok"}` responses.
- **Acoustic Signal Analytics**: Verified Praat-Parselmouth pitch tracking in semitones, Librosa RMS energy, WebRTC VAD pause tracking ($\ge 300\text{ms}$), and Matplotlib PNG plot rendering.
- **Real & Fallback API Routing**: Tested real AssemblyAI diarization, real Gemini Flash scoring, automated Groq Llama 3 rate-limit fallback, and synthetic offline fallback modes.
- **CSV Export & Data Erasure**: Verified CSV report downloads and tested consent withdrawal deletion routines.

---

## Deployment Architecture

The intended production architecture is a **single-host Linux VPS deployment** running Docker Engine:

```
Internet (HTTPS 443)
       │
       ▼
[Nginx Reverse Proxy + Let's Encrypt SSL]
       │
       ▼ (Proxy to Port 3000)
[Ubuntu Linux VPS / Docker Compose]
       ├──> app Container (Express Gateway + React SPA)
       ├──> dsp Container (Python FastAPI / Parselmouth)
       ├──> postgres Container (PostgreSQL 16)
       └──> /data Volume (Persistent Audio & Plot Storage)
```

The React frontend and Express backend are served together from the single `app` Docker container on port 3000 behind an Nginx reverse proxy providing HTTPS SSL termination.

---

## Production Deployment Checklist

- [ ] Provision Ubuntu 22.04 LTS VPS (Minimum: 2 vCPU, 4GB RAM, 25GB SSD).
- [ ] Install Docker Engine and Docker Compose.
- [ ] Clone repository to host server.
- [ ] Copy `.env.example` to `.env` and set production passwords and secrets.
- [ ] Configure live API keys (`ASSEMBLYAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`).
- [ ] Launch container stack using `docker compose up -d --build`.
- [ ] Configure domain DNS A Record pointing to VPS public IP.
- [ ] Install Nginx and issue Let's Encrypt SSL certificate via `certbot --nginx`.
- [ ] Verify endpoint status via `http://127.0.0.1:3000/api/health`.
- [ ] Execute an end-to-end test session using a sample group discussion recording.

---

## Known Limitations

- **Single-Host Target**: Designed for single-host Docker Compose deployment. Horizontal scaling across multiple server nodes requires configuring shared cloud object storage (S3/GCS) and external managed database instances.
- **Overlapping Speech**: Diarization quality depends on AssemblyAI's cluster model; heavy overlapping cross-talk can cause speaker cluster merging.
- **API Dependencies**: Live transcription and LLM evaluation rely on external internet connectivity to AssemblyAI, Google Gemini, or Groq endpoints.

---

## Future Improvements

*(Note: These items are conceptual enhancements for future iterations and are NOT currently implemented).*

- **Air-Gapped Offline Models**: Replacing external cloud ASR/LLM services with self-hosted local Whisper (ASR) and Ollama/Llama 3 (LLM) containers for 100% offline deployments.
- **Cloud Object Storage Integration**: Adding AWS S3 or Google Cloud Storage adapters for audio storage to enable multi-node horizontal backend scaling.
- **Multimodal Video Analytics**: Incorporating MediaPipe / OpenCV facial tracking to analyze visual eye contact, gestures, and non-verbal candidate engagement alongside vocal features.

---

## Project Documentation

Detailed project documentation files located in the repository:

- [`BUILD_LOG.md`](file:///c:/Users/DIKSHITA/OneDrive/Desktop/mini%20project/BUILD_LOG.md) — Development milestone log and phase completion records.
- [`HANDOFF.md`](file:///c:/Users/DIKSHITA/OneDrive/Desktop/mini%20project/HANDOFF.md) — Architecture handoff notes and operational guidelines.
- [`RoundTableAI_Architecture_Plan (1) (1).md`](file:///c:/Users/DIKSHITA/OneDrive/Desktop/mini%20project/RoundTableAI_Architecture_Plan%20%281%29%20%281%29.md) — Technical specifications and hosting decision document.

---

## License

No public license has been specified for this repository. All rights reserved by the project authors.
