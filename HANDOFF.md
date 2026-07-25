# RoundTable AI Handoff

Last updated: 2026-07-16 23:55 IST

## Current Phase Status

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation | **Completed** |
| 2 | Session Setup + Recording/Upload (Screens 1-2) | **Completed** |
| 3 | Transcription pipeline | **Completed** |
| 4 | Speaker mapping + Processing screen (Screen 3) | **Completed** |
| 5 | Transcript-derived analytics (Layer C) | **Completed** |
| 6 | Acoustic analytics (Layer B) - Python DSP microservice | **Completed** |
| 7 | Signal Lab screen (Screen 4) | Built before remediation; now mock-transcript labeled |
| 8 | LLM scoring pipeline | Built, live API unverified until keys are supplied; mock scores are explicitly flagged |
| 9 | Rubric validation pass | not started |
| 10 | Scorecard + Cohort Dashboard (Screens 5-6) + CSV export | Scorecard and Cohort Dashboard rebuilt; CSV export still open |
| 11 | Retention job + consent enforcement wiring | Retention cron exists; 30-day default fixed; withdrawal endpoint still open |
| 12 | Reliability hardening + demo-day rehearsal | not started |

## Files Created Or Modified In This Session

- `dsp_service/analysis.py` - Created the core DSP engine utilizing `praat-parselmouth` for pitch (excluding unvoiced frames), `librosa` for RMS energy, `webrtcvad` for pause/silence metrics, and `matplotlib` for exporting waveform/spectrogram PNGs.
- `dsp_service/main.py` - Created the FastAPI `POST /analyze` endpoint that handles request loading, segment extraction, and merges results.
- `app/src/features/speech-metrics/transcript-derived.ts` - Created the lexical diversity tracker using standard McCarthy & Jarvis forward/backward MTLD factor calculations and Layer C metric calculators.
- `app/src/features/jobs/worker.ts` - Wrote the client integration posting speakers payload to the Python DSP service, updating PNG graphics paths, computing transcript metrics, and upserting the combined Layer B + C metrics into the `speech_metrics` database table.
- `prisma/schema.prisma` and `prisma/migrations/20260716190000_provenance_flags/migration.sql` - Added `sessions.transcription_source` and `scores.is_mock` provenance fields.
- `app/src/features/scoring/save-score.ts` - Removed participant names from outbound prompt and persists `is_mock` truthfully.
- `app/src/features/scoring/score.routes.ts` - Returns `null` for missing scores and carries mock/provenance flags to UI.
- `app/src/features/dashboard/DashboardView.tsx` and `app/src/features/scoring/components/ScorecardView.tsx` - Rebuilt light UI and added visible mock/not-scored labels.
- `app/src/server.ts` - Enforces 3-6 participant count and 30-day retention default.
- `DESIGN_SYSTEM.md` - Added palette, typography, motion, and component assignment guidance.

## Commands Run That Matter

- `docker compose up --build -d` - Rebuilt and launched containers.
- Postgres verification queries - Confirmed that the `dsp_analysis` job updates columns `pitch_mean_hz`, `energy_rms_mean`, `vocab_mtld_score`, and silence ratios correctly, and verifies PNG plots exist.
- `npm run prisma:generate` - Regenerated Prisma client for provenance fields.
- `npm run build` and `npm run lint` - Run during remediation; see latest assistant report for exact result.

## Section 2A Decisions Exercised So Far

- Kept python dependencies isolated in the `dsp` container and interfaced via FastAPI to eliminate node-gyp python wrapper compiling bugs in Node app.
- Enforced a minimum 50 words spoken threshold for computing MTLD scores to prevent short utterance skew.
- Rendered waveform/spectrogram plots headlessly on the server using matplotlib's `Agg` display driver.

## Section 2B Escalations And Resolutions

- Signal Lab had already been built before Tier 1 was fully complete. Remediation decision: stop expanding Tier 2 work and prioritize Tier 1 honesty fixes, scoring provenance, dashboard correctness, consent copy, and retention/default enforcement.

## Known Bugs, Incomplete Functions, Or TODOs

- CSV export still needs the new `is_mock` and `transcription_source` columns when export is implemented.
- API keys for AssemblyAI, Gemini, and Groq remain intentionally absent; live transcription/scoring are unverified until keys are supplied.
- Consent withdrawal before scoring is still copy-only unless a dedicated deletion/withdraw endpoint is added.

## Next Step

- Add and verify CSV export with explicit `transcription_source` and `is_mock` columns, then run the live API-key verification pass.
