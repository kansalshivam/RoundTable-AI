# RoundTable AI — Backend & Infrastructure Architecture Plan
## Companion to `RoundTableAI_Execution_Plan.md` — solo-developer patterns, local-first, verified against 2026 sources
**Researched and written 14 July 2026 · Revision 2 · Team of 1**

**Revision 2 adds:** the audio-upload handling path (§2a — validation, `ffmpeg` normalization),
and a full frontend design-system architecture (§2b — how the named component libraries from
the Execution Plan's §7.0 are actually installed, composed, and kept from conflicting with each
other). Everything else in this document is carried over unchanged from Revision 1.

> The execution plan tells you *what* to build and *when*. This document tells you *how the
> machine is actually put together* — repo layout, Docker Compose topology, the new Python DSP
> microservice, database access, the async job pattern, and exactly which library was chosen
> over which alternative and why. Every non-obvious claim below is backed by a source verified
> on 14 July 2026 (linked inline), not carried over from memory of how these tools worked
> months ago.

---

## 0. The one framing decision everything else depends on

**This project has exactly two network dependencies that cannot be made local, and everything
else deliberately is.** That sentence is the entire architecture, so it's worth being precise
about why, because the reasoning changes what you build:

| Need | Can it run locally, free, at usable quality? | Decision |
|---|---|---|
| Speech-to-text + speaker diarization | No — open-source diarization (e.g. `pyannote.audio`) exists but is meaningfully harder to get production-quality results from without GPU time and tuning than a solo 1–2 week build has room for | **Cloud: AssemblyAI** |
| LLM rubric scoring + summary generation | No — a locally-run open-weight model capable of reliable structured-JSON rubric scoring needs more RAM/compute than a typical dev laptop offers at usable speed | **Cloud: Gemini Flash-Lite, Groq fallback** |
| Everything else (database, file storage, auth, the new acoustic-signal DSP layer, the job queue, the scheduled retention job) | Yes, and free forever, with no expiry or spin-down | **Local, in Docker Compose** |

The original plan's cloud-native stack (Render + Supabase + Cloudflare R2) made sense when
the product's *only* intelligence was two API calls (AssemblyAI + Gemini) wrapped around thin
CRUD. It stops making sense once you actually add real signal-processing work, because:

1. **Render's free web services have an ephemeral filesystem** — any file your app writes
   locally (an uploaded audio recording, a generated waveform PNG) is wiped on every restart,
   redeploy, or the now-15-minute spin-down. [render.com/docs/free, verified 14 July 2026]
   This isn't a corner case for this project — audio files and generated images are the
   entire point of Layers B/C in the execution plan's §2, and they cannot live on Render's
   free tier at all without external object storage, which reintroduces exactly the
   Cloudflare R2 signup-uncertainty risk the original plan flagged as unresolved.
2. **Render's free PostgreSQL now expires 30 days after creation.** [agentdeals.dev, May 2026;
   kuberns.com, April 2026] A solo 1–2 week build plus whatever gap exists before an actual
   graded demo can plausibly exceed that window.
3. **A DSP microservice (below) is a second, CPU-bound service.** Running two always-on free
   services on Render burns through the 750 free instance-hours/month workspace cap roughly
   twice as fast as running one. [render.com/docs/free]

None of this means Render is a bad platform in general — it means it is the wrong choice
**specifically for this project's specific new requirements**, which is a different and more
defensible claim than "free tiers are bad."

**The final decision: Docker Compose, one machine, for the whole build and the whole demo.**
Three containers — `app` (Node/TypeScript), `dsp` (Python/FastAPI), `postgres` — plus a named
Docker volume for audio files and generated images. No serverless exploration to hedge
against, no alternative path to maintain — this mirrors exactly the discipline the AssetFlow
project's own final HLD/LLD document used when it dropped its serverless exploration in favor
of one committed target.

---

## 1. Tech stack — final, with the "why" for each row

| Layer | Choice | Why (verified 14 July 2026 unless noted) |
|---|---|---|
| Frontend framework | React 18 + TypeScript + Vite | No server-rendering need for a single-role, session-based internal tool; Vite gives the fastest solo-dev iteration loop |
| Recording/waveform UI | `wavesurfer.js` v7 — Record plugin + Spectrogram plugin | Both are official, currently-maintained plugins in the same package; the Record plugin renders a live waveform from the `MediaRecorder`/Web Audio API during capture, and the Spectrogram plugin can run on the same instance — meaning the "observe a speech waveform" syllabus activity is demonstrable live, in-browser, during recording itself, not only after the fact |
| **NEW — Upload handling** | `multer` (Express multipart middleware) + `fluent-ffmpeg` + `ffmpeg` CLI (OS package) | Streams uploads to disk rather than buffering in memory; normalizes any uploaded format to the exact 16kHz mono WAV the DSP service already requires — see §2a |
| **NEW — Frontend design system** | Tailwind CSS + `shadcn/ui` + `motion` as the shared foundation, with Animate UI, Motion Primitives, React Bits, Cult UI, Skiper UI, Animata, Vengeance UI, and `anime.js` layered on top, each scoped to specific components | Every library ships as copy-pasted source rather than an opaque npm runtime dependency, so there's exactly one animation runtime (`motion`) plus one deliberate exception (`anime.js`, one component) — see §2b for the full installation and composition architecture |
| Backend API + worker | Node.js + TypeScript (Express) | Single codebase, one process type running both the HTTP API and an in-process polling loop for the jobs table — same "worker inside the API process" pattern the original plan used, still correct for a solo build with no real concurrency needs |
| **NEW — Speech DSP microservice** | Python 3.11 + FastAPI | The only place Python appears in the stack; isolated in its own container so the Node codebase's tooling stays single-language except for this one deliberate, contained exception — see §3 for the exact library choices |
| ORM | Prisma | TypeScript-first, matches the schema in the execution plan's §5 directly |
| Database | PostgreSQL 16, Docker container, named volume for data | No `EXCLUDE`/GiST constraints needed for this schema (no booking-overlap-style problem exists here), so this is a plain Postgres setup with no special extensions required |
| Object storage | Local Docker named volume (`audio_data`) | Audio files and generated waveform/spectrogram PNGs; removes the Cloudflare R2 signup/card question entirely by not needing an external object store at all |
| Auth | Better Auth, email/password, single admin role | Lucia (an earlier natural choice for lightweight session auth) was formally deprecated by its own maintainer in March 2025 and now ships an npm deprecation notice; Better Auth is the actively-maintained, framework-agnostic, DB-owning replacement most current guides point to as of 2026 [workos.com, solodevstack.com, both verified 14 July 2026] |
| Transcription + diarization | AssemblyAI, `speaker_labels: true`, `disfluencies: true` | Free tier: $50 one-time credit, no card required, ≈185 hours pre-recorded transcription; `disfluencies: true` returns filler words ("um", "uh", "hm") directly in the timestamped output, removing the need to build a custom filler-word detector [assemblyai.com/docs, verified 14 July 2026] |
| Transcription completion | Webhook (`webhook_url` on the transcription request) | Confirmed supported for pre-recorded transcription as of 14 July 2026 — the original plan had flagged this as unverified and hedged with a polling fallback; it's now confirmed, so the polling path becomes a documented fallback only, not the primary design |
| LLM — rubric scoring + summary | Gemini 2.5/3 Flash-Lite (primary) | Verified free tier as of mid-2026: roughly 15–30 RPM, up to ~1,500 RPD, 1M TPM, no card required — chosen over Flash/Pro specifically because Flash-Lite has the highest RPM/RPD headroom of the three free-tier models, and this workload (short, classification-style structured JSON) doesn't need Pro-level reasoning [multiple sources cross-checked: tokenmix.ai, findskill.ai, aifreeapi.com, all dated April–June 2026] |
| LLM — fallback | Groq `llama-3.1-8b-instant` | Verified ≈14,400 requests/day, 30 RPM free tier, OpenAI-SDK-compatible — the most headroom-rich free option available specifically for a fallback path that should almost never be hit but must not itself become a bottleneck if it is [eesel.ai, grizzlypeaksoftware.com, both verified 14 July 2026] |
| Containerization | Docker + Docker Compose | Three services, one `docker-compose.yml`, matches the local-first decision in §0 exactly |
| CI | GitHub Actions (optional for a solo project, but cheap and worth having) | Lint + typecheck + a Postgres service container for integration tests on every push, even solo — catches regressions before a demo, not during one |
| Testing | Vitest (Node side), `pytest` (Python DSP side) | Standard for each language, no reason to deviate |

---

## 2. AssemblyAI integration — exact request shape and the filler-word fact, sourced

**Transcription request (Node, via the official SDK or a raw HTTP call):**

```ts
// src/features/transcription/submit.ts
import { AssemblyAI } from "assemblyai";

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

export async function submitTranscription(audioLocalPath: string, sessionId: string) {
  // AssemblyAI needs a URL it can fetch from — for a fully local Docker Compose setup,
  // upload the local file to AssemblyAI's own upload endpoint first (this is a normal,
  // documented step, not a workaround) and use the returned upload URL.
  const uploadUrl = await client.files.upload(audioLocalPath);

  const transcript = await client.transcripts.submit({
    audio_url: uploadUrl,
    speech_models: ["universal-2"], // pinned explicitly, not the newer default array,
                                     // for predictable, already-verified behavior
    speaker_labels: true,
    disfluencies: true,             // <-- this is what returns "um"/"uh"/"hm" as real,
                                     // timestamped tokens in the words array — confirmed
                                     // against AssemblyAI's own docs, 14 July 2026:
                                     // "Transcribe Filler Words... Supported on
                                     // Universal-3 Pro and Universal-2."
    webhook_url: `${process.env.APP_BASE_URL}/api/webhooks/assemblyai/${sessionId}`,
  });

  return transcript.id;
}
```

**Why `disfluencies: true` matters enough to call out on its own:** without it, AssemblyAI
silently strips filler words from the transcript before you ever see them — the execution
plan's Layer C filler-rate metric would be measuring nothing at all if this flag were left at
its default. This single parameter is the difference between "build a custom filler-word
detector" (real, nontrivial NLP work with real accuracy risk) and "count a field AssemblyAI
already gives you" (zero extra work, higher accuracy, since AssemblyAI's own disfluency model
is purpose-built for exactly this).

**Webhook receiver (Node):**

```ts
// src/app/api/webhooks/assemblyai/[sessionId]/route.ts
export async function POST(req: Request, { params }: { params: { sessionId: string } }) {
  const body = await req.json(); // { transcript_id, status }
  if (body.status === "completed") {
    await enqueueJob(params.sessionId, "fetch_and_store_transcript", { transcriptId: body.transcript_id });
  } else if (body.status === "error") {
    await markSessionFailed(params.sessionId, "AssemblyAI transcription failed");
  }
  return new Response(null, { status: 200 }); // must return 2xx within 10s, or AssemblyAI retries
}
```

AssemblyAI retries a webhook delivery up to 10 times if it doesn't receive a 2xx response
within 10 seconds — so this handler should do the minimum possible work (enqueue a job) and
return immediately, not perform the actual transcript fetch inline. [assemblyai.com/docs,
verified 14 July 2026]

---

## 2a. Audio upload handling (NEW) — the second entry point into the pipeline

Companion to the Execution Plan's §1a. The design goal is that **by the time a session reaches
`status='uploaded'`, the rest of the pipeline cannot tell, and does not need to tell, whether
the audio arrived live or as an upload** — both paths converge on one normalized WAV file at
`audio_local_path` before anything else runs.

**Upload middleware (Node):** `multer` (the standard, actively-maintained multipart-upload
middleware for Express) streams the incoming file directly to a temp path inside the Docker
volume rather than buffering the whole file in memory — relevant here because a GD recording
can run to tens of megabytes even compressed, and this is a single-instance server with no
load balancer to spread memory pressure across.

```ts
// src/features/sessions/upload-middleware.ts
import multer from "multer";

const ACCEPTED_MIME_TYPES = new Set([
  "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/m4a", "audio/webm",
]);
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300MB — generous headroom for an uncompressed
                                             // WAV of a 30-60 minute GD, well above what a
                                             // realistic 3-6 person session needs

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, `/data/sessions/${req.params.sessionId}/tmp`),
    filename: (_req, file, cb) => cb(null, `original${extensionFor(file.mimetype)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => cb(null, ACCEPTED_MIME_TYPES.has(file.mimetype)),
});
```

**Validation before anything touches the pipeline:**
1. **MIME/extension check** (above) — reject obviously-wrong file types immediately, before any
   processing time is spent on them.
2. **Duration check** — after upload, probe the file with `ffprobe` (ships with `ffmpeg`);
   reject (with a clear UI message) anything under 30 seconds (too short to be a real GD) or
   over 90 minutes (outside this project's realistic scope and a sign of the wrong file).
3. **Speaker-count is not pre-validated at upload time** — that check already exists downstream,
   after AssemblyAI's diarization returns (`speaker_count_mismatch`, carried over unchanged from
   Revision 1), and there's no reliable way to estimate speaker count from a raw file before
   transcription runs, so this deliberately isn't duplicated here.

**Normalization (`ffmpeg`):** every uploaded file, regardless of source format, is transcoded to
16kHz mono WAV — the exact format the DSP microservice's `webrtcvad` step already requires
(Architecture Plan §3.4's `load_audio_16k_mono`) — so normalization happens once, at the
upload boundary, rather than being duplicated logic inside the DSP service:

```ts
// src/features/sessions/normalize-audio.ts
import ffmpeg from "fluent-ffmpeg";

export function normalizeToWav16kMono(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .on("end", () => resolve())
      .on("error", reject)
      .save(outputPath);
  });
}
```

`fluent-ffmpeg` is a thin, widely-used Node wrapper around the `ffmpeg` CLI binary — it does not
bundle the binary itself, so the `app` Dockerfile installs `ffmpeg` at the OS package layer
(`apt-get install -y ffmpeg` in the base image, Debian/Ubuntu-based `node` images all carry it
in their package repos) rather than pulling in a separate npm-packaged binary, which keeps the
image simpler and matches how `ffmpeg` is conventionally installed in containers.

**What happens to the live-recording path:** it already produces WAV output directly from
`wavesurfer.js`'s Record plugin (which itself uses the browser's `MediaRecorder`, configured for
WAV), so it passes through this same normalization step as effectively a no-op re-encode —
one code path handles both sources rather than branching logic scattered through the upload
handler, which is the whole point of doing normalization at this single boundary.

**Updated upload handler, both paths converge here:**

```ts
// src/features/sessions/upload.ts (revised from Revision 1)
export async function finalizeSessionAudio(
  sessionId: string,
  rawPath: string,
  source: "live" | "uploaded",
  originalFilename?: string,
) {
  const finalPath = `/data/sessions/${sessionId}/recording.wav`;
  await normalizeToWav16kMono(rawPath, finalPath);
  const { duration } = await probeDuration(finalPath);
  await prisma.sessions.update({
    where: { id: sessionId },
    data: {
      audio_local_path: finalPath,
      recording_source: source,
      original_filename: originalFilename ?? null,
      original_format: originalFilename ? extname(originalFilename) : null,
      duration_seconds: Math.round(duration),
      status: "uploaded",
    },
  });
  await prisma.jobs.create({ data: { session_id: sessionId, job_type: "transcription" } });
}
```

---

## 2b. Frontend design system — architecture for the component libraries in Execution Plan §7.0

Companion to the Execution Plan's §7.0, which lists *what* each library is used for and *why*.
This section covers *how they're actually installed and made to coexist* without turning into
a dependency-conflict mess — a real risk when combining several small, independently-maintained
component libraries rather than one cohesive design system.

**Foundation, installed first, everything else builds on this:**
```bash
npm i tailwindcss @tailwindcss/vite motion clsx tailwind-merge class-variance-authority
npx shadcn@latest init
```
`shadcn/ui`'s CLI-based "copy the component source into your repo" model (not an npm
dependency) is exactly why several of the Execution Plan §7.0 libraries — Animate UI, Motion
Primitives — ship the same way: each is added with its own CLI command that copies TypeScript
source directly into `src/components/`, which means **there is no risk of two libraries
shipping conflicting versions of the same underlying dependency**, because there's only ever
one `motion` and one Tailwind config in the project, and every library's copied source reads
from that single shared config.

**Per-library install commands (all copy-paste-source CLIs, not opaque npm packages):**
```bash
# Animate UI — checkbox, switch, accordion (Screen 1, 2, 5)
npx animate-ui@latest add checkbox switch accordion

# Motion Primitives — scroll-progress, spotlight, tilt, morphing-dialog
npx motion-primitives@latest add scroll-progress spotlight tilt morphing-dialog

# React Bits — circular-gallery, adapted for the Cohort Dashboard (Screen 6)
# (React Bits components are copy-pasted individually from reactbits.dev's own site,
# not installed via a package CLI — copy the Circular Gallery source into
# src/components/gallery/ and adapt data props to session objects)

# Cult UI — hover-video-player, repurposed for hover-preview audio (Screen 3)
npx shadcn@latest add "https://cult-ui.com/r/hover-video-player.json"
```
Skiper UI, Animata, Vengeance UI, and Iconsax's animated icon set are integrated the same
copy-source way — verify each library's current install command against its own site at build
time, since these are small, actively-updated projects and CLI syntax shifts.

**Where each library's code actually lives (extends §4's repo structure):**
```
app/src/components/
├── ui/                      # shadcn/ui base primitives — buttons, inputs, dialogs
├── animate/                 # Animate UI copied components (checkbox, switch, accordion)
├── motion/                  # Motion Primitives copied components (scroll-progress, tilt, etc.)
├── gallery/                 # React Bits Circular Gallery, adapted for session browsing
├── media/                   # Cult UI hover-preview, adapted for speaker-audio preview
├── recording/               # wavesurfer.js wrapper (Record + Spectrogram plugins), upload zone
└── icons/                   # Iconsax set, wrapped in a single typed IconName export
```

**Bundle-size discipline, worth stating for a Vite build:** because every library above ships
as copied source rather than a runtime npm dependency, there's no risk of shipping five
overlapping animation-library runtimes to the browser — the only animation runtime in the
bundle is `motion` itself (used by Animate UI, Motion Primitives, and React Bits' CSS/`ogl`
approach doesn't need it at all), plus `anime.js` as the one deliberate second runtime (Execution
Plan §7.0's stated exception, scoped to exactly one component: the Scorecard's synchronized
rubric-score entrance). Two animation runtimes total, each with a distinct, non-overlapping job,
is a defensible choice for a solo build; five would not be.

**Accessibility, not an afterthought:** Animate UI's components are Radix-based under the hood,
which is precisely why they're the library chosen for the app's actual form controls (checkbox,
switch, accordion) rather than a purely visual library — keyboard navigation, focus management,
and screen-reader semantics come from Radix, the animation is a layer on top, not a replacement.
The purely visual libraries (React Bits, Vengeance UI, Animata) are scoped to decorative or
supplementary elements (galleries, hover glows, backgrounds) specifically so their lighter
accessibility guarantees never gate a required workflow action.

---

## 3. The Speech DSP microservice — the one genuinely new piece of architecture

### 3.1 Why a separate service, not a Node library

Real pitch tracking (`parselmouth`, a Python wrapper around Praat) and robust voice-activity
detection have no equivalent-quality, actively-maintained Node.js library. Rather than
fighting the ecosystem, this plan isolates Python to exactly one container with exactly one
job, called over plain internal HTTP from the Node worker — the same "contained, deliberate
exception" pattern the original GD-platform plan already used for its offline
`pyannote.audio` fallback script, just formalized into a real service instead of a one-off
script, because this time the Python piece is Tier 1, not a fallback.

### 3.2 Library choices, each verified against current sources (14 July 2026)

| Library | Role | Why this one |
|---|---|---|
| `librosa` | Load audio, compute RMS energy, zero-crossing rate, trim silence, render waveform data for plotting | The standard, well-maintained Python audio-analysis package; explicitly recommended over `parselmouth` alone for general audio-signal work in a recent comparative review of open-source speech-feature packages [drivendata.co, verified 14 July 2026] |
| `parselmouth` | Pitch (F0) extraction via Praat's autocorrelation method | The same review notes parselmouth "incorporates significant subject matter expertise" for exactly this kind of prosodic measurement — it exists specifically because Praat's pitch-tracking is the long-established reference implementation in phonetics research, not something worth reimplementing |
| `webrtcvad` | Frame-level voice-activity detection (speech vs. non-speech) for the session-wide silence-ratio and per-speaker pause metrics | A lightweight, GMM-based (non-neural, no GPU needed) wrapper around Google's WebRTC VAD engine — chosen over a neural VAD (e.g. Silero) specifically because this workload (a single clean-ish room-mic recording, not noisy real-world audio) doesn't need neural-VAD's extra robustness, and `webrtcvad` has near-zero compute cost and no model-download step, which matters for a fast, dependency-light Docker build [tryspeakeasy.io, verified 14 July 2026] |
| `matplotlib` (Agg backend) | Render waveform + spectrogram images to PNG, server-side | The non-interactive `Agg` backend is the standard way to generate plot images inside a headless server process with no display — must be set explicitly (`matplotlib.use("Agg")`) before any plotting import, or the container will fail trying to open a display that doesn't exist |
| `FastAPI` | HTTP interface for the above | Async-native, automatic request validation via Pydantic, minimal boilerplate for a single-purpose internal service |

### 3.3 Exact request/response contract

```
POST /analyze
Content-Type: application/json

{
  "session_id": "uuid",
  "audio_path": "/data/sessions/{session_id}/recording.wav",  // shared Docker volume mount
  "speakers": [
    {
      "participant_id": "uuid",
      "segments": [ { "start_ms": 1200, "end_ms": 4300 }, { "start_ms": 8900, "end_ms": 11200 } ]
    }
  ]
}
```

```
200 OK
{
  "session": {
    "silence_ratio": 0.18,
    "waveform_png_path": "/data/sessions/{session_id}/waveform.png",
    "spectrogram_png_path": "/data/sessions/{session_id}/spectrogram.png"
  },
  "speakers": [
    {
      "participant_id": "uuid",
      "pitch_mean_hz": 187.4,
      "pitch_range_semitones": 9.2,
      "energy_rms_mean": 0.041,
      "energy_rms_std": 0.012,
      "pause_count": 6,
      "avg_pause_ms": 640
    }
  ]
}
```

### 3.4 Core extraction logic (the actual shape of the code, not pseudocode)

```python
# dsp_service/analysis.py
import matplotlib
matplotlib.use("Agg")  # MUST be set before importing pyplot — no display in this container

import librosa
import numpy as np
import parselmouth
import webrtcvad
import matplotlib.pyplot as plt

def load_audio_16k_mono(path: str) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(path, sr=16000, mono=True)  # webrtcvad requires 16kHz
    return y, sr

def compute_pitch_stats(y: np.ndarray, sr: int) -> dict:
    snd = parselmouth.Sound(y, sampling_frequency=sr)
    pitch = snd.to_pitch()
    values = pitch.selected_array["frequency"]
    voiced = values[values > 0]  # 0 Hz = unvoiced/silent frame, exclude from stats
    if len(voiced) == 0:
        return {"pitch_mean_hz": None, "pitch_range_semitones": None}
    mean_hz = float(np.mean(voiced))
    # convert min/max range to semitones for a scale-appropriate "range" figure
    semitone_range = 12 * np.log2(np.max(voiced) / np.min(voiced))
    return {"pitch_mean_hz": round(mean_hz, 1), "pitch_range_semitones": round(float(semitone_range), 2)}

def compute_energy_stats(y: np.ndarray) -> dict:
    rms = librosa.feature.rms(y=y)[0]
    return {"energy_rms_mean": round(float(np.mean(rms)), 4), "energy_rms_std": round(float(np.std(rms)), 4)}

def compute_pause_stats(y: np.ndarray, sr: int, aggressiveness: int = 2) -> dict:
    vad = webrtcvad.Vad(aggressiveness)
    frame_ms = 30
    frame_len = int(sr * frame_ms / 1000)
    y_int16 = np.clip(y * 32768, -32768, 32767).astype(np.int16)
    is_speech_frames = []
    for start in range(0, len(y_int16) - frame_len, frame_len):
        frame_bytes = y_int16[start:start + frame_len].tobytes()
        is_speech_frames.append(vad.is_speech(frame_bytes, sr))

    pauses, current_pause = [], 0
    for is_speech in is_speech_frames:
        if not is_speech:
            current_pause += frame_ms
        else:
            if current_pause >= 300:  # only count pauses >= 300ms as meaningful, not every gap
                pauses.append(current_pause)
            current_pause = 0

    silence_ratio = 1 - (sum(is_speech_frames) / len(is_speech_frames)) if is_speech_frames else 0
    return {
        "pause_count": len(pauses),
        "avg_pause_ms": round(float(np.mean(pauses)), 0) if pauses else 0,
        "silence_ratio": round(silence_ratio, 3),
    }

def render_waveform_and_spectrogram(y: np.ndarray, sr: int, out_dir: str) -> dict:
    fig, ax = plt.subplots(figsize=(12, 3))
    librosa.display.waveshow(y, sr=sr, ax=ax)
    ax.set(title="Session Waveform")
    waveform_path = f"{out_dir}/waveform.png"
    fig.savefig(waveform_path, dpi=100, bbox_inches="tight")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(12, 4))
    D = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)
    img = librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="log", ax=ax)
    ax.set(title="Session Spectrogram")
    spectrogram_path = f"{out_dir}/spectrogram.png"
    fig.savefig(spectrogram_path, dpi=100, bbox_inches="tight")
    plt.close(fig)  # always close figures explicitly — this is a long-lived server process,
                     # not a script that exits; unclosed figures leak memory over many sessions

    return {"waveform_png_path": waveform_path, "spectrogram_png_path": spectrogram_path}
```

**Note on per-speaker isolation:** for pitch/energy stats *per speaker*, the same functions
run again on a concatenated array built only from that speaker's `segments` (sliced out of
the full-session `y` array using the start/end millisecond boundaries converted to sample
indices) — not on the full mixed session audio. This is why the request contract in §3.3
passes each speaker's segment list explicitly rather than expecting the DSP service to
re-derive it.

### 3.5 FastAPI wrapper

```python
# dsp_service/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Segment(BaseModel):
    start_ms: int
    end_ms: int

class SpeakerRequest(BaseModel):
    participant_id: str
    segments: list[Segment]

class AnalyzeRequest(BaseModel):
    session_id: str
    audio_path: str
    speakers: list[SpeakerRequest]

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    y, sr = load_audio_16k_mono(req.audio_path)
    out_dir = f"/data/sessions/{req.session_id}"
    session_result = {**compute_pause_stats(y, sr), **render_waveform_and_spectrogram(y, sr, out_dir)}

    speaker_results = []
    for speaker in req.speakers:
        y_speaker = concatenate_segments(y, sr, speaker.segments)  # helper: slice + concat
        speaker_results.append({
            "participant_id": speaker.participant_id,
            **compute_pitch_stats(y_speaker, sr),
            **compute_energy_stats(y_speaker),
            **compute_pause_stats(y_speaker, sr),
        })

    return {"session": session_result, "speakers": speaker_results}
```

The Node worker calls this over the internal Docker network (`http://dsp:8000/analyze`) after
the transcription + speaker-mapping steps complete, and writes the response directly into the
`speech_metrics` and `sessions` tables per the execution plan's §5 schema.

---

## 4. Repository structure

```
roundtable-ai/
├── docker-compose.yml              # postgres + app + dsp — single source of truth
├── docker/
│   ├── app.Dockerfile              # Node/TS multi-stage build; installs `ffmpeg` via apt (§2a)
│   └── dsp.Dockerfile              # Python/FastAPI build
├── prisma/
│   ├── schema.prisma                # from execution plan §5
│   └── migrations/
├── data/                            # Docker-volume-mounted, gitignored — audio + PNGs live here
├── app/                              # Node backend + React frontend (Vite)
│   ├── src/
│   │   ├── app/                     # routing only — API routes, thin
│   │   ├── features/
│   │   │   ├── auth/                # Better Auth config + admin seed script
│   │   │   ├── sessions/            # session CRUD, upload handling (multer + ffmpeg normalize, §2a)
│   │   │   ├── transcription/       # AssemblyAI submit + webhook + fetch
│   │   │   ├── speech-metrics/      # Layer C (Node-computed) analytics
│   │   │   ├── scoring/             # Gemini/Groq calls, prompt building
│   │   │   └── jobs/                # the polling worker loop
│   │   ├── lib/
│   │   │   ├── db.ts                # Prisma singleton
│   │   │   ├── env.ts               # Zod-validated environment schema
│   │   │   └── dsp-client.ts        # thin HTTP client for the DSP service
│   │   └── components/              # React components — full breakdown (ui/, animate/,
│   │                                 # motion/, gallery/, media/, recording/, icons/) in §2b
│   └── tests/
├── dsp_service/
│   ├── main.py
│   ├── analysis.py
│   ├── requirements.txt
│   └── tests/                       # pytest
└── .github/workflows/ci.yml
```

`app → features → lib` one-way dependency direction, same discipline as the AssetFlow
project's own repo structure — even solo, this keeps the DSP-calling code, the LLM-calling
code, and the transcription-calling code from tangling into each other.

---

## 5. `docker-compose.yml` — the whole local stack

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: roundtable
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: roundtable
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build:
      context: .
      dockerfile: docker/app.Dockerfile
    environment:
      DATABASE_URL: "postgresql://roundtable:${POSTGRES_PASSWORD}@postgres:5432/roundtable?connection_limit=10"
      DSP_SERVICE_URL: "http://dsp:8000"
      ASSEMBLYAI_API_KEY: ${ASSEMBLYAI_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      GROQ_API_KEY: ${GROQ_API_KEY}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      APP_BASE_URL: ${APP_BASE_URL}
    volumes:
      - audio_data:/data
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - dsp

  dsp:
    build:
      context: .
      dockerfile: docker/dsp.Dockerfile
    volumes:
      - audio_data:/data
    ports:
      - "8000:8000"

volumes:
  pgdata:
  audio_data:
```

`connection_limit=10` on the Prisma connection string is correct here for the same reason it
was correct in the AssetFlow project's own local-deployment decision: there is exactly one
long-lived container holding exactly one Prisma connection pool, not many ephemeral serverless
instances — do not copy a `connection_limit=1` "serverless" pattern into this project.

---

## 6. The async job pattern — deliberately simple, no queue library

Same reasoning as the AssetFlow infra plan's own async-architecture decision, applied to this
project's actual workload: every job here (transcribe → analyze → score) is a short, one-shot
background task per session, not a high-volume or long-running workload. Adding BullMQ,
Inngest, or a Redis-backed queue would add a new external dependency and a new failure mode
for a workload that a plain Postgres-polled `jobs` table already handles correctly:

```ts
// src/features/jobs/worker.ts — runs in-process, started once at app boot
import { prisma } from "@/lib/db";

const JOB_HANDLERS = {
  transcription: handleTranscriptionJob,
  dsp_analysis: handleDspAnalysisJob,
  scoring: handleScoringJob,
};

export function startWorker() {
  setInterval(async () => {
    const job = await prisma.jobs.findFirst({
      where: { status: "queued" },
      orderBy: { created_at: "asc" },
    });
    if (!job) return;

    await prisma.jobs.update({ where: { id: job.id }, data: { status: "in_progress" } });
    try {
      await JOB_HANDLERS[job.job_type](job);
      await prisma.jobs.update({ where: { id: job.id }, data: { status: "complete" } });
    } catch (err) {
      const attempts = job.attempts + 1;
      const backoffMs = [2000, 8000, 32000][attempts - 1] ?? null;
      if (backoffMs) {
        await prisma.jobs.update({
          where: { id: job.id },
          data: { status: "queued", attempts, error_message: String(err) },
        });
        setTimeout(() => {}, backoffMs); // conceptual — real implementation delays the next poll of this job
      } else {
        await prisma.jobs.update({
          where: { id: job.id },
          data: { status: "failed", attempts, error_message: String(err) },
        });
      }
    }
  }, 5000); // poll every 5 seconds
}
```

Retry policy: 3 attempts, exponential backoff (2s, 8s, 32s), then permanently `failed` with the
error surfaced through the session's `/status` endpoint so the frontend can show a real error
state and a "Retry" button — not spin forever, per the same discipline the original plan's
pipeline logic already specified.

---

## 7. LLM scoring — sequential calls, provider fallback, exact code shape

```ts
// src/features/scoring/score-participant.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export async function scoreParticipant(prompt: { system: string; user: string }) {
  try {
    const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent([prompt.system, prompt.user]);
    return { raw: result.response.text(), provider: "gemini" as const };
  } catch (err) {
    if (isRateLimitError(err)) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
      return { raw: completion.choices[0].message.content!, provider: "groq" as const };
    }
    throw err;
  }
}
```

Scoring jobs run **sequentially, one participant at a time**, not fanned out in parallel —
with 3–6 students per session and Flash-Lite's verified ≈15–30 RPM free-tier ceiling, a
sequential loop never comes close to the per-minute limit, whereas a `Promise.all` fan-out
across 6 simultaneous calls risks tripping it on the very first session tested. This is a
direct, deliberate application of the rate-limit lesson already documented in current Gemini
free-tier guidance: parallel fan-out is the single most common way developers accidentally
exceed RPM even while comfortably under their daily cap. [tinkerllm.com, verified 14 July 2026]

---

## 8. Environment variables

```
# .env.example — commit this, never the real .env

# Postgres
POSTGRES_PASSWORD=

# App
DATABASE_URL=postgresql://roundtable:${POSTGRES_PASSWORD}@postgres:5432/roundtable
APP_BASE_URL=http://localhost:3000
DSP_SERVICE_URL=http://dsp:8000
BETTER_AUTH_SECRET=          # openssl rand -base64 32

# Cloud APIs (the only two things that need real internet access)
ASSEMBLYAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
```

Validated via a Zod schema at boot (`src/lib/env.ts`) so a missing variable fails immediately
on startup, not mid-pipeline during a demo.

---

## 9. Testing architecture

- **Node unit tests** (`tests/unit/`): the WPM/filler-rate/MTLD computation functions (Layer C)
  — pure functions, no database, no network, fast.
- **Node integration tests** (`tests/integration/`): the job-worker retry logic, the scoring
  prompt-building function, against a real Postgres (either a local Docker instance or a CI
  service container).
- **Python tests** (`dsp_service/tests/`, `pytest`): the pitch/energy/pause functions against a
  handful of short, checked-in synthetic test WAV files (e.g., a pure sine tone at a known
  frequency, to confirm `compute_pitch_stats` returns something close to that known value —
  a cheap, real sanity check that doesn't require real speech audio in the repo).

Example Python test, encoding a concrete, checkable claim rather than a vague "it runs":

```python
# dsp_service/tests/test_pitch.py
import numpy as np
from analysis import compute_pitch_stats

def test_pure_tone_pitch_detection():
    sr = 16000
    duration = 1.0
    freq = 220.0  # A3
    t = np.linspace(0, duration, int(sr * duration))
    y = 0.5 * np.sin(2 * np.pi * freq * t)

    result = compute_pitch_stats(y, sr)
    assert result["pitch_mean_hz"] is not None
    assert abs(result["pitch_mean_hz"] - freq) < 5  # allow small tracker error
```

---

## 10. First 20 minutes — exact commands

```bash
# 1. Repo + Node app
mkdir roundtable-ai && cd roundtable-ai
mkdir app dsp_service docker data
cd app && npm create vite@latest . -- --template react-ts
npm i prisma @prisma/client better-auth zod assemblyai @google/generative-ai groq-sdk wavesurfer.js
npm i multer fluent-ffmpeg animejs
npm i tailwindcss @tailwindcss/vite motion clsx tailwind-merge class-variance-authority
npx shadcn@latest init
npx animate-ui@latest add checkbox switch accordion
npx motion-primitives@latest add scroll-progress spotlight tilt morphing-dialog
npm i -D vitest @types/multer @types/fluent-ffmpeg

# 1a. System dependency for the app container (also add to app.Dockerfile — §2a)
# Debian/Ubuntu: apt-get install -y ffmpeg
# macOS dev machine: brew install ffmpeg

# 2. Python DSP service
cd ../dsp_service
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn librosa parselmouth webrtcvad matplotlib pydantic pytest

cat > requirements.txt << 'EOF'
fastapi
uvicorn[standard]
librosa
praat-parselmouth
webrtcvad
matplotlib
pydantic
EOF

# 3. Prisma
cd ../app
npx prisma init
# paste the schema from the execution plan's §5 into prisma/schema.prisma

# 4. Env
cd ..
cp .env.example .env
# fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET (openssl rand -base64 32),
# ASSEMBLYAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY (all free-tier signups, no card needed
# for any of the three — verified 14 July 2026)

# 5. First boot
docker compose up -d postgres
cd app && npx prisma migrate dev --name init
cd ..
docker compose up --build
```

---

## 11. Summary — what changed from the original plan's architecture, and why

1. **Hosting moved from free-tier cloud (Render/Supabase/R2) to local Docker Compose**,
   because the original stack's specific weak points (ephemeral filesystem, 30-day Postgres
   expiry) are directly incompatible with this version's new file-heavy, signal-processing
   requirements — not a stylistic preference.
2. **A new Python microservice exists**, isolated in its own container, doing exactly one job
   (acoustic-signal analysis) that has no good Node equivalent — this is the one place the
   "single-language discipline" the original plan valued is deliberately broken, and it's
   broken in a contained, well-justified way rather than left ambiguous.
3. **AssemblyAI's webhook support, previously flagged as unverified**, is now confirmed
   directly against current documentation — polling remains available as a documented
   fallback, but is no longer the primary design.
4. **LLM provider choice narrowed to Flash-Lite specifically** (not Flash or Pro), and calls
   run strictly sequentially, both decisions driven directly by this project's actual
   verified free-tier rate-limit numbers rather than a generic "use Gemini" choice.
5. **Auth moved from a cloud auth provider (Supabase Auth, in the original plan) to Better
   Auth**, a DB-owning, self-hosted library — consistent with the local-first decision and
   avoiding Lucia specifically because it is now a deprecated package, not a maintained one.

**Revision 2 additions, on top of the above:**

6. **A second entry point into the pipeline (file upload) was added**, converging with the live
   recording path at one normalization boundary (`ffmpeg`, §2a) so no downstream module needs to
   branch on which source produced a given session's audio.
7. **A real, named-library frontend design system replaced generic "clean UI" language** (§2b),
   composed entirely of copy-source component libraries sharing one Tailwind config and one
   `motion` runtime, deliberately avoiding the dependency-conflict risk of adopting several
   full component frameworks at once.

---

*Sources consulted (14 July 2026): Render official docs (`/docs/free`, `/docs/faq`) and
independent verification (agentdeals.dev, kuberns.com, servercompass.app); AssemblyAI official
docs (pricing, webhooks for pre-recorded audio, filler-word/disfluencies parameter, Universal
model docs) and independent pricing trackers (checkthat.ai, costbench.com, gladia.io); Google
Gemini API free-tier rate-limit trackers (tinkerllm.com, aifreeapi.com, tokenmix.ai,
findskill.ai, usagebox.com — cross-checked across five independent sources given how often
these limits have changed in 2026); Groq official rate-limit documentation as summarized by
eesel.ai, grizzlypeaksoftware.com, tokenmix.ai; Lucia's own GitHub deprecation discussion and
independent 2026 auth-library comparisons (workos.com, solodevstack.com); open-source
speech-feature-extraction library comparison (drivendata.co); Voice Activity Detection
implementation guidance (tryspeakeasy.io, picovoice.ai); wavesurfer.js official site and
GitHub repository (plugin list, Record plugin API); `multer` and `fluent-ffmpeg` official npm
documentation; frontend component libraries verified directly against their own current sites
(14 July 2026): reactbits.dev (Circular Gallery), animate-ui.com (headless/Radix-based
Checkbox, Switch, built on React + TypeScript + Tailwind + Motion), motion-primitives.com
(Scroll Progress, Spotlight, Tilt, Cursor, Dock — Motion + Tailwind based), cult-ui.com
(Hover Video Player pattern), skiper-ui.com, animata.design (Interactive Grid), animejs.com
(`timeline()` multi-target sync API), app.iconsax.io (animated icon variants). All code
samples are original, adapted to this project's specific schema and pipeline, not copied
verbatim from any single source.*
