import { Router } from "express";
import { AssemblyAI } from "assemblyai";
import { prisma } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { processTranscriptResult } from "../jobs/worker.js";

const client = new AssemblyAI({ apiKey: env.ASSEMBLYAI_API_KEY || "dummy-key" });

export const webhookRouter = Router();

webhookRouter.post("/api/webhooks/assemblyai/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId as string;
  const { transcript_id, status } = req.body as { transcript_id: string; status: string };

  console.log(`AssemblyAI webhook received for session ${sessionId} with status ${status}`);

  if (status === "completed") {
    try {
      const job = await prisma.job.findFirst({
        where: { session_id: sessionId, job_type: "transcription" }
      });
      if (job && job.status === "complete") {
        console.log(`Webhook ignored: Transcription job for session ${sessionId} is already complete.`);
        res.status(200).send("ok");
        return;
      }

      const transcript = await client.transcripts.get(transcript_id);
      await processTranscriptResult(sessionId, transcript);
      
      if (job) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "complete" }
        });
      }
      
      res.status(200).send("ok");
    } catch (error) {
      console.error("Failed to process webhook transcript", error);
      res.status(500).json({ error: "internal_server_error" });
    }
  } else if (status === "error") {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "failed" }
      });
      const job = await prisma.job.findFirst({
        where: { session_id: sessionId, job_type: "transcription" }
      });
      if (job) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "failed", error_message: "Webhook indicated transcription error" }
        });
      }
      res.status(200).send("ok");
    } catch (error) {
      console.error("Failed to process webhook error", error);
      res.status(500).json({ error: "internal_server_error" });
    }
  } else {
    res.status(200).send("ignored");
  }
});
