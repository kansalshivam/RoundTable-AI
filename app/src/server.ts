import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { env } from "./lib/env.js";
import {
  createSession,
  destroySession,
  getSession,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "./lib/auth.js";
import { seedAdmin } from "./features/auth/seed-admin.js";
import fs from "node:fs";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import { normalizeToWav16kMono, probeDuration } from "./features/sessions/normalize-audio.js";
import { startWorker } from "./features/jobs/worker.js";
import { startRetentionJob } from "./features/jobs/retention.js";
import { webhookRouter } from "./features/transcription/assembly-webhook.js";
import { checkProviderHealth } from "./lib/provider-health.js";
import scoreRouter from "./features/scoring/score.routes.js";
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, "../dist");

app.use(express.json());
app.use(cookieParser());
app.use(express.static(staticDir));
app.use(webhookRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/session", async (req, res) => {
  const session = await getSession(req.cookies[SESSION_COOKIE_NAME]);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    admin: {
      email: session.user.email,
      fullName: session.user.profile?.full_name,
      institutionName: session.user.profile?.institution_name,
    },
  });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "email_and_password_required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true, profile: true },
  });
  const credential = user?.accounts.find((account: any) => account.providerId === "credential");
  if (!user || !credential?.password || !(await verifyPassword(password, credential.password))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    expires: session.expiresAt,
  });
  res.json({ authenticated: true });
});

app.post("/api/logout", async (req, res) => {
  await destroySession(req.cookies[SESSION_COOKIE_NAME]);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(204).end();
});

const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await getSession(req.cookies[SESSION_COOKIE_NAME]);
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  (req as any).admin = session.user;
  next();
};

app.use("/api/scoring", requireAuth, scoreRouter);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = `/data/sessions/${req.params.id}/tmp`;
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".wav";
      cb(null, `original${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
});

app.get("/api/sessions", requireAuth, async (_req, res) => {
  try {
    const list = await prisma.session.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(list);
  } catch (error) {
    console.error("Failed to list sessions", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/sessions", requireAuth, async (req, res) => {
  const { topic, expectedSpeakerCount, participants, scheduledAt } = req.body as {
    topic?: string;
    expectedSpeakerCount?: number;
    participants?: string[];
    scheduledAt?: string;
  };

  if (!topic || !expectedSpeakerCount || !participants || participants.length === 0) {
    res.status(400).json({ error: "missing_required_fields" });
    return;
  }

  const cleanParticipants = participants.map((name) => name.trim()).filter(Boolean);
  if (
    !Number.isInteger(expectedSpeakerCount) ||
    expectedSpeakerCount < 3 ||
    expectedSpeakerCount > 6 ||
    cleanParticipants.length < 3 ||
    cleanParticipants.length > 6 ||
    cleanParticipants.length !== expectedSpeakerCount
  ) {
    res.status(400).json({ error: "participant_count_must_be_3_to_6_and_match_expected_speaker_count" });
    return;
  }

  const adminId = (req as any).admin.id;

  try {
    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          created_by: adminId,
          topic,
          expected_speaker_count: expectedSpeakerCount,
          scheduled_at: scheduledAt ? new Date(scheduledAt) : null,
          status: "created",
          retain_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.participant.createMany({
        data: cleanParticipants.map((name) => ({
          session_id: s.id,
          display_name: name,
        })),
      });

      return s;
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Failed to create session", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/sessions/:id/upload", requireAuth, upload.single("audio"), async (req, res) => {
  const id = req.params.id as string;
  const source = (req.query.source as string) || "uploaded";

  if (!req.file) {
    res.status(400).json({ error: "no_file_uploaded" });
    return;
  }

  // ENFORCE CONSENT: Reject upload if consent was not recorded
  const consentRecord = await prisma.consentRecord.findFirst({
    where: { session_id: id },
  });

  if (!consentRecord) {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(403).json({ error: "consent_required_before_upload" });
    return;
  }

  const rawPath = req.file.path;
  const finalDir = `/data/sessions/${id}`;
  const finalPath = `${finalDir}/recording.wav`;
  fs.mkdirSync(finalDir, { recursive: true });

  try {
    const duration = await probeDuration(rawPath);
    if (duration < 30 || duration > 5400) {
      fs.unlinkSync(rawPath);
      res.status(422).json({ error: "duration_out_of_range" });
      return;
    }

    await normalizeToWav16kMono(rawPath, finalPath);
    fs.unlinkSync(rawPath);

    await prisma.session.update({
      where: { id },
      data: {
        audio_local_path: finalPath,
        recording_source: source,
        original_filename: req.file.originalname,
        original_format: path.extname(req.file.originalname).replace(".", ""),
        duration_seconds: Math.round(duration),
        status: "uploaded",
      },
    });

    await prisma.job.create({
      data: {
        session_id: id,
        job_type: "transcription",
        status: "queued",
      },
    });

    res.json({ status: "uploaded" });
  } catch (error) {
    console.error("Upload handler failed", error);
    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/sessions/:id/consent", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const adminId = (req as any).admin.id;

  try {
    await prisma.consentRecord.create({
      data: {
        session_id: id,
        confirmed_by: adminId,
        consent_text_version: "1.0",
      },
    });

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to record consent", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/sessions/:id/withdraw", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { scores: true }
    });

    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    // Consent can only be withdrawn before session is scored
    if (session.status === "complete" || session.status === "scoring" || session.scores.length > 0) {
      res.status(400).json({ error: "cannot_withdraw_after_scoring" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete consent records for this session
      await tx.consentRecord.deleteMany({
        where: { session_id: id },
      });

      // 2. Delete any active jobs for this session
      await tx.job.deleteMany({
        where: { session_id: id },
      });

      // 3. Delete utterances
      await tx.utterance.deleteMany({
        where: { session_id: id },
      });

      // 4. Delete speech metrics
      await tx.speechMetric.deleteMany({
        where: { session_id: id },
      });

      // 5. Update session details
      await tx.session.update({
        where: { id },
        data: {
          status: "created",
          consent_confirmed: false,
          audio_local_path: null,
          session_waveform_png_path: null,
          session_spectrogram_png_path: null,
          session_silence_ratio: null,
        },
      });

      // 6. Reset participants speaker mappings
      await tx.participant.updateMany({
        where: { session_id: id },
        data: { speaker_label: null },
      });
    });

    // 7. Delete audio files from disk
    const sessionDir = `/data/sessions/${id}`;
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`Successfully deleted session audio directory ${sessionDir} due to consent withdrawal`);
      } catch (err) {
        console.error(`Failed to delete session directory ${sessionDir}`, err);
      }
    }

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to withdraw consent", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/status", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        participants: true,
        jobs: {
          orderBy: { created_at: "desc" },
        },
        utterances: {
          orderBy: { sequence_index: "asc" },
        },
        speech_metrics: {
          include: { participant: true },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const distinctSpeakers = await prisma.utterance.findMany({
      where: { session_id: id },
      distinct: ["speaker_label"],
      select: { speaker_label: true },
    });

    res.json({
      session,
      speakerLabels: distinctSpeakers.map((u) => u.speaker_label),
    });
  } catch (error) {
    console.error("Failed to get session status", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/speakers/preview/:label", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const label = req.params.label as string;

  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.audio_local_path) {
      res.status(404).json({ error: "session_or_audio_not_found" });
      return;
    }

    const firstUtt = await prisma.utterance.findFirst({
      where: { session_id: id, speaker_label: label },
      orderBy: { sequence_index: "asc" },
    });

    if (!firstUtt) {
      res.status(404).json({ error: "speaker_label_not_found" });
      return;
    }

    const previewDir = `/data/sessions/${id}/previews`;
    fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = `${previewDir}/preview_${label}.wav`;

    if (!fs.existsSync(previewPath)) {
      const startSec = firstUtt.start_ms / 1000;
      const durationSec = Math.min((firstUtt.end_ms - firstUtt.start_ms) / 1000, 5);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(session.audio_local_path!)
          .setStartTime(startSec)
          .setDuration(durationSec)
          .outputOptions("-y")
          .on("end", () => resolve())
          .on("error", reject)
          .save(previewPath);
      });
    }

    res.sendFile(previewPath);
  } catch (error) {
    console.error("Failed to generate speaker preview snippet", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/sessions/:id/map-speakers", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const { mappings } = req.body as { mappings?: Record<string, string> };

  if (!mappings) {
    res.status(400).json({ error: "mappings_required" });
    return;
  }

  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const [speakerLabel, participantId] of Object.entries(mappings)) {
        await tx.participant.update({
          where: { id: participantId },
          data: { speaker_label: speakerLabel },
        });
      }

      await tx.session.update({
        where: { id },
        data: { status: "analyzing" },
      });

      await tx.job.create({
        data: {
          session_id: id,
          job_type: "dsp_analysis",
          status: "queued",
        },
      });
    });

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to map speakers", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/audio", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.audio_local_path) {
      res.status(404).json({ error: "session_or_audio_not_found" });
      return;
    }

    if (!fs.existsSync(session.audio_local_path)) {
      res.status(404).json({ error: "audio_file_not_found_on_disk" });
      return;
    }

    res.sendFile(session.audio_local_path);
  } catch (error) {
    console.error("Failed to stream session audio", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/export", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            speech_metrics: true,
            scores: true,
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const csvHeaders = [
      "session_id",
      "session_topic",
      "session_status",
      "recording_source",
      "transcription_source",
      "duration_seconds",
      "created_at",
      "participant_id",
      "display_name",
      "speaker_label",
      "speaking_time_ms",
      "participation_pct",
      "word_count",
      "wpm",
      "filler_count",
      "filler_rate",
      "turns_count",
      "avg_turn_ms",
      "vocab_mtld_score",
      "pitch_mean_hz",
      "pitch_range_semitones",
      "energy_rms_mean",
      "energy_rms_std",
      "pause_count",
      "avg_pause_ms",
      "topic_relevance_score",
      "topic_relevance_rationale",
      "initiative_engagement_score",
      "initiative_engagement_rationale",
      "coherence_structure_score",
      "coherence_structure_rationale",
      "responsiveness_score",
      "responsiveness_rationale",
      "aggregate_score",
      "flagged_low_data",
      "is_mock",
      "llm_provider"
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [csvHeaders.join(",")];

    for (const p of session.participants) {
      const metric = p.speech_metrics[0];
      const score = p.scores[0];

      const row = [
        escapeCsv(session.id),
        escapeCsv(session.topic),
        escapeCsv(session.status),
        escapeCsv(session.recording_source),
        escapeCsv(session.transcription_source || "N/A"),
        escapeCsv(session.duration_seconds),
        escapeCsv(session.created_at.toISOString()),
        escapeCsv(p.id),
        escapeCsv(p.display_name),
        escapeCsv(p.speaker_label || "unmapped"),
        escapeCsv(metric?.speaking_time_ms),
        escapeCsv(metric?.participation_pct),
        escapeCsv(metric?.word_count),
        escapeCsv(metric?.wpm),
        escapeCsv(metric?.filler_count),
        escapeCsv(metric?.filler_rate),
        escapeCsv(metric?.turns_count),
        escapeCsv(metric?.avg_turn_ms),
        escapeCsv(metric?.vocab_mtld_score),
        escapeCsv(metric?.pitch_mean_hz),
        escapeCsv(metric?.pitch_range_semitones),
        escapeCsv(metric?.energy_rms_mean),
        escapeCsv(metric?.energy_rms_std),
        escapeCsv(metric?.pause_count),
        escapeCsv(metric?.avg_pause_ms),
        escapeCsv(score?.topic_relevance_score),
        escapeCsv(score?.topic_relevance_rationale),
        escapeCsv(score?.initiative_engagement_score),
        escapeCsv(score?.initiative_engagement_rationale),
        escapeCsv(score?.coherence_structure_score),
        escapeCsv(score?.coherence_structure_rationale),
        escapeCsv(score?.responsiveness_score),
        escapeCsv(score?.responsiveness_rationale),
        escapeCsv(score?.aggregate_score),
        escapeCsv(score?.flagged_low_data ? "true" : "false"),
        escapeCsv(score?.is_mock ? "true" : "false"),
        escapeCsv(score?.llm_provider || "N/A")
      ];

      csvRows.push(row.join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=session_export_${id}.csv`);
    res.send(csvRows.join("\n"));
  } catch (error) {
    console.error("Failed to export session CSV", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/plots/waveform", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.session_waveform_png_path) {
      res.status(404).json({ error: "session_or_waveform_not_found" });
      return;
    }

    if (!fs.existsSync(session.session_waveform_png_path)) {
      res.status(404).json({ error: "waveform_file_not_found_on_disk" });
      return;
    }

    res.sendFile(session.session_waveform_png_path);
  } catch (error) {
    console.error("Failed to serve waveform plot", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/sessions/:id/plots/spectrogram", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.session_spectrogram_png_path) {
      res.status(404).json({ error: "session_or_spectrogram_not_found" });
      return;
    }

    if (!fs.existsSync(session.session_spectrogram_png_path)) {
      res.status(404).json({ error: "spectrogram_file_not_found_on_disk" });
      return;
    }

    res.sendFile(session.session_spectrogram_png_path);
  } catch (error) {
    console.error("Failed to serve spectrogram plot", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/system/provider-status", requireAuth, async (_req, res) => {
  const health = await checkProviderHealth();
  res.json(health);
});

app.get("/*splat", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

const port = Number(process.env.PORT ?? 3000);

seedAdmin()
  .then(async () => {
    const health = await checkProviderHealth();
    app.listen(port, () => {
      console.log(`[Provider Status] AssemblyAI: ${health.assemblyai.status} | Gemini: ${health.gemini.status} | Groq: ${health.groq.status}`);

      startWorker();
      startRetentionJob();
      console.log(`RoundTable AI app listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start RoundTable AI app", error);
    process.exit(1);
  });
