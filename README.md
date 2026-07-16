# RoundTable AI

AI-Powered Peer-to-Peer Group Communication Assessment & Analytics Engine.

## Project Status

### Phase 1: Foundation (Completed)
- Multi-service Docker Compose architecture running:
  - `postgres` (database engine)
  - `app` (Express backend serving mock auth routes)
  - `dsp` (FastAPI Python DSP service skeleton)
- Database schema migrated and seeded with a default admin account.
- Cookie-based admin authentication layer verified.

### Phase 2: Session Setup + Recording/Upload (Completed)
- Screen 1 Session Setup (dynamic list of participant names, age verification) implemented.
- Screen 2 Consent + Recording/Upload dual path (live wavesurfer.js capture + drag-drop loader) implemented.
- Backend API handlers for sessions creation, upload, consent verification, and audio transcoding to WAV.
- ffmpeg/ffprobe duration constraints checking and audio normalization to 16kHz mono WAV active.

### Phase 3: Transcription Pipeline (Completed)
- Background job worker loop polling database and executing async queue tasks built.
- Webhook route endpoint `/api/webhooks/assemblyai/:sessionId` registered.
- AssemblyAI transcription integration (`Universal-2` speech model, diarized speaker labels, disfluency tracking) implemented.
- Robust webhook failure fallback logic: automatic status polling when webhook is unreachable, and offline mock data transcription fallback when API keys are empty.

### Phase 4: Speaker Mapping + Processing Screen (Completed)
- Backend endpoints for checking session status, slicing voice previews (ffmpeg), and mapping speaker labels implemented.
- Screen 3 Processing & Mapping interface with progress step tracking, speaker-count mismatch warning alert, and audio cards with dropdown selections built.

### Phase 5: Transcript-Derived Analytics (Completed)
- Textbook Measure of Textual Lexical Diversity (MTLD) scoring module (forward/backward TTR) implemented.
- Node worker calculates paced WPM, disfluency rate, and turns metrics, and saves results in `speech_metrics` table.

### Phase 6: Acoustic Analytics (Completed)
- Python DSP microservice (`dsp` container) built, exposing a FastAPI `POST /analyze` endpoint.
- Extracted prosodic/physical metrics: pitch tracking (`parselmouth`), RMS energy (`librosa`), WebRTC VAD pause metrics (`webrtcvad`).
- Waveform and Spectrogram PNG plot files rendered using matplotlib and saved to shared Docker volume.
- Integrated HTTP POST client inside the Node job worker to fetch and merge acoustic metrics.

## Local Development Setup

1. Copy `.env.example` to `.env` and fill in necessary secrets.
2. Spin up the environment using Docker Compose:
   ```bash
   docker compose up --build -d
   ```
3. Run migrations (only if database container is clean and unmigrated):
   ```bash
   docker compose run --rm app npx prisma migrate deploy --schema ./prisma/schema.prisma
   ```
4. Access the Express application API at `http://localhost:3000`.
