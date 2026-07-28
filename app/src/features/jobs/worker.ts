import fs from "fs";
import { prisma } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { AssemblyAI } from "assemblyai";
import { computeLayerC } from "../speech-metrics/transcript-derived.js";

const client = new AssemblyAI({ apiKey: env.ASSEMBLYAI_API_KEY || "dummy-key" });

export async function processTranscriptResult(sessionId: string, transcript: any) {
  const utterancesList = transcript.utterances || [];
  
  await prisma.$transaction(async (tx) => {
    // 1. Delete existing utterances just in case of retries
    await tx.utterance.deleteMany({
      where: { session_id: sessionId },
    });

    // 2. Insert new utterances
    if (utterancesList.length > 0) {
      await tx.utterance.createMany({
        data: utterancesList.map((utt: any, idx: number) => ({
          session_id: sessionId,
          speaker_label: utt.speaker,
          text: utt.text,
          start_ms: utt.start,
          end_ms: utt.end,
          sequence_index: idx,
        })),
      });
    }

    // 3. Check for speaker count mismatch
    const distinctSpeakers = new Set(utterancesList.map((u: any) => u.speaker)).size;
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (session) {
      const mismatch = distinctSpeakers !== session.expected_speaker_count;
      await tx.session.update({
        where: { id: sessionId },
        data: {
          speaker_count_mismatch: mismatch,
          status: "mapped", // Transition session status to mapped (awaiting speaker mapping)
        },
      });
    }
  });
}

async function handleTranscriptionJob(job: any) {
  const session = await prisma.session.findUnique({ where: { id: job.session_id } });
  if (!session || !session.audio_local_path) {
    throw new Error("Session or audio file not found");
  }

  // Set session status to transcribing
  await prisma.session.update({
    where: { id: session.id },
    data: { status: "transcribing" },
  });

  if (!env.ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is missing from environment variables on Render");
  }

  console.log(`Uploading real audio file (${session.audio_local_path}) to AssemblyAI...`);
  const audioBuffer = fs.readFileSync(session.audio_local_path);
  const uploadUrl = await client.files.upload(audioBuffer);

  await prisma.session.update({
    where: { id: session.id },
    data: { transcription_source: "assemblyai" },
  });

  console.log("Submitting real audio transcript job to AssemblyAI...");
  const transcriptSubmit = await client.transcripts.submit({
    audio_url: uploadUrl,
    speech_models: ["universal-2"],
    speaker_labels: true,
    disfluencies: true,
    webhook_url: `${env.APP_BASE_URL}/api/webhooks/assemblyai/${session.id}`,
  });

  let transcript = await client.transcripts.get(transcriptSubmit.id);
  const startTime = Date.now();
  const timeoutMs = 10 * 60 * 1000; // 10 minutes

  while (transcript.status !== "completed" && transcript.status !== "error") {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("AssemblyAI transcription timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    transcript = await client.transcripts.get(transcriptSubmit.id);
  }

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  console.log(`AssemblyAI completed transcription for session ${session.id}. Found ${transcript.utterances?.length || 0} real utterances.`);
  await processTranscriptResult(session.id, transcript);
}

async function handleDspAnalysisJob(job: any) {
  const session = await prisma.session.findUnique({
    where: { id: job.session_id },
    include: { participants: true, utterances: true },
  });

  if (!session) {
    throw new Error("Session not found for DSP analysis");
  }

  if (!session.audio_local_path) {
    throw new Error("Session audio path is missing, cannot perform DSP analysis");
  }

  // 1. Prepare speakers payload for Python VAD/pitch/energy extraction
  const speakersPayload = session.participants
    .filter((p) => p.speaker_label)
    .map((p) => {
      const participantUtterances = session.utterances.filter(
        (u) => u.speaker_label === p.speaker_label
      );
      return {
        participant_id: p.id,
        segments: participantUtterances.map((u) => ({
          start_ms: u.start_ms,
          end_ms: u.end_ms,
        })),
      };
    });

  const analyzeBody = {
    session_id: session.id,
    audio_path: session.audio_local_path,
    speakers: speakersPayload,
  };

  let dspData: {
    session: {
      silence_ratio: number;
      waveform_png_path: string;
      spectrogram_png_path: string;
    };
    speakers: Array<{
      participant_id: string;
      pitch_mean_hz: number | null;
      pitch_range_semitones: number | null;
      energy_rms_mean: number;
      energy_rms_std: number;
      pause_count: number;
      avg_pause_ms: number;
    }>;
  } | null = null;

  const dspUrl = `${env.DSP_SERVICE_URL}/analyze`;
  console.log(`Sending DSP analysis request for session ${session.id} to ${dspUrl}...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(dspUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyzeBody),
      });

      if (response.ok) {
        dspData = (await response.json()) as any;
        console.log(`DSP analysis completed on attempt ${attempt}.`);
        break;
      }
    } catch (err: any) {
      console.warn(`DSP service attempt ${attempt}/3 failed: ${err?.message || err}`);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  if (!dspData) {
    throw new Error("DSP service unreachable after 3 attempts. Cannot generate real acoustic metrics.");
  }

  // 2. Update session with silences and PNG graphics paths + persist PNG binaries to SessionMedia table
  await prisma.session.update({
    where: { id: session.id },
    data: {
      session_silence_ratio: dspData.session.silence_ratio,
      session_waveform_png_path: dspData.session.waveform_png_path,
      session_spectrogram_png_path: dspData.session.spectrogram_png_path,
    },
  });

  const mediaUpdate: any = {};
  if (dspData.session.waveform_png_path && fs.existsSync(dspData.session.waveform_png_path)) {
    mediaUpdate.session_waveform_png_data = fs.readFileSync(dspData.session.waveform_png_path);
  }
  if (dspData.session.spectrogram_png_path && fs.existsSync(dspData.session.spectrogram_png_path)) {
    mediaUpdate.session_spectrogram_png_data = fs.readFileSync(dspData.session.spectrogram_png_path);
  }

  if (Object.keys(mediaUpdate).length > 0) {
    await prisma.sessionMedia.upsert({
      where: { session_id: session.id },
      create: { session_id: session.id, ...mediaUpdate },
      update: mediaUpdate,
    });
  }

  // 3. Compute Layer C metrics and merge with Layer B metrics for each participant
  for (const participant of session.participants) {
    if (!participant.speaker_label) {
      console.warn(`Participant ${participant.display_name} has no speaker label, skipping metrics.`);
      continue;
    }

    const participantUtterances = session.utterances.filter(
      (u) => u.speaker_label === participant.speaker_label
    );

    const layerC = computeLayerC(participantUtterances as any[], session.duration_seconds || 0);
    const speakerData = dspData.speakers.find((s) => s.participant_id === participant.id);

    // Upsert into speech_metrics combining Layer B + Layer C values
    await prisma.speechMetric.upsert({
      where: {
        session_id_participant_id: {
          session_id: session.id,
          participant_id: participant.id,
        },
      },
      create: {
        session_id: session.id,
        participant_id: participant.id,
        speaking_time_ms: layerC.speaking_time_ms,
        participation_pct: layerC.participation_pct,
        word_count: layerC.word_count,
        wpm: layerC.wpm,
        filler_count: layerC.filler_count,
        filler_rate: layerC.filler_rate,
        turns_count: layerC.turns_count,
        avg_turn_ms: layerC.avg_turn_ms,
        vocab_mtld_score: layerC.vocab_mtld_score,
        // Layer B metrics
        pitch_mean_hz: speakerData ? speakerData.pitch_mean_hz : null,
        pitch_range_semitones: speakerData ? speakerData.pitch_range_semitones : null,
        energy_rms_mean: speakerData ? speakerData.energy_rms_mean : null,
        energy_rms_std: speakerData ? speakerData.energy_rms_std : null,
        pause_count: speakerData ? speakerData.pause_count : null,
        avg_pause_ms: speakerData ? speakerData.avg_pause_ms : null,
      },
      update: {
        speaking_time_ms: layerC.speaking_time_ms,
        participation_pct: layerC.participation_pct,
        word_count: layerC.word_count,
        wpm: layerC.wpm,
        filler_count: layerC.filler_count,
        filler_rate: layerC.filler_rate,
        turns_count: layerC.turns_count,
        avg_turn_ms: layerC.avg_turn_ms,
        vocab_mtld_score: layerC.vocab_mtld_score,
        // Layer B metrics
        pitch_mean_hz: speakerData ? speakerData.pitch_mean_hz : null,
        pitch_range_semitones: speakerData ? speakerData.pitch_range_semitones : null,
        energy_rms_mean: speakerData ? speakerData.energy_rms_mean : null,
        energy_rms_std: speakerData ? speakerData.energy_rms_std : null,
        pause_count: speakerData ? speakerData.pause_count : null,
        avg_pause_ms: speakerData ? speakerData.avg_pause_ms : null,
      },
    });
  }

  // Update session status to scoring (Phase 8 handles scoring, for now we direct transition)
  await prisma.session.update({
    where: { id: session.id },
    data: { status: "scoring" },
  });

  // Queue LLM scoring job
  await prisma.job.create({
    data: {
      session_id: session.id,
      job_type: "scoring",
      status: "queued",
    },
  });
}

async function handleScoringJob(job: any) {
  const { processSessionScoring } = await import("../scoring/save-score.js");
  await processSessionScoring(job.session_id);
  
  await prisma.session.update({
    where: { id: job.session_id },
    data: { status: "complete" }
  });
}

const JOB_HANDLERS: Record<string, (job: any) => Promise<void>> = {
  transcription: handleTranscriptionJob,
  dsp_analysis: handleDspAnalysisJob,
  scoring: handleScoringJob,
};

let workerInterval: NodeJS.Timeout | null = null;

export async function recoverOrphanedJobs() {
  console.log("Checking for orphaned in-progress jobs...");
  try {
    const orphanedJobs = await prisma.job.findMany({
      where: { status: "in_progress" }
    });
    for (const job of orphanedJobs) {
      console.log(`Recovering orphaned job ${job.id} of type ${job.job_type} from in_progress to queued...`);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "queued",
          error_message: "Job orphaned due to server crash/restart.",
        }
      });
    }
  } catch (err) {
    console.error("Failed to recover orphaned jobs", err);
  }
}

export function startWorker() {
  if (workerInterval) return;

  // Run orphaned recovery once on boot
  recoverOrphanedJobs();
  
  workerInterval = setInterval(async () => {
    // 1. Fetch all queued jobs
    const jobs = await prisma.job.findMany({
      where: { status: "queued" },
      orderBy: { created_at: "asc" },
    });
    if (jobs.length === 0) return;

    // 2. Filter based on exponential backoff elapsed time
    const now = new Date();
    const job = jobs.find((j) => {
      if (j.attempts === 0) return true;
      const elapsedMs = now.getTime() - new Date(j.updated_at).getTime();
      const backoffSec = j.attempts === 1 ? 2 : j.attempts === 2 ? 8 : 32;
      return elapsedMs >= backoffSec * 1000;
    });

    if (!job) return;

    try {
      await prisma.job.update({ where: { id: job.id }, data: { status: "in_progress" } });
      console.log(`Starting job ${job.id} of type ${job.job_type}...`);
      
      await JOB_HANDLERS[job.job_type](job);
      
      await prisma.job.update({ where: { id: job.id }, data: { status: "complete" } });
      console.log(`Job ${job.id} of type ${job.job_type} completed successfully.`);
    } catch (err) {
      console.error(`Job worker error on job ${job.id}:`, err);
      const errorMsg = String(err);
      
      const latestJob = await prisma.job.findUnique({ where: { id: job.id } });
      if (latestJob) {
        const attempts = latestJob.attempts + 1;
        if (attempts < 3) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "queued",
              attempts,
              error_message: errorMsg,
            },
          });
        } else {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "failed",
              attempts,
              error_message: errorMsg,
            },
          });
          await prisma.session.update({
            where: { id: job.session_id },
            data: { status: "failed" },
          });
        }
      }
    }
  }, 5000);
}
