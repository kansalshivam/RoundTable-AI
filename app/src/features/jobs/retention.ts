import cron from "node-cron";
import fs from "node:fs";
import { prisma } from "../../lib/db.js";

export function startRetentionJob() {
  console.log("Starting data retention cron job (Runs daily at midnight)");

  // Run every day at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Running scheduled data retention cleanup...");
    try {
      const expiredSessions = await prisma.session.findMany({
        where: {
          retain_until: { lt: new Date() },
          audio_local_path: { not: null },
        },
      });

      for (const session of expiredSessions) {
        if (session.audio_local_path && fs.existsSync(session.audio_local_path)) {
          try {
            fs.unlinkSync(session.audio_local_path);
            console.log(`Deleted expired audio for session ${session.id}: ${session.audio_local_path}`);
          } catch (e) {
            console.error(`Failed to delete audio file for session ${session.id}`, e);
          }
        }

        const sessionDir = `/data/sessions/${session.id}`;
        if (fs.existsSync(sessionDir)) {
          const tmpDir = `${sessionDir}/tmp`;
          if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        }

        await prisma.session.update({
          where: { id: session.id },
          data: { audio_local_path: null },
        });
        
        console.log(`Session ${session.id} audio_local_path set to null due to retention policy.`);
      }

      console.log(`Retention cleanup finished. Processed ${expiredSessions.length} sessions.`);
    } catch (error) {
      console.error("Error during retention cleanup", error);
    }
  });
}
