import { Router } from "express";
import { prisma } from "../../lib/db.js";

const router = Router();

// Get cohort dashboard sessions
router.get("/", async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: "complete" },
      include: {
        participants: {
          include: {
            scores: true,
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const formatted = sessions.map(session => {
      // Calculate average aggregate score for the session
      let totalScore = 0;
      let validScores = 0;
      
      session.participants.forEach(p => {
        if (p.scores && p.scores.length > 0) {
          totalScore += p.scores[0].aggregate_score;
          validScores++;
        }
      });

      const avgScore = validScores > 0 ? Math.round(totalScore / validScores) : 0;

      return {
        id: session.id,
        topic: session.topic,
        created_at: session.created_at,
        recording_source: session.recording_source,
        participant_count: session.participants.length,
        average_score: avgScore,
        participants: session.participants.map(p => ({
            id: p.id,
            display_name: p.display_name,
            score: p.scores?.[0]?.aggregate_score || 0
        }))
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("Failed to fetch sessions for dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Get scorecard for specific session
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        utterances: {
            orderBy: { start_ms: "asc" }
        },
        participants: {
          include: {
            scores: true,
            speech_metrics: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(session);
  } catch (error) {
    console.error("Failed to fetch scorecard for session:", error);
    res.status(500).json({ error: "Failed to fetch scorecard" });
  }
});

export default router;
