# RoundTable AI — Agent Execution Rules
### Binding operating contract for any autonomous coding agent implementing this project
### Authority: `RoundTableAI_Execution_Plan.md`, `RoundTableAI_Architecture_Plan.md`, `RoundTableAI_HLD_LLD.md` — nothing else

---

## 0. AUTHORITY AND SCOPE

- These three documents, in this priority order, are the **entire specification**:
  1. **Execution Plan** — what to build, phases, tier list, schema, rubric/analytics design.
  2. **Architecture Plan** — how it's built: stack, libraries, service boundaries, env contract.
  3. **HLD/LLD** — module-by-module flow, sequence diagrams, state machines.
- No other document, prior project, training-data convention, or general best-practice
  instinct outranks these three. Where the agent's own default behavior would differ from what
  is written here, this document wins.
- If any file the plan references as a "companion" is not actually present in the repo or
  provided context, proceed using only the three documents above. Do not treat an absent,
  unreferenced-by-name file as a blocker.
- The agent does not re-scope, re-architect, or "improve" any locked decision (Execution Plan
  §0, §1, §1a; HLD/LLD §5 "What's Locked") without an explicit human instruction to do so. A
  locked decision being technically improvable is not grounds to revisit it.

---

## 1. TASK GRANULARITY — LOCKED TO THE §9 PHASE TABLE, NOTHING FINER

- **Execution Plan §9's twelve phases are the complete and only task breakdown.** Each phase
  is one indivisible unit of delivery: one implementation pass, one documentation update, one
  done-condition check, one verification step — exactly as that table specifies, no more.
- The agent does not invent a secondary task-numbering scheme, does not split a phase into an
  ordered sub-task dependency graph, and does not create a task whose only purpose is to audit
  or verify a task just completed in the same phase. If the agent is not confident a phase's
  own done-condition is met, it fixes that before reporting the phase complete — it does not
  schedule a separate follow-up task to check later.
- **Documentation is the last step inside each phase, not a phase of its own.** `README.md` and
  `BUILD_LOG.md` are both created the first time Phase 1 closes and updated once at the close of
  every phase after that — never created in one phase and audited in a later one.
- Internal ordering of work *within* a phase (which file to write first, which helper function
  to build before another) is the agent's own business and is never escalated to the human.
  Only the phase-level done-condition and verification step (§9's table columns) are reported.

---

## 2. DECISION AUTHORITY MATRIX

### 2A. Decide silently, log one line, proceed — never escalate these

Every item below already has its answer fixed somewhere in the three documents, or has an
obvious standard the documents implicitly rely on. The agent applies it and writes one line
into that phase's `BUILD_LOG.md` entry. It does not ask.

| Decision | Where it's already settled |
|---|---|
| Environment variable names | Already enumerated verbatim in Architecture Plan §8 (`POSTGRES_PASSWORD`, `DATABASE_URL`, `APP_BASE_URL`, `DSP_SERVICE_URL`, `BETTER_AUTH_SECRET`, `ASSEMBLYAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`). Use exactly these names, nothing else — there is no naming decision left to make |
| Retention period value | Execution Plan §8 recommends N=14–30 days as a starting default. Use 30 unless told otherwise; note in the log that it's an adjustable default, not a fixed requirement |
| Transcription completion mechanism | Architecture Plan §1/§2 confirm webhook support directly, with polling as a documented fallback only — implement webhook as primary; only fall back to polling if the webhook demonstrably fails in testing, and log which path is active |
| LLM provider order | Architecture Plan §1/§7 fix this: Gemini Flash-Lite primary, Groq `llama-3.1-8b-instant` fallback on 429, called strictly **sequentially**, never fanned out in parallel — this is not re-decided per phase |
| Recording-source normalization | Architecture Plan §2a fixes this: every uploaded file, regardless of source format, is transcoded via `ffmpeg` to 16kHz mono WAV before anything downstream runs. Live-recorded audio passes through the same step as a no-op |
| DB schema field names, types, constraints | Execution Plan §5 is the complete schema. Implement exactly what's written — see §4 of this document for the schema-lock rule |
| Frontend component-library-to-screen assignment | Execution Plan §7.0 and Architecture Plan §2b already assign each library to specific screens/components. Do not substitute a different library "because it looks better" |
| Internal file/folder naming not explicitly given | Follow the closest existing pattern already shown in Architecture Plan §4's repo structure |
| Security hygiene (no secrets committed, `.env.example` with empty values, names never sent to LLM prompts per Execution Plan §8) | Always applied, never confirmed as "wanted" |

### 2B. Stop and ask — and only for these

A `STOP AND ASK` is justified **only** when one of the following is true. If none of these four
apply, the item belongs in §2A.

1. **Two statements within the three documents themselves genuinely contradict each other** —
   not a granularity or ordering preference the agent introduced, an actual conflict in what's
   written (e.g., two different values given for the same field with no stated precedence).
2. **A schema change is required that Execution Plan §5 does not describe**, and proceeding
   without resolving it would mean guessing at a new table/column with no basis in the spec.
3. **The action would touch real user data, spend money beyond the documented free-tier usage,
   or make an irreversible external commitment** — e.g., deploying somewhere public beyond the
   local Docker Compose target (HLD/LLD §4 — there is no other deployment target), creating a
   real third-party account not already named in Architecture Plan §1's tech stack, or sending
   a real notification to a real person.
4. **A Tier 2 or Tier 3 item (Execution Plan §4) is about to be built before every Tier 1 item
   is 100% real and verified** — building out of tier order is always a stop-and-ask, because
   the tier list's own rule (§4) requires re-checking it at every phase gate.

---

## 3. ESCALATION PROTOCOL — WHEN §2B GENUINELY APPLIES

- All open items for the **current phase** are collected and raised in a **single message**,
  after everything in that phase not depending on the blocked item has been completed. Never
  one question, then work, then another question, for the same phase.
- Each item in that single message states, in this order:
  1. The exact conflicting passages (quoted or section-cited) from the three documents.
  2. The concrete options available.
  3. The agent's own recommendation, with one sentence of reasoning — an escalation with no
     recommendation is incomplete.
- Once a human resolves an item, that resolution is final for the remainder of the build. It is
  logged once in `BUILD_LOG.md` and never re-asked in a different form later.

**Template:**
```
STOP AND ASK — Phase <N> (<phase name from §9>)

Conflict: <exact section citations, quoted>
Options: (a) ... (b) ...
Recommendation: <pick + one-sentence reason>
Remaining phase work not depending on this: <complete, or in progress>
```

---

## 4. SCHEMA LOCK

- Execution Plan §5's SQL is the **entire database schema**. Every table, column, type, and
  constraint listed there is implemented exactly as written — no renamed columns, no
  "improved" types, no added convenience fields not present in §5.
- If implementation genuinely requires a field §5 does not have, this is a §2B(2) stop-and-ask,
  not a silent addition. The agent never migrates the schema on its own judgment.
- Indexes named in Execution Plan §5's closing paragraph (`sessions(status)`, `jobs(status,
  job_type)`, `utterances(session_id, sequence_index)`, `speech_metrics(session_id,
  participant_id)` unique) are added exactly as specified — not more, not fewer.

---

## 5. TIER DISCIPLINE

- Execution Plan §4's three tiers are a hard build order, not a suggestion:
  - **Tier 1** must be 100% real before any Tier 2 work starts. "Real" means the phase's
    done-condition and verification step in §9 are both actually met, not approximated.
  - **Tier 2** is only attempted if Tier 1 is fully done and time remains — and if attempted,
    must be 100% real too, not a stub that merely looks finished.
  - **Tier 3** is never attempted and never claimed to exist in any documentation, UI copy, or
    status report, under any circumstance.
- At the close of every phase, the agent re-checks the tier list against what is actually
  finished (this re-check is itself required by §4) and corrects any documentation that has
  drifted ahead of what's real.

---

## 6. ARCHITECTURE LOCK

These are fixed by the Architecture Plan and HLD/LLD and are not re-opened mid-build:

- **Hosting is Docker Compose, one machine, final** (Architecture Plan §0, HLD/LLD §5). No
  serverless or cloud-hosting exploration is introduced as an alternative.
- **Exactly two network dependencies exist**: AssemblyAI (transcription/diarization) and
  Gemini/Groq (scoring). Every other component (Postgres, file storage, auth, the DSP service,
  the job queue, the retention cron) runs locally, in-container, with no exception.
- **The Python DSP microservice is the only place Python appears** (Architecture Plan §3.1) —
  no DSP logic is reimplemented in Node "for consistency," and no second Python service is
  introduced for an unrelated purpose.
- **The async job pattern is a plain Postgres-polled table** (Architecture Plan §6) — no queue
  library (BullMQ, Redis, etc.) is added, even if it would technically simplify something.
- **Recording has exactly two entry points — live capture and file upload** (Execution Plan
  §1a) — both normalized to the same format before anything downstream runs. No third entry
  point is introduced.
- **The frontend design system is one shared Tailwind/`shadcn`/`motion` foundation** with named
  libraries scoped to specific components (Execution Plan §7.0, Architecture Plan §2b) — not
  a shifting set of libraries chosen ad hoc per screen as implementation proceeds.

---

## 7. DOCUMENTATION DISCIPLINE

- Exactly two files carry build-time documentation: `README.md` (current repo state, updated at
  each phase close) and `BUILD_LOG.md` (append-only, one entry per completed phase).
- Each `BUILD_LOG.md` entry records: phase number and name (from §9), what was built, which §2A
  decisions were applied and why, what was verified (per §9's verification column), and a
  timestamp. Nothing more elaborate is required.
- `README.md` never describes functionality not yet implemented, and never lags the actual
  repo state by more than one phase.
- No documentation task exists independent of the phase it documents, and no later phase is
  responsible for "auditing" an earlier phase's documentation — correctness at write-time is
  the requirement, not correctness-on-a-later-pass.

---

## 8. TOKEN AND TIME DISCIPLINE

- No restating an instruction back in full before acting. One line: "Proceeding: `<phase/task>`."
- No re-confirming a decision already settled under §2A or resolved under §2B in an earlier
  phase. Decided once, logged once, never revisited unless the human explicitly reopens it.
- Status reports state: what was done, what (if anything) deviated from the plan, what's next —
  not a narrative of the reasoning process unless specifically requested.
- If a stretch of work is about to end in a question, check §2A first — if the item has a
  documented default anywhere in the three source documents, it is not a question.
- No duplicate summaries of something already visible in a diff, log entry, or prior message in
  the same session.

---

## 9. DEFINITION OF DONE

A phase is complete when, and only when, **both** its done-condition and its verification step
— exactly as written in Execution Plan §9's table — are satisfied. No additional ceremony
(extra audit passes, extra confirmation rounds, extra documentation beyond §7) is invented
beyond what that table specifies. When met, the agent reports the phase done and proceeds to
the next phase in the same message wherever possible.

---

## 10. WHAT THIS RULES OUT, STATED PLAINLY

The agent does not:

1. Invent a task-numbering or sub-phase scheme finer than Execution Plan §9's twelve phases.
2. Split documentation-writing and documentation-auditing into separate tasks.
3. Escalate more than once per phase for related, batchable questions.
4. Ask permission for anything listed in §2A of this document.
5. Modify, extend, or "improve" the schema in Execution Plan §5 without a §2B(2) escalation.
6. Build or claim any Tier 3 item (Execution Plan §4) exists.
7. Introduce a hosting, queueing, or service-boundary pattern not already fixed in §6 of this
   document.
8. Re-litigate a decision already resolved under §2A or §3.

---

## 11. HANDOFF MAINTENANCE — BINDING, NOT OPTIONAL

A fifth file, `HANDOFF.md`, exists alongside the three specification documents and this rules
file. It is **not optional documentation** — maintaining it is a rule of exactly the same
weight as the schema lock (§4) or the tier discipline (§5). An agent that finishes a session,
a phase, or a task without an up-to-date `HANDOFF.md` has not actually finished, regardless of
what code was written.

### 11A. What `HANDOFF.md` is, and how it differs from `BUILD_LOG.md`

- `BUILD_LOG.md` (§7) is **append-only history** — one entry per completed phase, never edited
  after being written.
- `HANDOFF.md` is a **single current-state snapshot** — overwritten/updated in place every time,
  so that reading it top to bottom, on its own, with zero other context, tells a new agent
  instance exactly where the project stands right now. It is written so that a different agent,
  in a different tool, with no memory of this conversation, could resume work correctly from it
  alone.

### 11B. Mandatory update triggers — the agent updates `HANDOFF.md` at every one of these,
without being asked, without waiting for the human to request it:

1. At the close of every phase from Execution Plan §9 — updated in the same action as the
   corresponding `BUILD_LOG.md` entry.
2. Before the agent's session, context window, or task run is likely to end, **even mid-phase**
   — a mid-phase handoff is mandatory, not optional just because a phase isn't finished.
3. Immediately after resolving any §2B `STOP AND ASK` item, so the resolution is captured and
   never re-asked by a future session.
4. Any time the agent deviates from the spec in any way, however small — the deviation and its
   reason are recorded the moment it happens, not reconstructed later from memory.
5. Whenever the human explicitly requests it, mid-session, regardless of phase boundary — this
   request is always honored immediately, before any other pending work continues.

### 11C. "Extremely detailed" is a concrete, checkable bar — not a vague instruction

A `HANDOFF.md` update is not compliant unless it exhaustively contains, current as of the
moment it's written:

- **Exact phase status** against every one of Execution Plan §9's 12 phases (complete /
  in progress with specifics / not started) — not a rounded-off "mostly done."
- **Every file created or modified in the session**, by path — not a category summary like
  "backend work done."
- **Every command actually run** that mattered to the outcome (installs, migrations, test runs,
  builds) and its result — not just "tests were run," but which suite, pass/fail count, and
  what failed if anything did.
- **Every §2A decision actually exercised so far** and the exact value used (§2 of this
  document) — e.g. the literal retention-day number used, not "a default was applied."
- **Every §2B escalation and its exact resolution**, verbatim enough that it never needs to be
  re-derived or re-asked.
- **The literal current environment-variable list** in use (names only, never values).
- **Confirmed schema state**: matches Execution Plan §5 exactly, or lists the exact approved
  deviation with its escalation reference.
- **Every known bug, incomplete function, or TODO left in the code**, specific enough that a new
  agent could locate and finish it without re-reading the whole codebase first — a file path and
  line-level description, not "some cleanup needed."
- **One unambiguous "next action" statement** — precise enough that a new agent with zero other
  context could begin immediately.

A `HANDOFF.md` that only summarizes at the phase level, without the file/command/bug-level
detail above, does not meet this bar and must be expanded before the session is considered
closed.

### 11D. Enforcement

Failing to update `HANDOFF.md` per §11B, or updating it below the bar in §11C, is treated as an
incomplete phase under §9's definition of done — the same way an unmet verification step would
be. The agent does not report a phase, task, or session as finished while `HANDOFF.md` is stale
or under-detailed.

---

**Any ambiguity not addressed by this document defaults to: consult the three source documents
first; if genuinely unresolved there and it meets one of §2B's four conditions, escalate once,
batched, with a recommendation; otherwise, decide and keep building.**
