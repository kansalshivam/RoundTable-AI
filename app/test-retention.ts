import "dotenv/config";
import { prisma } from "./src/lib/db.js";
import fs from "node:fs";

async function testRetentionJob() {
  const testSessionId = "test-retention-" + Date.now();
  const testDir = `C:/data/sessions/${testSessionId}`;
  const testAudioPath = `${testDir}/recording.wav`;

  // Setup mock file
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(testAudioPath, "mock audio data");
  fs.mkdirSync(`${testDir}/tmp`, { recursive: true });
  fs.writeFileSync(`${testDir}/tmp/original.m4a`, "mock original audio");

  // Setup mock admin user first for foreign key constraint
  const adminId = "test-admin";
  const existingAdmin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: { id: adminId, email: "admin@test.com", role: "admin" }
    });
  }

  // Setup mock session expired 2 days ago
  await prisma.session.create({
    data: {
      id: testSessionId,
      created_by: adminId,
      topic: "Retention Test",
      expected_speaker_count: 2,
      status: "complete",
      audio_local_path: testAudioPath,
      retain_until: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), 
    }
  });

  console.log(`Created mock session ${testSessionId} with retain_until in the past.`);
  console.log(`Audio file created at: ${testAudioPath}`);

  // Now trigger the retention logic manually to see if it deletes it
  console.log("Triggering retention logic...");
  
  const expiredSessions = await prisma.session.findMany({
    where: {
      retain_until: { lt: new Date() },
      audio_local_path: { not: null },
    },
  });

  for (const session of expiredSessions) {
    if (session.audio_local_path && fs.existsSync(session.audio_local_path)) {
      fs.unlinkSync(session.audio_local_path);
      console.log(`Deleted expired audio for session ${session.id}: ${session.audio_local_path}`);
    }

    const sessionDir = `C:/data/sessions/${session.id}`;
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
  }

  // Verify
  const verifiedSession = await prisma.session.findUnique({ where: { id: testSessionId } });
  const fileExists = fs.existsSync(testAudioPath);
  const tmpExists = fs.existsSync(`${testDir}/tmp`);

  console.log(`Verification - Audio file exists? ${fileExists}`);
  console.log(`Verification - Tmp dir exists? ${tmpExists}`);
  console.log(`Verification - DB audio_local_path is null? ${verifiedSession?.audio_local_path === null}`);

  // Clean up
  await prisma.session.delete({ where: { id: testSessionId } });
}

testRetentionJob()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
