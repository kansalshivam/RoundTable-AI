# RoundTable AI — Speech Analytics & Group Discussion Assessment Platform
### Solo-Developer Execution Plan — 1–2 Week Build, Local-First, Speech-Technology-Aligned
### Prepared 14 July 2026 · Revision 2 · Team of 1 · Speech Technology Internship Mini-Project

---

## REVISION 2 NOTE (this pass)

Three things were added on top of the local-first version this document already described.
None of them change the core idea, the tier discipline, or the local-Docker hosting decision —
they extend the same locked scope, not re-open it:

1. **Recording input now has two equivalent paths — live capture or file upload** — so the
   platform is demoable even when a real, live group discussion can't be run in the room during
   a presentation (venue noise, no willing participants on the day, time constraints). See §1a
   and §7 Screen 2.
2. **Curriculum alignment is now load-bearing everywhere, not just in §2.** Every module,
   screen, and metric in this document now carries an explicit syllabus-module / course-outcome
   tag, and §2.6 adds a single crosswalk table so the whole mapping can be read in one place. The
   depth of the underlying build is unchanged — this is about making an already-real connection
   legible, not padding the project with new syllabus-chasing features.
3. **The frontend gets a real, specific design system** (§7), built from named, verified
   component libraries rather than generic "clean UI" language — because a Speech Technology
   mini-project whose signature artifact is a waveform/spectrogram screen deserves a frontend
   that treats visual/motion polish as seriously as the DSP layer treats the audio.

---

## 0. WHAT THIS DOCUMENT REPLACES, AND WHY

This supersedes the original "AI Group Discussion Assessment Platform" plan (8-week, 1–2
person, cloud-free-tier stack). The **basic idea is unchanged**: a Training & Placement
Officer (TPO) records a real, single-mic, in-room group discussion (3–6 students), and the
platform returns a diarized transcript, a per-student scorecard, and a cohort ranking, within
minutes of the recording ending. Students never log in and never see live feedback — that
scope cut is preserved exactly as before.

**Three things changed, each with a reason, not a preference:**

1. **Team size and timeline.** This is now a solo build over 1–2 weeks (elastic — the plan is
   written as phases with done-conditions, not fixed clock hours, so it compresses or stretches
   without changing task order). There is no 3-person parallel-vertical structure to design
   around; every phase is sequential by necessity, not by choice.

2. **Curriculum alignment.** The original plan's only "intelligence" was an LLM judging four
   qualitative dimensions (Topic Relevance, Initiative, Coherence, Responsiveness) from
   transcript text alone. That is a defensible NLP/assessment product, but it is barely **speech
   technology** — nothing in it touches sampling, frequency, amplitude, noise, or any of the
   digital-signal-processing content that is the actual spine of a Speech Technology syllabus
   (Module 2, specifically). This plan adds a real acoustic-signal analysis layer — pitch,
   energy, pause/silence structure, waveform/spectrogram visualization — computed directly
   from the audio waveform, not inferred from text. This is a deliberate, independently-reasoned
   redesign, not a copy of any single suggestion; the reasoning for each addition is stated
   inline in §2 so it can be defended in a viva.

3. **Hosting.** The original plan's free-tier cloud stack (Render + Supabase + Cloudflare R2)
   was reasonable in June 2026 but has since gotten *more* fragile for this exact use case —
   verified facts below, not assumptions:
   - Render's free web services now spin down after **15 minutes** of inactivity (tightened from
     30 minutes) with a ~30–60 second cold-start delay, and — the part that actually matters
     here — **free instances have an ephemeral filesystem**: any locally-written file (an
     uploaded audio recording) is wiped on every restart, redeploy, or spin-down.
     [render.com/docs/free, verified 14 July 2026]
   - Render's free PostgreSQL is now **auto-deleted 30 days after creation**, with no grace
     period on some reports and a short one on others — either way, too short a fuse for a
     project that might run 1–2 weeks of active development plus however long before a
     graded demo. [agentdeals.dev/vendor/render; kuberns.com, both May 2026]
   - None of this is a hypothetical risk-of-a-risk — it is exactly the failure mode "cold
     container swallows an in-flight background job" the original plan's §3.1 already worried
     about, except now it also threatens to swallow the *data*, not just a job.

   **Given this, and given the explicit instruction to optimize for zero panic during a live
   presentation, the hosting decision for this plan is Local-first Docker Compose, final,
   no alternative path to hedge between** — the same reasoning AssetFlow's own final
   HLD/LLD document used when it dropped a serverless exploration in favor of one Docker
   Compose stack on one machine. The only two things that remain cloud calls, because they
   are not available locally at usable free-tier quality, are transcription+diarization
   (AssemblyAI) and LLM scoring (Gemini, with Groq as a documented fallback). Everything
   else — database, file storage, auth, the scheduled jobs, the new DSP layer — runs on your
   own machine, with no spin-down, no expiry, no ephemeral-filesystem surprise, and no
   internet dependency for anything except those two calls.

Everything not touched by this changelog (the core rubric philosophy, the "no pass/fail
verdict" stance, the consent discipline) carries over from the original plan's design
principles, restated where relevant rather than re-argued.

---

## 1. PRODUCT DEFINITION (LOCKED SCOPE — DO NOT RE-LITIGATE MID-BUILD)

**Unchanged from the original plan, restated for a solo build:**

- No live/real-time coaching or in-discussion nudges
- No video or facial/body-language analysis — **audio only**, which is itself a better fit for a
  Speech Technology course than a multimodal product would be
- No vernacular/regional-language support — English-medium GD only
- No support for more than 6 simultaneous speakers
- No automated selection/rejection decision — the platform produces a scorecard for a human
  to use, it never outputs a pass/fail verdict
- No multi-device/multi-mic capture — single room microphone, single audio stream **per
  session, regardless of whether that stream arrives via live capture or file upload (§1a) —
  the platform never merges or mixes multiple audio sources into one session**
- No student accounts, no student-facing view, no live feedback latency requirement — this
  scope cut removes an entire authentication surface and is worth exactly as much for a solo
  build as it was for the original one, arguably more

**Convention used throughout this revision:** any module, screen, or metric that maps to a
specific syllabus module or course outcome is tagged inline as **[Mod N]** / **[CO N]** the
first time it's introduced, cross-referenced against the full crosswalk in §2.6. This is a
legibility convention, not a new feature — the underlying mapping was already true in Revision
1, it just wasn't collected in one place.

### 1a. Recording input — two paths into the same pipeline (NEW)

**Why this exists:** a live, in-room group discussion is the primary and preferred capture
method — it's what the product is designed around, and what §2's acoustic layer is tuned for
(a reasonably clean single room-mic signal). But a graded presentation is a bad place to
discover the room is too loud, no group of students is available at that exact moment, or the
laptop's mic input isn't cooperating. So Screen 2 offers **two entry points into the identical
downstream pipeline**, chosen by the TPO at the start of a session, not something the platform
tries to auto-detect:

| Path | How it starts | What happens differently | What's identical from here on |
|---|---|---|---|
| **Live Record** | `wavesurfer.js` Record plugin, live waveform + timer, as already specified | Audio is captured as WAV directly in-browser via the Web Audio API/`MediaRecorder`, uploaded on stop | Everything from `sessions.status = 'uploaded'` onward: transcription, speaker mapping, DSP analysis, scoring, scorecard |
| **Upload Recording (NEW)** | A drag-and-drop / file-picker zone on the same screen, accepting a pre-recorded file (e.g. a discussion recorded on a phone beforehand, or a backup recording from a prior real session) | The file is validated (format, duration, size — see Architecture Plan §2a) and, if not already WAV, transcoded server-side via `ffmpeg` before it touches the rest of the pipeline, so every downstream module (AssemblyAI, the DSP microservice) always receives the same normalized format regardless of source | Same as above — the pipeline has no idea, and does not need to know, which path a given session's audio came from once normalization is done |

**What this deliberately is not:** a general-purpose "upload any audio, about any topic, from
anywhere" feature. The consent text (§8), the "3–6 participants" constraint, and the "single
room mic, single stream" locked-scope statement above all still apply identically to an
uploaded file — the TPO is still asserting this is a real, consented group discussion recording,
just captured earlier rather than through this browser session. The UI states this plainly
next to the upload zone rather than leaving it ambiguous.

**Schema consequence (full table in §5):** `sessions.recording_source` (`'live' | 'uploaded'`)
is stored per session, purely for the record — it has no effect on scoring, analytics, or the
rubric, and is never shown to evaluators as a quality signal. It exists only so a TPO reviewing
the cohort dashboard later can tell which sessions were live-captured.

**New locked-scope statement for this version:**

- The acoustic-signal layer (§2.2) is diagnostic and descriptive only. It never outputs a
  pass/fail or "good/bad speaker" verdict on its own — pitch and energy statistics are
  presented as neutral, factual measurements (per the same "opaque AI decided" concern the
  original plan raised about the aggregate rubric score), and the LLM's qualitative summary
  must ground any evaluative language in the transcript and the measured numbers, not invent
  psychological or personality judgments from acoustic data alone. Acoustic features do not
  reliably indicate confidence, nervousness, or competence, and the platform must not imply
  otherwise — this is a fairness and accuracy constraint, not just a scope note.
- No pronunciation scoring, no accent classification, no emotion detection, no eye-contact/
  body-language inference. These require either specialized models this project has no
  reliable free access to, or acoustic-only proxies (e.g., pitch variance as a stand-in for
  "emotion") that are not scientifically defensible at this project's depth and would be the
  single most fake-risk feature on the list if attempted — cut, for the same reason the
  original plan cut filler-rate-as-fairness-risk and depreciation-logic-as-scope-trap in its
  own domain.

---

## 2. THE RUBRIC AND ANALYTICS — WHAT THIS PLATFORM ACTUALLY MEASURES, AND WHY EACH PIECE MAPS TO THE SYLLABUS

This is the section that answers "why does this count as a Speech Technology project" in a
viva. Every metric below is placed against the specific syllabus module it demonstrates,
because a metric that doesn't map to anything in the course is scope creep, not credibility.

### 2.1 Layer A — Qualitative rubric (LLM-judged, unchanged from the original plan) **[Mod 4] [CO 3, CO 4]**

The four dimensions below are carried over **verbatim** from the original plan because they
were already sound and already map to the syllabus's Module 4 ("Soft Skill Applications:
voice communication improvement, speech clarity, professional communication"):

| Dimension | What it measures | What the LLM is shown |
|---|---|---|
| Topic Relevance | Does the student's speech stay substantively connected to the GD topic? | Topic string + all of that student's utterances, in order |
| Initiative & Engagement | Does the student contribute proactively vs. stay largely silent/reactive? | Utterance count, average utterance length, position in timeline |
| Coherence & Structure | Are the student's points internally logical and clearly expressed? | The student's raw utterance text only |
| Responsiveness | Does the student engage with what others said, or deliver disconnected monologue? | The student's utterances plus the immediately preceding utterance from another speaker |

Each is scored 1–5 with a mandatory one-sentence rationale grounded in the transcript
(guardrail against a bare, indefensible number — unchanged reasoning from the original plan).
Aggregate score: simple sum, /20, breakdown always visible — never collapsed to a single
opaque number, for the same evaluator-trust reason as before.

### 2.2 Layer B — Acoustic-signal analytics (NEW — this is the syllabus-alignment layer) **[Mod 1] [Mod 2] [CO 1, CO 2]**

Computed directly from the raw audio waveform, per speaker, using open-source signal-
processing libraries running locally (no cloud call, no per-request cost, no rate limit —
verified library choices in the companion Architecture Plan §3). This layer exists specifically
because **Module 2 of the syllabus ("Basics of Digital Speech Processing") is explicitly about
sampling, frequency, amplitude, and noise** — concepts a pure-transcript rubric cannot touch
no matter how sophisticated its wording is. A "speech technology" project that never opens
the waveform is a text-analytics project wearing a speech-technology name tag.

| Metric | What it measures | Syllabus module it demonstrates | How it's computed |
|---|---|---|---|
| Pitch (F0) statistics — mean, range in semitones, variability | Vocal pitch characteristics per speaker | Module 1 (voice production) + Module 2 (frequency) | Praat's autocorrelation pitch tracker via `parselmouth`, run on each speaker's isolated audio segments |
| Energy / RMS amplitude statistics — mean, variability | Loudness and vocal effort per speaker | Module 2 (amplitude) | `librosa` short-time RMS energy over the speaker's segments |
| Pause / silence structure — session-wide silence ratio, per-speaker pause count and average pause length | Speech vs. non-speech segmentation, turn-taking rhythm | Module 2 (speech signals, noise) + Module 1 (importance of speech in communication — pauses are part of that) | Frame-level voice-activity detection (`webrtcvad`) run on the full session audio, cross-referenced against diarized speaker boundaries |
| Waveform + spectrogram visualization (session-level and, time permitting, per-speaker) | A literal, inspectable picture of the digital speech signal | Module 2's own stated hands-on activity: **"Observing speech waveforms"** | `librosa` + `matplotlib` (non-interactive Agg backend), rendered server-side to a PNG |

**What is deliberately NOT built here, and why:** pronunciation scoring, accent detection, and
emotion-from-acoustics are excluded per §1's fairness constraint — pitch/energy variance is a
real, measurable signal, but treating it as a proxy for confidence or emotional state is not
scientifically defensible at this project's scope, and doing so anyway would be exactly the
kind of impressive-looking, unreliable claim a technical evaluator tests first.

### 2.3 Layer C — Transcript-and-timestamp-derived analytics (cheap, no audio DSP needed) **[Mod 2] [CO 2]**

These come straight out of AssemblyAI's returned JSON (words array with per-word timestamps
and the `disfluencies` flag) plus simple text statistics — no signal processing required,
computed in the Node backend, not the Python service:

| Metric | Computation |
|---|---|
| Speaking time + participation % | Sum of each speaker's utterance durations from AssemblyAI's timestamps, divided by session duration |
| Word count + Words Per Minute (WPM) | Word count ÷ (speaking time in minutes) — a pace figure, not a "good/bad" score |
| Filler word count + rate | AssemblyAI's `disfluencies: true` parameter returns filler tokens ("um", "uh", "hm") directly in the timestamped words array, so this is a straight count against that returned set — no custom regex or heuristic detector needs to be built at all (verified against AssemblyAI's own docs, 14 July 2026 — see Architecture Plan §2 for the citation) |
| Speaking turns + average turn duration | Count of utterance boundaries per speaker from AssemblyAI's diarized `utterances` array |
| Vocabulary diversity (MTLD) | Measure of Textual Lexical Diversity, computed on each speaker's concatenated transcript text — chosen specifically over a raw type-token ratio because TTR is sensitive to text length (a student who spoke more automatically scores differently even at equal vocabulary richness), while MTLD is designed to be length-independent, which matters here because speaking time already varies a lot across a 3–6 person GD |

### 2.4 Layer D — The LLM's role, now explicitly narrower and grounded **[Mod 3] [CO 3]**

The LLM is used for exactly two things, and nothing else:

1. **The four rubric dimensions in §2.1** (unchanged prompt structure, carried over from the
   original plan's §2.1 — see this document's §6 for the exact prompt).
2. **A short communication summary** (2–3 strengths, 2–3 areas for improvement) that must be
   grounded in the transcript **and** the Layer B/C numbers already computed — the LLM is
   explicitly instructed not to invent a new judgment about pace, filler use, or vocal energy
   that contradicts or duplicates what was already measured deterministically. This is not
   "asking the LLM to also do speech analytics" — the analytics are done first, by
   non-LLM code, and handed to the LLM as *context* for a plain-language summary a TPO
   can read in ten seconds. Concretely: if the measured WPM is 165, the LLM is told that
   number and asked to describe what a slightly fast pace might mean for clarity — it is not
   asked to guess the pace from the transcript alone.

### 2.5 Rubric validation against a human baseline (kept from the original plan, unchanged reasoning)

During the mid-build phase, 2–3 already-recorded test sessions get scored by 1–2 people by
hand against the same four-dimension rubric, independently of the LLM's output. Compare
per-dimension agreement within 1 point on a 1–5 scale; write the actual numbers into the
final report, not just "we validated it." This remains the single most predictable question a
skeptical evaluator asks, and having a real (even modest) agreement figure is more credible
than an unstated claim of accuracy — unchanged from the original plan's own reasoning.

**What this explicitly is not:** a formal inter-rater-reliability study (no Cohen's kappa) — that
remains disproportionate for a solo mini-project and isn't necessary to make the point.

### 2.6 Curriculum Crosswalk — the whole mapping in one table (NEW)

This is the single table a viva panel can be handed directly. Every row is a real, already-built
piece of the system — nothing here is aspirational or was added just to fill a row. Course
Outcomes (CO1–CO5) are quoted from the syllabus's own "Course Outcomes" section.

| Syllabus Module | Syllabus topic actually exercised | Course Outcome | Where it lives in RoundTable AI |
|---|---|---|---|
| **Module 1** — Introduction to Speech & Speech Technology | Voice production; basic components of speech; speech signals | **CO1** — explain basic principles of human speech and speech technology | Layer B's pitch/F0 extraction is a direct, hands-on instance of "voice production" as a measurable signal (§2.2); the Signal Lab screen (Screen 4) is the platform's version of the syllabus's own "voice recording and analysis" activity |
| **Module 2** — Basics of Digital Speech Processing | Sampling, frequency, amplitude, noise; speech storage; speech enhancement basics; **"observing speech waveforms"** activity named explicitly | **CO2** — understand the process of converting speech into digital information | Layer B in full: `librosa`-computed RMS energy (amplitude), `parselmouth` pitch tracking (frequency), `webrtcvad` pause/silence detection (noise vs. speech segmentation), and the waveform + spectrogram PNGs on Screen 4 — this module's "observing speech waveforms" activity is not just satisfied, it's the platform's headline visual |
| **Module 3** — Speech Recognition & Synthesis | Speech-to-text; how computers understand human speech; AI in speech systems | **CO3** — describe speech recognition and speech synthesis systems | The entire AssemblyAI transcription + diarization pipeline (§9 Phase 3) *is* a real, production-grade speech-recognition system the student integrated and can explain end-to-end — diarization (speaker separation) specifically demonstrates a step beyond plain STT that the syllabus's own Module 3 gestures at ("how computers understand human speech" as a multi-speaker problem) |
| **Module 4** — Speech Technology Applications in Different Domains | IT applications: voice-controlled applications, human-computer interaction; Soft-skill applications: voice communication improvement, speech clarity, professional communication | **CO4** — identify applications of speech technology in IT and communication sectors | The whole product *is* an IT-sector application of speech technology to a real institutional workflow (placement assessment); Layer A's four rubric dimensions map directly onto the syllabus's own named soft-skill applications list |
| **Module 5** — Mini Project and Presentation | Problem identification, basic design, implementation/demo, report preparation, presentation | **CO5** — develop a basic speech-based solution through a mini project | The three companion documents (this one, the Architecture Plan, the HLD/LLD) *are* the "basic design" and "report preparation" deliverables the syllabus asks for; §10's demo runbook and the golden-fallback session are the "implementation/demo" deliverable; §11's checklist doubles as a submission checklist |

**How this maps onto the syllabus's own Assessment Pattern**, so a TPO/evaluator scoring the
mini-project against the syllabus's 100-mark rubric can see exactly where credit is earned:

| Assessment component (from syllabus) | Marks | What in this project earns it |
|---|---|---|
| Practical Activities | 30 | The DSP layer's own test suite (`pytest`, Architecture Plan §9) against known synthetic signals is a literal instance of the syllabus's Module 2 activities ("recording and editing audio files", "removing noise from audio samples", "observing speech waveforms") done as engineering work, not just a classroom exercise |
| Assignment/Case Study | 20 | §2's per-metric syllabus-module reasoning and §2.6 above are the case-study-style justification a written assignment would ask for, already produced as project documentation |
| Mini Project | 30 | The full working platform — recording/upload, transcription, DSP analysis, rubric scoring, scorecard |
| Presentation & Viva | 10 | §10's runbook exists specifically to make this go well |
| Attendance & Participation | 10 | Outside this document's scope — institutional, not technical |

---

## 3. SYSTEM ARCHITECTURE — SUMMARY (full detail in the companion Architecture Plan)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Matches the original plan; `wavesurfer.js` v7 (Record + Spectrogram plugins) handles both the live recording waveform and the post-hoc signal visualization in-browser |
| Backend API + worker | Node.js + TypeScript, single codebase | Orchestration, Postgres access, calls to AssemblyAI/Gemini/Groq, calls to the DSP microservice |
| **NEW — Speech DSP microservice** | Python + FastAPI, containerized separately | The only place Python appears; `librosa` + `parselmouth` + `webrtcvad` for pitch/energy/pause extraction and waveform/spectrogram image generation — see Architecture Plan §3 for the exact library choices and why each was picked over its alternatives |
| Database | PostgreSQL 16, in Docker, local | No expiry, no spin-down, no ephemeral-filesystem risk |
| Object storage | Local Docker named volume (audio files + generated PNGs) | Removes the Cloudflare R2 signup/card uncertainty entirely by not needing it |
| Transcription + diarization | AssemblyAI (Universal-2, `speaker_labels: true`, `disfluencies: true`) | Verified free tier: $50 one-time credit, no card required, ≈185 hours of pre-recorded transcription — comfortably more than a solo 1–2 week build will use |
| LLM scoring + summary | Gemini 2.5/3 Flash-Lite (primary), Groq `llama-3.1-8b-instant` (fallback) | Verified free-tier limits as of mid-2026: Flash-Lite ≈15–30 RPM / up to 1,500 RPD; Groq's 8B model ≈14,400 RPD — both comfortably cover a handful of per-student calls per session, sequential, no risk of bursting past RPM |
| Auth | Better Auth, single admin/TPO role, session-based | Lucia (used in some earlier explorations of this space) is now formally deprecated as of March 2025; Better Auth is the actively-maintained, DB-agnostic, TypeScript-first replacement — verified 14 July 2026 |
| Hosting | Docker Compose, one machine, final decision | See §0 for the exact Render facts that make this the safer call, not just the simpler one |

---

## 4. TIER LIST — WHAT MUST BE REAL, WHAT'S A STRETCH, WHAT'S CUT

### TIER 1 — Core loop, must be 100% real, no exceptions

- Auth: single TPO/admin account, session-based, no student accounts, no role selection UI (there is only one role)
- Session Setup: topic, 3–6 participants, "all participants 18+" confirmation checkbox
- Consent + Recording/Upload (NEW dual path): consent text shown and must be checked before either path activates; `wavesurfer.js` Record plugin for live waveform + timer with upload on stop, **or** a file-upload zone accepting a pre-recorded file, validated and normalized to WAV server-side (§1a, Architecture Plan §2a) — both paths land in the identical `sessions.status='uploaded'` state
- Transcription + diarization pipeline: AssemblyAI call with `speaker_labels: true`, `disfluencies: true`; speaker-count mismatch detection and warning (kept from original plan)
- Speaker mapping screen: TPO assigns AssemblyAI's A/B/C labels to real names
- **DSP analysis pipeline (NEW, Tier 1)**: per-speaker pitch/energy/pause extraction + session waveform/spectrogram image, via the Python microservice
- Transcript-derived analytics (NEW, Tier 1): WPM, filler rate, turns, vocabulary diversity — computed in Node, no audio needed
- LLM scoring pipeline: four rubric dimensions + grounded communication summary, sequential per-student calls, Gemini→Groq fallback on 429
- Scorecard screen: rubric breakdown + analytics block + communication summary + low-data flag
- Cohort dashboard: cross-session ranking
- CSV export of a session's scorecard

### TIER 2 — Build if ahead of schedule, still must be 100% real if attempted

- **Signal Lab screen** (dedicated per-speaker waveform/spectrogram explorer, beyond the scorecard's inline session-level image) — strong demo differentiator, but the *data* being real (Tier 1's PNG generation) matters more than this screen's polish
- Automatic pace classifier (Slow/Normal/Fast) cross-checking WPM against a syllable-nuclei energy-peak count — a known, deterministic technique (energy-peak picking on the amplitude envelope), not ML; genuinely nice-to-have, not required for the core claim
- Per-speaker (not just session-level) spectrogram images
- A short spoken audio summary via TTS (Module 3 alignment — text-to-speech) — flagged as a real stretch specifically because it is the only feature that would add a *third* cloud dependency; do not attempt it if Tier 1 isn't rock-solid first

### TIER 3 / EXPLICIT CUT LIST — do not attempt, never claim these exist

- Pronunciation scoring, accent classification, emotion-from-acoustics detection — excluded per §1's fairness/defensibility constraint, not a time-budget cut
- Eye-contact / body-language / video analysis of any kind — audio-only is a locked scope decision, not a stretch goal waiting to be unlocked
- Any automated pass/fail or hire/reject verdict — the platform is a scorecard generator for a human, full stop
- Multi-mic / multi-track capture (WebRTC SFU or similar) — explicitly future work
- A formal inter-rater-reliability statistic (Cohen's kappa) for the rubric validation — disproportionate for this scope

**Rule for the whole build:** at every phase gate (§9), re-check this tier list against what's
actually finished. Anything not real by the final integration phase moves to Cut and is
stripped from the README draft — same discipline as the original plan.

---

## 5. DATABASE SCHEMA — CONCRETE TABLES (design decision, meant to be copy-pasteable)

Carried over from the original plan's schema where unchanged, with the additions needed for
Layers B/C of §2 called out explicitly.

```sql
-- One row for the single TPO/admin account (Better Auth manages the underlying
-- session/credential tables; this extends it with role/institution info)
create table admin_profiles (
  id uuid primary key references "user"(id), -- Better Auth's user table
  full_name text not null,
  institution_name text not null,
  created_at timestamptz default now()
);

-- One row per GD session (one recording, one topic, one group of students)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references admin_profiles(id) not null,
  topic text not null,
  scheduled_at timestamptz,
  status text not null default 'created',
    -- 'created' | 'recording' | 'uploaded' | 'transcribing' | 'mapped'
    -- | 'analyzing' | 'scoring' | 'complete' | 'failed'
  audio_local_path text,        -- path inside the Docker volume, null until upload completes
  recording_source text not null default 'live',  -- NEW — 'live' | 'uploaded', record-keeping only
  original_filename text,       -- NEW — only set when recording_source='uploaded'
  original_format text,         -- NEW — e.g. 'mp3', 'm4a', 'wav' — the pre-transcode format
  duration_seconds int,
  consent_confirmed boolean not null default false,
  retain_until timestamptz,     -- deletion policy, set at creation (see §8)
  expected_speaker_count int not null,
  speaker_count_mismatch boolean not null default false,  -- [carried over from original plan]
  session_waveform_png_path text,      -- NEW — session-level waveform image
  session_spectrogram_png_path text,   -- NEW — session-level spectrogram image
  session_silence_ratio numeric,       -- NEW — fraction of session that is non-speech
  created_at timestamptz default now()
);

-- One row per student participating in a session
create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  display_name text not null,
  speaker_label text,  -- 'A' / 'B' / 'C' — AssemblyAI's label, mapped by the TPO
  created_at timestamptz default now()
);

-- Raw diarized+transcribed utterances, one row per utterance from AssemblyAI
create table utterances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  speaker_label text not null,   -- AssemblyAI's raw label, before name-mapping
  text text not null,
  start_ms int not null,
  end_ms int not null,
  sequence_index int not null,
  created_at timestamptz default now()
);

-- NEW — per-participant, per-session acoustic + transcript-derived analytics
-- (Layers B and C of §2), separate from the LLM rubric (`scores` table below)
-- so the two are visibly distinct kinds of measurement, not blended into one row
create table speech_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  participant_id uuid references participants(id) not null,

  -- Layer C — transcript/timestamp-derived (Node, no audio DSP)
  speaking_time_ms int not null,
  participation_pct numeric not null,
  word_count int not null,
  wpm numeric not null,
  filler_count int not null,
  filler_rate numeric not null,          -- fillers per 100 words
  turns_count int not null,
  avg_turn_ms numeric not null,
  vocab_mtld_score numeric,              -- null if too few words for a stable MTLD estimate

  -- Layer B — acoustic-signal-derived (Python DSP microservice)
  pitch_mean_hz numeric,
  pitch_range_semitones numeric,
  energy_rms_mean numeric,
  energy_rms_std numeric,
  pause_count int,
  avg_pause_ms numeric,
  speaker_waveform_png_path text,        -- null unless Tier 2's per-speaker image is built
  speaker_spectrogram_png_path text,     -- null unless Tier 2's per-speaker image is built

  computed_at timestamptz default now()
);

-- One row per (participant, session) — the LLM rubric result (Layer A + D of §2)
create table scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  participant_id uuid references participants(id) not null,
  topic_relevance_score int not null,
  topic_relevance_rationale text not null,
  initiative_engagement_score int not null,
  initiative_engagement_rationale text not null,
  coherence_structure_score int not null,
  coherence_structure_rationale text not null,
  responsiveness_score int not null,
  responsiveness_rationale text not null,
  aggregate_score int not null,          -- stored, not computed, so history doesn't shift
  flagged_low_data boolean not null default false,
  communication_summary_strengths text[] not null,     -- NEW
  communication_summary_improvements text[] not null,  -- NEW
  llm_provider text not null,            -- 'gemini' or 'groq'
  created_at timestamptz default now()
);

-- Async pipeline state — the job queue
create table jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  job_type text not null,    -- 'transcription' | 'dsp_analysis' | 'scoring'  [dsp_analysis is NEW]
  status text not null default 'queued',
    -- 'queued' | 'in_progress' | 'complete' | 'failed'
  error_message text,
  attempts int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Explicit consent record — one per session
create table consent_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  confirmed_by uuid references admin_profiles(id) not null,
  consent_text_version text not null,
  confirmed_at timestamptz default now()
);
```

Indexes worth adding on day one: `sessions(status)` and `jobs(status, job_type)` (the worker
polls on both), `utterances(session_id, sequence_index)` (transcript view always queries in
order), `speech_metrics(session_id, participant_id)` (unique — one analytics row per student
per session).

---

## 6. THE LLM PROMPT — EXACT STRUCTURE (design decision, not a vendor-verified fact)

Carried over from the original plan's §2.1, with the communication-summary addition from this
plan's §2.4 folded in as a second required output block in the same call (one call per student
per session, not two, to stay inside the free-tier RPM budget comfortably):

```
SYSTEM:
You are scoring one student's contribution to a recorded group discussion for
a campus placement/academic evaluation. You will be given the GD topic, every
utterance made by ONE student (each annotated with the utterance immediately
before it, from any speaker, or "none" if it was the first utterance of the
session), and a set of objectively measured speech analytics for this student
that were computed by non-AI code before this prompt was written — you must
treat these numbers as ground truth, not estimate your own.

Score this student, and ONLY this student, on four dimensions from 1-5:
topic_relevance, initiative_engagement, coherence_structure, responsiveness.
For each dimension, provide a one-sentence rationale grounded in specific
things the student said. Do not invent content not present in the transcript.
If the student has very few utterances, say so explicitly in the rationale
rather than inflating the score to seem fair.

Then write a short communication summary: 2-3 strengths and 2-3 areas for
improvement, in plain language a non-technical evaluator can read in ten
seconds. Ground every strength/improvement in either the transcript or the
provided analytics numbers. Do not describe the student's emotional state,
confidence, or personality from the pitch/energy numbers — these measure
vocal signal properties only, not psychological traits. If the analytics
numbers don't clearly support a strength or improvement claim, omit that
claim rather than speculating.

Respond with ONLY valid JSON matching this exact schema, no other text:
{
  "topic_relevance": {"score": <1-5>, "rationale": "<string>"},
  "initiative_engagement": {"score": <1-5>, "rationale": "<string>"},
  "coherence_structure": {"score": <1-5>, "rationale": "<string>"},
  "responsiveness": {"score": <1-5>, "rationale": "<string>"},
  "flagged_low_data": <true if fewer than 3 utterances, else false>,
  "communication_summary": {
    "strengths": ["<string>", "<string up to 3>"],
    "improvements": ["<string>", "<string up to 3>"]
  }
}

USER:
GD Topic: "{topic}"

Measured speech analytics for this student (computed independently, treat as
ground truth):
- Speaking time: {speaking_time_seconds}s ({participation_pct}% of session)
- Words per minute: {wpm}
- Filler word rate: {filler_rate} per 100 words
- Speaking turns: {turns_count} (average {avg_turn_seconds}s each)
- Vocabulary diversity (MTLD): {vocab_mtld_score}
- Pitch: mean {pitch_mean_hz} Hz, range {pitch_range_semitones} semitones
- Energy (RMS): mean {energy_rms_mean}, variability {energy_rms_std}
- Pauses: {pause_count}, average {avg_pause_ms}ms

Student's utterances (chronological):
1. [preceding: "{prev_speaker_text or 'none'}"] "{utterance_1}"
2. [preceding: "{prev_speaker_text}"] "{utterance_2}"
...
```

Why JSON-only output matters (unchanged reasoning from the original plan): the worker parses
this directly into the `scores` table; a free-text response would need a second, fallible
parsing pass, so strict JSON removes an entire failure mode for zero extra cost.

---

## 7. FRONTEND — DESIGN SYSTEM + SCREENS

### 7.0 Design direction (NEW — was a one-line note, now a real system)

**Brief:** an evaluator-facing internal tool that also has to read, in a live demo, as a
credible signal-processing product — not a generic admin-panel CRUD app, and not a flashy
consumer landing page either. The design language leans into the one thing this product
actually has that most mini-projects don't: a genuine audio waveform/spectrogram at its core.
Motion and visual interest are used to *make the signal-processing feel tangible* (a card that
reacts like a soundwave, a cursor that leaves a trail like an oscilloscope), not bolted on for
novelty. Every animated component below has a specific job; nothing is decoration with no
reason to exist, which is also just good practice for a 1–2 week solo build's time budget.

**Base stack:** React 18 + TypeScript + Vite (unchanged, Architecture Plan §1) + Tailwind CSS
as the styling layer + `motion` (the current name for Framer Motion, the engine under most of
the libraries below) for animation orchestration + `shadcn/ui` as the accessible-primitive base
(Radix-based, unstyled-by-default, exactly what several of the libraries below are themselves
built on top of, so they compose cleanly instead of fighting each other).

**Named component libraries used, each for a specific, bounded purpose — full installation
detail and per-component rationale in the companion Architecture Plan §2b:**

| Library | What it's used for here | Why this one, not a generic alternative |
|---|---|---|
| **React Bits** (reactbits.dev) | The Cohort Dashboard's participant/session browsing view, adapted from its Circular Gallery component into a horizontal scroll-linked strip of session cards | React Bits ships as copy-paste TypeScript + `ogl`/CSS, not an npm dependency tree — fits a solo build that wants full control over one specific striking element without inheriting a whole design system |
| **Animate UI** (animate-ui.com) | Every checkbox, switch, and accordion in the product — the consent checkbox (Screen 2), the 18+ confirmation (Screen 1), the rubric-dimension rationale accordions (Screen 5) | It's a `shadcn`-registry distribution built on Radix primitives with Motion-powered animation already wired in — meaning full keyboard/screen-reader accessibility *and* the animated feel, for free, on exactly the form controls a consent-driven, evaluator-facing tool needs to get right |
| **Motion Primitives** (motion-primitives.com) | `ScrollProgress` at the top of the Scorecard (long per-student cards benefit from a progress cue), `Spotlight` on the Session Setup form's active field, `Tilt` on Cohort Dashboard ranking cards, `MorphingDialog` for the "expand a scorecard from the cohort table" interaction | A focused, composable set of exactly these interaction primitives with clean Tailwind + Motion code, easy to drop into specific spots without adopting a whole template |
| **Cult UI** (cult-ui.com) | `HoverVideoPlayer` pattern, repurposed for **hover-to-preview a speaker's audio snippet** on the Speaker Mapping screen — hovering a detected-speaker card plays a few seconds of that speaker's isolated audio, the same interaction shape as previewing a video clip | The exact "hover reveals a short media preview, unhover stops it cleanly" behavior this screen needs already exists here, built correctly (debounced, no memory leak on rapid hover) rather than reimplemented from scratch |
| **Skiper UI** (skiper-ui.com) | The Session Setup and Processing screens' step-based layout components | A component set specifically strong on multi-step/wizard-style flows, which is exactly Screens 1→3's shape |
| **Animata** (animata.design) | `Interactive Grid` background on the landing/login screen only | A subtle, low-cost ambient background that signals "this is a technical product" the instant the app loads, contained to one low-stakes screen so it never competes with data on the working screens |
| **Vengeance UI** (vengenceui.com — verify current domain at build time, vendor sites move) | The `CursorCard` hover-glow treatment on the Signal Lab's waveform/spectrogram image cards | A focused hover-glow/spotlight-on-card effect that draws the eye to the waveform image specifically — used on exactly one screen, where the visual *is* the point |
| **anime.js** (animejs.com) | Timeline-synced entrance animation for the Scorecard's four rubric sub-scores, so they animate in together in a visibly synchronized sequence when a scorecard first renders | `anime.timeline()`'s explicit multi-target sync is a better fit here than four separate Motion animations coordinated by hand — the one place in this app where a dedicated timeline engine earns its inclusion over the Motion-based stack used everywhere else |
| **Iconsax** (app.iconsax.io) | The icon set for the whole app — animated variants used sparingly, on the Processing screen's step tracker only (an icon that visibly completes a small animation when a pipeline step finishes) | A large, consistent icon family with an animated variant available exactly where a state-change moment (step completing) benefits from a small motion cue, avoiding the mixed-icon-set look a lot of solo projects end up with |

**Restraint, stated explicitly:** this is a 3–6-person evaluator-facing GD assessment tool, not
a marketing site — every library above is scoped to one or two specific screens/components, not
applied uniformly everywhere. The Scorecard and Cohort Dashboard, where a TPO needs to *read
data quickly*, stay closer to the Skiper UI/shadcn baseline with restrained motion; the
Session Setup, Signal Lab, and Speaker Mapping screens, where a "wow, this is a real
signal-processing product" first impression matters more, carry the heavier visual treatment
(React Bits, Vengeance UI, Animata). Reduced-motion (`prefers-reduced-motion`) is respected
throughout — every library listed supports it natively, and this is not optional given the
product will be demoed on unpredictable venue hardware.

### 7.1 Screens

Seven screens (the original plan had five; this revision adds the Signal Lab and splits
Recording into a proper dual-path screen).

**Screen 0 — Login.** Better Auth's single-form flow; the only screen carrying Animata's
Interactive Grid background, per the restraint note above.

**Screen 1 — Session Setup. [Mod 5 — "problem identification, basic design"]** Topic,
scheduled date/time, 3–6 participant name fields, "all participants 18+" confirmation checkbox
(Animate UI checkbox). Skiper UI's step-layout primitive frames this as step 1 of the
Setup→Consent→Record flow; Motion Primitives' `Spotlight` highlights whichever field currently
has focus.

**Screen 2 — Consent + Recording/Upload (dual path). [Mod 1, Mod 2 — "voice recording and
analysis" / "recording and editing audio files"]** Consent text (§8) shown in full above a
two-tab control: **Record Live** or **Upload Recording** — the consent checkbox (Animate UI)
must be checked before *either* tab activates, and the checkbox state is shared across both
tabs since it's one consent act regardless of source.
  - *Record Live tab:* `wavesurfer.js` v7 Record plugin renders a live waveform during
    recording (the Spectrogram plugin can optionally run live here too — genuinely cheap given
    it's already in the same library, and a strong first-impression signal this is a
    signal-processing-aware product). On stop: automatic upload with a real progress bar and
    explicit states ("Uploading…", "Upload failed, retrying…", "Upload complete").
  - *Upload Recording tab (NEW):* a drag-and-drop zone (Skiper UI) accepting common audio
    formats; on drop, the file's client-side-readable metadata (duration, format) is shown
    immediately, then the file uploads with the same progress-bar states as the live path,
    followed by an explicit "Normalizing audio…" state while server-side `ffmpeg` transcoding
    runs (Architecture Plan §2a) before the session can proceed.
  - Both tabs converge on the same `sessions.status='uploaded'` outcome (§1a), and the screen
    makes this explicit with a shared "Ready — proceeding to transcription" confirmation state
    regardless of which tab was used.

**Screen 3 — Processing. [Mod 3 — "how computers understand human speech"]** A step tracker:
"Uploaded ✓ → Transcribing… → Awaiting speaker mapping → Analyzing speech signal… → Scoring →
Complete." Iconsax's animated icon variants mark each step's completion. Speaker-count-mismatch
warning banner carried over unchanged. Speaker mapping happens inline here: a short audio
snippet per detected speaker label, with Cult UI's hover-preview pattern (hover a speaker card
to hear a few seconds of that speaker's isolated audio) before assigning it to a participant
name via dropdown — genuinely useful here, not just decorative, since matching a voice to a
name from a short clip is exactly the task this screen exists to do.

**Screen 4 — Signal Lab. [Mod 1, Mod 2 — "observing speech waveforms," the syllabus's own
named activity]** A per-session view showing the full-session waveform and spectrogram
(generated by the Python DSP service), with diarized speaker segments color-overlaid on the
waveform. Vengeance UI's cursor-glow card treatment wraps the waveform/spectrogram images
specifically, since this is the one screen where drawing the eye to the image *is* the point.
If Tier 2's per-speaker images are built, this screen also lets the TPO switch between
speakers, with a `MorphingDialog` (Motion Primitives) expanding a speaker's image to full view.
This is the screen that makes the "speech technology" claim visually undeniable in a demo.

**Screen 5 — Scorecard. [Mod 4 — soft-skill applications]** Per-student cards: name, aggregate
rubric score (large, /20), the four sub-scores with rationale (Animate UI accordion,
collapsible), the analytics block from Layers B/C (speaking time, WPM, filler rate, turns,
vocabulary diversity, pitch/energy summary — presented as neutral measurements, not scores),
and the LLM's communication summary (strengths/improvements). The four rubric sub-scores
animate in on a synchronized `anime.timeline()` sequence when the card first renders — a
small, specific, functional use of anime.js rather than a second general-purpose animation
engine competing with the Motion-based stack elsewhere. A `ScrollProgress` bar (Motion
Primitives) tracks position through a long scorecard. `flagged_low_data` students get a
visible amber badge. Synchronized transcript panel below, color-coded by speaker,
timestamp-linked to a hidden audio player. "Export CSV" button.

**Screen 6 — Cohort Dashboard. [Mod 5 — "report preparation"]** Sortable cross-session table
(name, topic, aggregate score, rank), filter by date/topic. Session cards use a React
Bits-derived horizontal scroll gallery for browsing past sessions visually before drilling into
the sortable table; ranking rows use Motion Primitives' `Tilt` on hover for a subtle
depth cue, restrained relative to Screen 4's heavier treatment per the restraint note above.

**What is deliberately not a separate screen:** any student-facing view (there isn't one, per
§1's locked scope). Login is the only screen where visual flourish is untethered from a
specific data-reading task, which is exactly why it's the one screen carrying an ambient
background effect and nothing else.

---

## 8. CONSENT, SECURITY, AND RETENTION — CONCRETE, NOT ASPIRATIONAL

**Consent notice text** (draft — review against your institution's actual policy before use;
this is not legal advice), updated to name the acoustic-analytics layer explicitly, since a
notice that only mentions "AI transcription and scoring" would not adequately disclose that
pitch/energy signal analysis is also being performed on the recording. The same text applies
identically whether the recording is captured live in-browser or uploaded as a pre-recorded
file (§1a) — consent is about what happens to the recording, not how it was captured, so no
separate notice variant is needed for the Upload Recording path on Screen 2:

> This group discussion will be audio-recorded for the purpose of academic/placement
> assessment. The recording will be processed using a third-party AI service, AssemblyAI, for
> transcription and speaker separation (on AssemblyAI's free tier, submitted audio may be
> used, after automated removal of personally identifying information, to help improve
> AssemblyAI's speech models, as AssemblyAI's free tier does not currently offer an opt-out
> from this). A second third-party service, Google Gemini (with Groq as a technical fallback),
> is used to generate a relevance-based scorecard and a plain-language communication summary
> from the anonymized transcript text only — student names are never sent to either LLM
> service. Separately, the platform analyzes acoustic properties of the recording itself
> (pitch, loudness, pauses) using software that runs locally and does not send audio to any
> third party for this specific analysis. These acoustic measurements describe vocal signal
> properties only — they are not used to infer emotion, confidence, or any psychological
> trait. The resulting scorecard is reviewed by [institution name]'s placement/admissions
> team. Recordings are retained for [N] days after scoring is confirmed, after which the raw
> audio is deleted; anonymized transcripts, scores, and analytics may be retained longer for
> record-keeping. You may withdraw consent at any time before your session is scored by
> informing the evaluator, in which case your recording will not be processed and will be
> deleted. If any participant is under 18, separate parental/guardian consent is required
> before this session can proceed.

**How consent is enforced in the product, not just written down:** the `consent_records` table
and the blocking checkbox on Screen 2 mean a session cannot move past the recording screen
without a consent confirmation existing in the database — a real constraint in the code.

**Name-stripping in LLM prompts (unchanged from the original plan):** the LLM only ever sees
utterance text, never a student's real name; names are joined back to scores only inside the
database, never in a prompt.

**Retention, made operational:** `sessions.retain_until` is set at session creation
(recommend N=14–30 days as a starting default for a short internship project — adjust to
whatever the actual institution wants). Since everything runs locally, the deletion job is a
simple scheduled task inside the Node backend (Docker container never spins down, so a
plain `node-cron` schedule — the same pattern verified for AssetFlow's local deployment —
runs it reliably, with no external cron service needed at all).

---

## 9. BUILD PHASES — SEQUENTIAL, DONE-CONDITION-GATED, NOT HOUR-MICROMANAGED

This plan deliberately does **not** break work into the kind of over-atomized, ordering-
conflict-prone micro-tasks seen when an autonomous coding agent was run against the original
plan (e.g., treating "create BUILD_LOG.md" and "create README.md" as separate numbered tasks
with their own dependency conflicts). Each phase below is a half-day-to-two-day unit of real,
demonstrable progress with one done-condition and one verification step — atomize further
yourself during actual implementation if that's how you personally work, but the plan itself
stays at this grain deliberately.

The phase list is written assuming ~10 working days at a comfortable pace; it compresses
cleanly to ~6–7 days full-time, or stretches to the full 2 weeks part-time — **only the
calendar pace is elastic, the phase order is not.**

| Phase | Deliverable | Done-condition | Verification |
|---|---|---|---|
| **1. Foundation** | Repo skeleton, Docker Compose (Postgres + Node app + Python DSP service, three containers), Prisma schema from §5 migrated, Better Auth wired with a single seeded admin account | `docker compose up` from a clean clone starts all three containers; admin login works; empty dashboard renders | Manually log in; confirm session cookie persists across a page reload |
| **2. Session Setup + Recording/Upload (Screens 1–2)** | Full session-creation flow through to a real audio file landing in the local Docker volume, via **either** path | A session row exists in Postgres with `status='uploaded'`, `recording_source` correctly set, and a real, normalized WAV file exists at `audio_local_path` regardless of which path produced it | Play the uploaded file back from disk to confirm it's valid; separately, deliberately test the upload path with a non-WAV file (e.g. an `.m4a` voice memo) to confirm `ffmpeg` normalization actually runs, not just the live path |
| **3. Transcription pipeline** | AssemblyAI integration: submit with `speaker_labels: true, disfluencies: true`; webhook-based completion (confirmed supported for pre-recorded transcription, not the polling fallback the original plan had to hedge on) | `utterances` rows populated correctly, speaker-labeled, filler tokens present in the raw word-level data | Test against 2–3 real recordings with actual overlapping speech and at least one deliberate "um/uh"-heavy speaker, not just clean single-speaker audio |
| **4. Speaker mapping + Processing screen (Screen 3)** | Inline mapping UI; speaker-count-mismatch detection and warning wired end to end | Step tracker reflects real pipeline state via polling; mismatch banner appears when AssemblyAI returns a different speaker count than `expected_speaker_count` | Deliberately test with a merged-speaker scenario (one very quiet participant) to confirm the mismatch banner actually fires |
| **5. Transcript-derived analytics (Layer C)** | WPM, filler rate, turns, MTLD vocabulary diversity computed in Node from AssemblyAI's returned data, written to `speech_metrics` | Every participant in a test session has a populated `speech_metrics` row with non-null Layer C fields | Hand-check one student's WPM and filler count against a manual count of their transcript |
| **6. Acoustic analytics (Layer B) — Python DSP microservice** | FastAPI service: given the session audio + diarized timestamps, isolate each speaker's segments, compute pitch/energy/pause stats, generate session waveform + spectrogram PNGs | `speech_metrics` rows get their Layer B fields populated; PNGs exist in the Docker volume and are viewable | Deliberately test on a session with one loud and one quiet speaker, confirm the energy statistics visibly differ in the expected direction |
| **7. Signal Lab screen (Screen 4)** | Waveform + spectrogram viewer with diarized speaker overlay | A TPO can open a completed session and see the actual waveform/spectrogram images with speaker segments marked | Visually confirm the color-coded segments line up with the actual speaker-mapped transcript timestamps |
| **8. LLM scoring pipeline** | Gemini Flash-Lite primary, Groq `llama-3.1-8b-instant` fallback on 429; the combined rubric+summary prompt from §6, fed the real Layer B/C numbers | Every participant gets a `scores` row with all four rubric fields, a communication summary, and a recorded `llm_provider` | Deliberately test with a very-low-utterance student to confirm `flagged_low_data` fires and the summary doesn't inflate the score |
| **9. Rubric validation pass (§2.5)** | 2–3 sessions hand-scored by a person independently of the LLM, compared against the LLM's actual output | A written paragraph with real per-dimension agreement numbers exists (not just "we validated it") | N/A — this phase's deliverable is the write-up itself |
| **10. Scorecard + Cohort Dashboard (Screens 5–6) + CSV export** | Full end-to-end loop viewable for one session; cross-session ranking table | A complete session, from recording to scorecard, is demoable start to finish | Run the entire pipeline once, live, timing it, to know what a real demo will feel like |
| **11. Retention job + consent enforcement wiring** | `node-cron` deletion job running in-process; consent checkbox blocking as a real constraint, not just a UI nicety | Manually force a `retain_until` into the past on a test session, confirm the audio file is actually deleted from the Docker volume while transcript/scores remain | Check the volume directly (`docker compose exec app ls ...`), don't just trust the UI |
| **12. Reliability hardening + demo-day rehearsal** | Retry logic on job failures (3 attempts, exponential backoff), a recorded "golden" fallback session pre-processed end to end, a written demo runbook (§10) | The golden session's scorecard is viewable with zero live API calls needed | Unplug from the internet (or block outbound traffic) and confirm the golden session's scorecard still renders correctly from local Postgres/disk |

---

## 10. DEMO-DAY / VIVA RUNBOOK

Because hosting is local Docker Compose, most of the original plan's demo-day risk (cold
Render containers, Supabase project pausing) simply does not exist here. What remains is the
two unavoidable cloud calls:

1. **The night before:** run one full real session through the entire live pipeline
   end-to-end, start to finish, to confirm AssemblyAI and Gemini are both reachable and
   responding normally, and to burn through any first-run friction on your own machine, not
   during the actual presentation.
2. **Morning of:** confirm `docker compose up` still brings up all three containers cleanly
   from a fresh terminal (not one left running from days ago that might have drifted).
3. **Have the golden fallback session's scorecard URL open in a second browser tab**, ready to
   switch to instantly if a live recording's AssemblyAI or Gemini call is slow or fails —
   narrate this openly rather than hiding it: "I'll run this live, and I have a pre-processed
   session ready in case the venue's network is unreliable" is a stronger statement to an
   evaluator than either hiding the fallback or not having one, exactly as the original plan
   argued.
4. **During the live demo, prefer recording a short (60–90 second) GD excerpt** rather than a
   full-length one — this keeps the AssemblyAI + Gemini round-trip time inside a comfortable
   live-demo window and keeps you well inside both services' free-tier per-minute rate limits
   even with a retry or two.
5. **If asked "what happens if this breaks in front of a real evaluator,"** the honest,
   credible answer is: "everything except transcription and LLM scoring runs entirely on this
   laptop, with no expiry and no cold start; if either of those two calls is slow, I have a
   fully pre-processed session ready to show instead." That is a stronger claim than most
   solo hackathon-style projects can make, and it's true because of the architecture, not
   because of luck.

---

## 11. FINAL DELIVERABLES CHECKLIST

- [ ] Public (or institution-shared) Git repository, README explaining setup + architecture
- [ ] `docker compose up` works from a genuinely clean clone
- [ ] This document, the companion Architecture Plan, and the companion HLD/LLD, included as
      the project's written architecture/feasibility documentation
- [ ] The corrected consent notice text (§8), shown as an actual artifact, not just described
- [ ] At least one real, live-recorded, fully-processed GD session as proof the pipeline
      genuinely works end to end — not just the golden fallback
- [ ] At least one session demoed via the **Upload Recording** path (§1a, Screen 2), separate
      from the live-recorded and golden-fallback sessions, as proof the dual-path design
      actually works and isn't just a written claim
- [ ] The golden fallback session, clearly labeled as such
- [ ] The rubric validation write-up from §2.5, with real numbers
- [ ] A short walkthrough covering: why the acoustic-signal layer exists and which syllabus
      module each metric maps to (§2, crosswalk table in §2.6), the architecture and why
      local-first hosting was chosen (§0), the rubric validation result, and the known
      limitations from §1 and §4's cut list — presenting limitations candidly is part of what
      makes this credible, not a weakness to hide

---

## WHAT'S STILL GENUINELY OPEN (stated honestly, not smoothed over)

- The exact per-speaker separation accuracy when a single room mic captures heavy overlapping
  speech is a real, unresolved risk for the acoustic-signal layer specifically (pitch/energy
  extracted from a poorly-isolated segment is noisier than from a clean one) — test this early
  (Phase 6) with genuinely overlapping test audio, not just clean single-speaker clips, and be
  honest in the final write-up about where this layer's numbers are less reliable.
- MTLD's stability on very short transcripts (a handful of utterances) is a known limitation of
  the metric itself, not an implementation bug — the schema's `vocab_mtld_score` is nullable
  specifically so a too-short transcript can report "not enough data" rather than a misleading
  number.
- Recent outage/incident history for AssemblyAI and Google's Gemini API should be checked in
  the days immediately before an actual demo date, not assumed stable from this document.
