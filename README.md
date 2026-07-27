# RoundTable AI — Multi-Speaker Group Discussion Assessment Platform

[![Live Console](https://img.shields.io/badge/Live_Console-roundtable--ai.vercel.app-7C3AED?style=for-the-badge&logo=vercel&logoColor=white)](https://roundtable-ai.vercel.app/)
[![API Status](https://img.shields.io/badge/API_Status-Online-10B981?style=for-the-badge&logo=render&logoColor=white)](https://roundtable-backend-z8fu.onrender.com/api/health)
[![DSP Engine](https://img.shields.io/badge/DSP_Engine-Online-3B82F6?style=for-the-badge&logo=python&logoColor=white)](https://roundtable-dsp.onrender.com/health)
[![Database](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B.svg?style=for-the-badge)](LICENSE)

A production-grade, privacy-aware AI operations console for transcribing, segmenting, extracting acoustic/linguistic signals, and evaluating candidate performance in multi-speaker Group Discussions (GD) — powered by AssemblyAI Universal-2 speech diarization, Python acoustic signal processing, and Groq Llama 3.1 LLM rubric scoring.

[Live Platform →](https://roundtable-ai.vercel.app/) &nbsp;|&nbsp; [Backend API →](https://roundtable-backend-z8fu.onrender.com/api/health) &nbsp;|&nbsp; [DSP Service →](https://roundtable-dsp.onrender.com/health)

---

## 🎯 The Problem Placement Teams & Recruiters Face

During university placement drives and corporate hiring campaigns, institutions evaluate thousands of candidates across multi-speaker Group Discussions (GD). Evaluators encounter severe operational bottlenecks:

- **Subjective Airtime Dominance Bias**: Loud candidates who dominate time are frequently misjudged as high performers, while structured speakers who deliver high-value points are under-scored.
- **Human Cognitive Fatigue**: Evaluators cannot manually track fundamental pitch frequencies ($f_0$), speech velocity (WPM), filler disfluencies, and pause distributions across 3–8 concurrent speakers in real time.
- **Lack of Verifiable Feedback**: Candidates receive vague rejection notices without concrete evidence or actionable breakdown of their communication strengths and weaknesses.
- **Privacy & Compliance Risk**: Recording student audio without explicit consent tracking or data revocation rights violates modern institution privacy standards.

**RoundTable AI solves this.** It orchestrates end-to-end multi-speaker audio normalization, neural speaker diarization, physical acoustic extraction, and LLM rubric evaluation — generating objective candidate scorecards and interactive signal exploration dashboards in seconds.

---

## 🌐 Live Production Deployment

| Service / Layer | Technology | Live URL / Endpoint | Status |
| :--- | :--- | :--- | :--- |
| **🌐 Frontend Console** | React 19 + TypeScript + Vite | [`https://roundtable-ai.vercel.app`](https://roundtable-ai.vercel.app/) | ![Vercel](https://img.shields.io/badge/Vercel-Live-brightgreen) |
| **⚙️ Backend API** | Node.js 22 + Express 5 + Prisma | [`https://roundtable-backend-z8fu.onrender.com`](https://roundtable-backend-z8fu.onrender.com/api/health) | ![Render](https://img.shields.io/badge/Render-Live-brightgreen) |
| **🐍 Audio DSP Engine** | Python 3.11 + FastAPI + Librosa | [`https://roundtable-dsp.onrender.com`](https://roundtable-dsp.onrender.com/health) | ![Render](https://img.shields.io/badge/Render-Live-brightgreen) |
| **🗄️ Database** | Neon Serverless PostgreSQL | `postgresql://neondb_owner:...@neon.tech/neondb` | ![Neon](https://img.shields.io/badge/Neon-Cloud_Host-brightgreen) |
| **🤖 Speech Diarization** | AssemblyAI Universal-2 API | `https://api.assemblyai.com/v2` | ![AssemblyAI](https://img.shields.io/badge/AssemblyAI-Active-blue) |
| **⚡ AI LLM Scoring** | Groq Llama 3.1 8B Instant | `https://api.groq.com/openai/v1` | ![Groq](https://img.shields.io/badge/Groq-Active-purple) |
| **📡 Heartbeat Monitor** | UptimeRobot 5-Min Ping | Pinging `/api/health` & `/health` 24/7 | ![UptimeRobot](https://img.shields.io/badge/UptimeRobot-100%25_Up-success) |

*All data on the live console is fetched in real-time from the production Render API querying the Neon serverless PostgreSQL database. Zero static mocks or hardcoded responses are used.*

---

## ✨ Platform Feature Modules

| Module | Technical Description |
| :--- | :--- |
| **📊 Active Sessions Dashboard** | Complete session tracker displaying real-time pipeline status (`CREATED`, `UPLOADING`, `TRANSCRIBING`, `MAPPED`, `SCORING`, `COMPLETE`), total duration, participant counts, and one-click actions (`Signal Lab`, `Scorecard`, `Delete`). |
| **🔒 Consent & Normalization Portal** | Enforces participant consent check verification before audio upload. Automatically normalizes raw multi-format audio files (`.mp3`, `.wav`, `.m4a`, `.webm`) into 16kHz mono WAV audio streams using `ffmpeg-static`. |
| **⚡ 5-Stage Assessment Engine** | Pipeline status tracker visualizing progress across 5 distinct stages: Uploaded $\rightarrow$ Diarizing $\rightarrow$ Speaker Mapping $\rightarrow$ Signal Analytics $\rightarrow$ Scoring. Flags speaker count mismatches automatically if diarization detects a different count than expected. |
| **🎙️ Speech Signal Exploration Lab** | Interactive audio exploration deck featuring synchronous HTML5 audio playback with click-to-seek transcript alignment, high-resolution vector Waveform timeline, Log-Frequency Spectrogram plot, and candidate-by-candidate physical metrics. |
| **📈 Multi-Competency Scorecard** | Comprehensive candidate evaluation view displaying aggregate score, 4-tier rubric break-downs with rationales derived from candidate utterances, communication strengths, actionable improvements, and LLM provenance metadata (`is_mock: false`, `llm_provider: "groq"`). |
| **🏆 Cohort Leaderboard & CSV Export** | Institutional ranking view ranking all candidates across sessions with average score indicators, breakdown statistics, and 1-click full institutional CSV data export. |
| **🗑️ Hard-Delete Data Wipe** | Foreign-key safe session deletion endpoint (`DELETE /api/sessions/:id`) that completely wipes session rows, consent records, utterances, speech metrics, scores, and server audio disk files in 1 click. |

---

## 🧮 Signal Analytics & Scoring Formal Specifications

### 1. Acoustic Signal Component Formulas

#### Words Per Minute (WPM)
Pace of delivery per candidate evaluated over total active speech duration:
$$\text{WPM}(p) = \frac{\text{Word Count}(p)}{\text{Speaking Time (ms)}(p) / 60000}$$

#### Participation Airtime Percentage
Share of total discussion airtime occupied by candidate $p$ among all $K$ participants:
$$\text{Participation}(p) = \frac{\text{Speaking Time (ms)}(p)}{\sum_{k=1}^{K} \text{Speaking Time (ms)}(k)} \times 100$$

#### Disfluency Filler Rate
Ratio of spoken filler words (*"uh"*, *"um"*, *"like"*, *"you know"*) relative to total words spoken:
$$\text{Filler Rate}(p) = \frac{\text{Filler Word Count}(p)}{\text{Word Count}(p)} \times 100$$

#### Fundamental Pitch Frequency ($f_0$)
Extracted via PyWavelets and Librosa Yin autocorrelation over non-silent audio frames:
$$f_0(p) = \text{Mean}\left( \{ f \in [75\text{Hz}, 400\text{Hz}] \mid \text{Frame Energy} > \theta \} \right)$$

---

### 2. Multi-Competency Rubric Evaluation Formula

Candidate aggregate score $S_{\text{agg}}(p)$ is computed as the arithmetic mean of 4 standardized communication competencies evaluated by Groq Llama 3.1 8B Instant:

$$S_{\text{agg}}(p) = \text{Round}\left( \frac{\text{Topic Relevance} + \text{Initiative \& Engagement} + \text{Coherence \& Structure} + \text{Responsiveness}}{4} \right)$$

| Rubric Component | Score Range | Evaluation Focus |
| :--- | :--- | :--- |
| **Topic Relevance** | $0 - 100$ | Alignment of spoken points with the specific group discussion topic and domain depth. |
| **Initiative & Engagement** | $0 - 100$ | Frequency of opening sub-topics, introducing structured ideas, and active discussion drive. |
| **Coherence & Structure** | $0 - 100$ | Logical flow, absence of fragmented logic, and clarity of argument synthesis. |
| **Responsiveness** | $0 - 100$ | Building upon arguments introduced by other candidates and active listening response quality. |

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Browser (Vite + React 19)"]
        UI["Dashboard / Signal Lab / Scorecard"]
        AudioPlayer["HTML5 Synchronized Audio Player"]
    end

    subgraph API ["Backend Web Server (Render Node.js 22)"]
        Server["Express 5 REST Server"]
        Multer["Multer Upload Handler (16kHz Mono WAV)"]
        Worker["Job Queue Worker"]
        Prisma["Prisma ORM 6"]
    end

    subgraph Database ["Neon Cloud Serverless PostgreSQL"]
        DB[("PostgreSQL DB (Sessions, Utterances, Metrics, Scores)")]
    end

    subgraph DSP ["Audio Signal Microservice (Render Python 3.11)"]
        FastAPI["FastAPI Engine"]
        Librosa["Librosa & PyWavelets (Pitch & Energy)"]
        Plots["Waveform & Spectrogram Generator"]
    end

    subgraph External ["External AI Services"]
        AAI["AssemblyAI Universal-2 (Neural Speaker Diarization)"]
        Groq["Groq Llama 3.1 8B Instant (LLM Rubric Scoring)"]
        Gemini["Google Gemini 2.0 Flash (Fallback LLM)"]
    end

    UI -- "Audio Upload / Auth / Queries" --> Server
    Server --> Multer
    Multer --> Worker
    Worker --> Prisma
    Prisma <--> DB
    Worker -- "Audio Stream Buffer" --> AAI
    Worker -- "Extract Pitch/Energy/Plots" --> FastAPI
    FastAPI --> Librosa --> Plots
    Worker -- "Candidate Utterances Prompt" --> Groq
    Groq -- "429 Rate Limit Fallback" --> Gemini
    Server -- "Stream WAV Audio & SVG Plots" --> AudioPlayer
```

---

## 💻 Technology Stack

### Backend Infrastructure
- **Runtime**: Node.js 22 (ESM)
- **Web Framework**: Express 5.2 (Async handler routing, CORS credentials, Cookie parser)
- **Database ORM**: Prisma ORM 6.19 (PostgreSQL provider, relation cascades)
- **Audio Normalization**: `ffmpeg-static` 4.4, `ffprobe-static` 3.1, `fluent-ffmpeg` 2.1
- **File Uploads**: Multer 2.2 (Disk storage with automatic directory resolution)

### Python DSP Microservice
- **Runtime**: Python 3.11
- **Framework**: FastAPI 0.111 + Uvicorn (Async ASGI server)
- **Acoustic Signal Processing**: Librosa 0.10, NumPy 1.26, SciPy 1.13, PyWavelets 1.6
- **Plot Rendering**: Matplotlib 3.8 (Vector SVG & PNG plot generation)

### AI & Speech Integrations
- **Speech Diarization**: AssemblyAI SDK 4.36 (`universal-2` model, `speaker_labels: true`, disfluency tracking)
- **Primary LLM Scoring**: Groq SDK 1.3 (`llama-3.1-8b-instant`, JSON mode execution)
- **Fallback LLM**: Google Generative AI SDK 0.24 (`gemini-2.0-flash`, `gemini-2.0-flash-lite`)

### Frontend UI / UX
- **Core Framework**: React 19.2 + TypeScript 5.5 + Vite 8.1
- **Styling**: Vanilla CSS tokens + TailwindCSS 4.3
- **Icons & UI Primitives**: Phosphor Icons 2.1, Base UI Tabs 1.6
- **Visual Effects**: Custom Aurora Mesh, Signal Lattice Shader, Glassmorphism Backdrop Blurs

---

## 📂 Repository Layout

```text
RoundTable-AI/
├── app/
│   ├── src/
│   │   ├── components/       ← UI Shell, CommandDock, StepTracker, PremiumFX
│   │   ├── features/
│   │   │   ├── auth/         ← Session auth, bcrypt password verification, seed scripts
│   │   │   ├── dashboard/    ← Active sessions list, Signal Lab interactive player
│   │   │   ├── jobs/         ← Job queue worker, AssemblyAI upload stream handler
│   │   │   ├── scoring/      ← Groq Llama 3.1 & Gemini score engines, rubric prompts
│   │   │   ├── speech-metrics/← WPM, Filler rate, MTLD vocabulary calculator
│   │   │   └── sessions/     ← Audio ffmpeg normalization, probe duration
│   │   ├── lib/              ← apiFetch helper, Prisma client, env validator
│   │   ├── generated/        ← Prisma generated client artifacts
│   │   ├── App.tsx           ← Main SPA router & dashboard views
│   │   └── server.ts         ← Express 5 server entry point & REST endpoints
│   ├── package.json          ← Node dependencies & build pipeline
│   └── tsconfig.json         ← ESM TypeScript configuration
├── dsp_service/
│   ├── main.py               ← FastAPI entry point (/health, /analyze)
│   ├── audio_processing.py   ← Pitch estimation, energy RMS, silence ratios
│   ├── plot_generator.py     ← Matplotlib waveform & spectrogram plot renderer
│   └── requirements.txt      ← Python DSP dependencies
├── prisma/
│   └── schema.prisma         ← PostgreSQL database schema definitions
├── scratch/                  ← Verification scripts & automated diagnostic routines
├── .env.example              ← Environment template configuration
└── README.md                 ← Official System Manual
```

---

## 🛠️ API Endpoint Reference

| Method | Route Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | No | System health status check (UptimeRobot target). |
| `POST` | `/api/login` | No | Authenticates admin credentials (`admin@roundtable.local`). |
| `GET` | `/api/session` | No | Verifies current browser session cookie. |
| `POST` | `/api/logout` | No | Clears authentication session cookies. |
| `GET` | `/api/sessions` | Yes | Retrieves all active assessment sessions ordered by date. |
| `POST` | `/api/sessions` | Yes | Initializes a new session container in PostgreSQL. |
| `POST` | `/api/sessions/:id/consent` | Yes | Records explicit participant consent signature. |
| `POST` | `/api/sessions/:id/upload` | Yes | Uploads raw audio file & normalizes to 16kHz mono WAV. |
| `GET` | `/api/sessions/:id/status` | Yes | Returns real-time 5-stage pipeline processing status. |
| `POST` | `/api/sessions/:id/map-speakers` | Yes | Maps acoustic speaker labels (`A`, `B`) to participant names. |
| `GET` | `/api/sessions/:id/audio` | Yes | Streams single-channel WAV audio file for playback. |
| `GET` | `/api/sessions/:id/plots/waveform` | Yes | Serves vector Waveform plot image (PNG or SVG fallback). |
| `GET` | `/api/sessions/:id/plots/spectrogram` | Yes | Serves vector Spectrogram plot image (PNG or SVG fallback). |
| `GET` | `/api/sessions/:id/export` | Yes | Generates institutional CSV data export of all metrics. |
| `DELETE` | `/api/sessions/:id` | Yes | Permanently wipes session, database rows, & audio disk files. |

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js**: v20+ or v22+
- **Python**: v3.11+
- **Database**: PostgreSQL (or Neon connection string)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/kansalshivam/RoundTable-AI.git
cd RoundTable-AI

# Install Node app dependencies
npm --prefix app install
```

### 2. Configure Environment Variables
Create `app/.env` with your API keys:
```env
DATABASE_URL="postgresql://neondb_owner:npg_iWKdDhVR3Gb7@ep-young-fog-acppgevx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
ASSEMBLYAI_API_KEY="your_assemblyai_key"
GROQ_API_KEY="your_groq_key"
GEMINI_API_KEY="your_gemini_key"
DSP_SERVICE_URL="http://localhost:8000"
JWT_SECRET="roundtable_super_secret_jwt_key_2026"
PORT=3000
```

### 3. Initialize Database & Seed Admin
```bash
# Push Prisma schema to PostgreSQL database
npx prisma db push --schema prisma/schema.prisma

# Seed initial admin user credentials
npm --prefix app run seed:admin
```

### 4. Launch DSP Service & Web App
```bash
# Terminal 1: Launch Python DSP Engine
cd dsp_service
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload

# Terminal 2: Launch Full Node Express & React Dev Environment
npm --prefix app run dev
```

Open `http://localhost:5173` in your browser! Login with:
- **Email**: `admin@roundtable.local`
- **Password**: `roundtable-admin`

---

## 🔒 Security, Privacy & Data Governance

- **Explicit Consent Verification**: No audio recording or upload can be processed without an active signed consent record (`ConsentRecord`).
- **Sanitized LLM Prompts**: Student names are stripped prior to LLM evaluation — only anonymized speaker labels (`Speaker A`, `Speaker B`) and raw transcripts are transmitted.
- **Cross-Site Cookie Protection**: Authentication cookies enforce `SameSite=None`, `Secure=true`, `HttpOnly=true` flags for safe cross-origin execution between Vercel SPA and Render API.
- **Complete Data Erasure**: The `DELETE /api/sessions/:id` endpoint performs an immediate cascade wipe across PostgreSQL database tables and purges local server audio storage.

---

## 📡 24/7 Monitoring & Uptime Architecture

The production environment on Render and Vercel uses UptimeRobot 5-minute heartbeat monitors targeting:
- `https://roundtable-backend-z8fu.onrender.com/api/health`
- `https://roundtable-dsp.onrender.com/health`

This prevents Render free-tier containers from spinning down, maintaining **< 0.5s instant response times with 0 cold start delays**.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

Developed with ❤️ by [kansalshivam](https://github.com/kansalshivam).
