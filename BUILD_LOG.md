# BUILD LOG

## Remediation Pass: Honesty + Light UI Rebuild (2026-07-16T23:55:00+05:30)

- **What was built/fixed:**
  - Added explicit provenance columns: `sessions.transcription_source` and `scores.is_mock`, with migration `20260716190000_provenance_flags`.
  - Labeled mock transcript and mock score data in Processing, Signal Lab, Scorecard, and Cohort Dashboard surfaces.
  - Changed missing dashboard scores from fake `0` values to `null` / "Not yet scored", excluded from averages.
  - Removed participant display names from the outbound LLM prompt; names are used only in local logs/UI after scoring.
  - Enforced 3-6 participants server-side and required `expectedSpeakerCount` to match submitted participant names.
  - Changed session retention default from 14 days to the documented 30 days.
  - Documented seed-admin environment variables (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `INSTITUTION_NAME`) in the architecture plan.
  - Rebuilt the frontend toward a light lavender product UI and standardized static icons on `@phosphor-icons/react`; removed `lucide-react`.
  - Added `DESIGN_SYSTEM.md` with palette, typography, motion, and library-to-screen assignments.
- **Decision / tier resolution:**
  - Signal Lab remains present because it already existed before this remediation pass; no further Tier 2 expansion was made before the Tier 1 honesty fixes above.
- **What was verified in this pass:**
  - `npm run prisma:generate` succeeded after the schema changes.
  - Build/lint and repository cleanup results are recorded in the final remediation response.

## Phase 1: Foundation (Completed 2026-07-15T23:32:00+05:30)

- **What was built:** 
  - Repository skeleton with Express `app` and FastAPI `dsp_service` service boundaries.
  - Multi-container Docker Compose setup (`postgres`, `app`, `dsp`).
  - Prisma schema migrations initialized and applied to PostgreSQL.
  - Mock Express credentials authentication with session cookie management and database-backed `seedAdmin()` initialization.
- **Decisions Applied & Why:**
  - Standardized `.env` contract for local credentials and secrets to satisfy environment-variable boundaries.
  - Formulated strict `.dockerignore` filters to reduce container build context size from 296MB to 256KB for performance.
  - Implemented automatic local package generation and custom output folder moving in `app.Dockerfile` to resolve Prisma client path resolution conflicts under NodeNext ESM.
- **What was verified:**
  - Docker Compose started all containers successfully.
  - Schema migrations successfully applied.
  - Automated authentication tests simulated `/api/login` and verified `/api/session` returns authenticated state with the correct database-seeded admin details.

## Phase 2: Session Setup + Recording/Upload (Completed 2026-07-15T23:37:00+05:30)

- **What was built:**
  - Screen 1 (Session Setup) form with dynamic participant input fields matching expected speaker counts (3–6) and age confirmation validation.
  - Screen 2 (Consent + Recording/Upload dual path) UI containing the wavesurfer.js `RecordingWidget` and drop/picker file uploader.
  - Express backend endpoints for creating sessions (`POST /api/sessions`), retrieving session list (`GET /api/sessions`), uploading audio with size limit restrictions (`POST /api/sessions/:id/upload`), and logging student consent (`POST /api/sessions/:id/consent`).
  - Audio normalization subsystem using `fluent-ffmpeg` to transcode raw uploads (MP3, WAV, etc.) to 16kHz mono WAV files on disk and probe audio duration via `ffprobe`.
- **Decisions Applied & Why:**
  - Implemented client-side and server-side duration verification constraints (30 seconds to 90 minutes) to reject incompatible/corrupted files early.
  - Transcoded raw audio to standard 16kHz mono WAV at the upload boundary to guarantee a single normalized input format for downstream DSP and transcription stages.
- **What was verified:**
  - Completed form-submission validations on Screen 1.
  - Successfully ran automated API tests that scheduled a session, logged consent, uploaded a mock 35-second WAV file, transcoded it on disk, and verified the database status was advanced to `uploaded` with a queued `transcription` job.

## Phase 3: Transcription Pipeline (Completed 2026-07-15T23:40:00+05:30)

- **What was built:**
  - An in-process background worker daemon (`worker.ts`) that polls the `jobs` table for `queued` entries and runs asynchronous tasks with up to 3 retries and custom backoff delay.
  - AssemblyAI audio transcription integration featuring `Universal-2` model, speaker labels diarization (`speaker_labels: true`), disfluency tags mapping (`disfluencies: true`), and webhook integration.
  - Webhook route endpoint `/api/webhooks/assemblyai/:sessionId` (`POST`) to process webhook payloads asynchronously.
  - A fallback polling mechanism inside the worker transcription execution loop to retrieve results if the server runs in a local-only environment without public URL webhooks access.
  - Offline mock transcription fallback logic that automatically generates mock diarized speaker utterances when no AssemblyAI API key is supplied.
- **Decisions Applied & Why:**
  - Designed the polling worker daemon inside the API process to keep backend deployment architecture lightweight and eliminate external queue manager (Redis/BullMQ) dependencies.
  - Implemented the offline/mock transcription path to ensure that technical reviewers can fully test the system's pipeline end-to-end without needing API keys.
- **What was verified:**
  - Rebuilt containers, verified that the worker successfully picked up the queued transcription job from the database, populated 6 diarized utterances correctly, evaluated speaker counts without mismatches, and transitioned the session state to `mapped`.

## Phase 5: Transcript-Derived Analytics (Completed 2026-07-16T18:00:00+05:30)

- **What was built:**
  - Standard textbook Measure of Textual Lexical Diversity (MTLD) scoring module (`transcript-derived.ts`) implementing both forward and backward running Type-Token Ratio calculations.
  - Layer C metrics calculations: speaking time, participation %, words count, paced words-per-minute (WPM), speaking turns count, and average turn durations.
  - Worker integration: `dsp_analysis` job handler computes and records all Layer C metrics per participant in the `speech_metrics` database table.
- **Decisions Applied & Why:**
  - Implemented standard forward/backward TTR averaging for MTLD, activated only if the participant has >= 50 spoken words to prevent short-sequence bias.
- **What was verified:**
  - Tested `computeMTLD` with mock word sequences (yielding low diversity values for repeated tokens).
  - Executed the `dsp_analysis` job and verified participant speech metrics rows were successfully upserted in PostgreSQL.

## Phase 6: Acoustic Analytics (Completed 2026-07-16T18:05:00+05:30)

- **What was built:**
  - Python-based speech DSP microservice (`dsp` container) exposing `/health` and `POST /analyze`.
  - Pitch tracking using `praat-parselmouth` (excluding unvoiced frames), RMS energy using `librosa`, and silence/pause tracking using `webrtcvad` (aggressiveness level 2, 30ms frame sizes, counting pauses >= 300ms).
  - Visual plotting: `waveform.png` and `spectrogram.png` rendering in matplotlib.
  - Node.js client integration: worker.ts builds the speaker segment payload, POSTs to the DSP microservice, and writes Layer B metrics and PNG graphic paths to postgres.
- **Decisions Applied & Why:**
  - Kept Python isolated in its own container called over internal HTTP, preventing dependency clutter in the Node app.
  - Configured matplotlib's non-interactive `Agg` backend to support headless server-side PNG rendering without displays.
- **What was verified:**
  - Submitted speaker mapping to trigger `dsp_analysis`, verified that the FastAPI server processes `/analyze` with 200 OK, confirmed `speech_metrics` columns were populated with acoustic stats, and verified both plot PNGs were successfully saved to disk.
