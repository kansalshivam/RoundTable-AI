import { prisma } from "../../lib/db.js";
import { scoreParticipant } from "./score-participant.js";

export async function processSessionScoring(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      participants: {
        include: { speech_metrics: true }
      },
      utterances: {
        orderBy: { start_ms: "asc" }
      }
    }
  });

  if (!session) throw new Error("Session not found");

  const systemPrompt = `You are an expert communication coach evaluating students in a group discussion.
Your goal is to grade the target student out of 100 on four competencies:
1. Topic Relevance (0-100)
2. Initiative & Engagement (0-100)
3. Coherence & Structure (0-100)
4. Responsiveness to Others (0-100)

Return your evaluation as a valid JSON object strictly matching this schema, without markdown blocks:
{
  "topic_relevance_score": number,
  "topic_relevance_rationale": "string",
  "initiative_engagement_score": number,
  "initiative_engagement_rationale": "string",
  "coherence_structure_score": number,
  "coherence_structure_rationale": "string",
  "responsiveness_score": number,
  "responsiveness_rationale": "string",
  "communication_summary_strengths": ["string", "string"],
  "communication_summary_improvements": ["string", "string"]
}`;

  // Process sequentially to avoid aggressive LLM rate limits for free tiers
  for (const participant of session.participants) {
    if (!participant.speaker_label) continue;
    
    // Skip if already scored
    const existingScore = await prisma.score.findFirst({
        where: { session_id: sessionId, participant_id: participant.id }
    });
    if (existingScore) continue;

    const metric = participant.speech_metrics[0];
    const targetLabel = participant.speaker_label;
    
    const transcriptLines = session.utterances.map((u: any) => 
      `${u.speaker_label === targetLabel ? "[TARGET STUDENT]" : `[SPEAKER ${u.speaker_label}]`} (${u.start_ms}ms - ${u.end_ms}ms): ${u.text}`
    ).join("\n");

    const userPrompt = `Evaluate the target student (Voice ${targetLabel}: ${participant.display_name}).

Discussion Topic: ${session.topic}

Target Student Speech Metrics:
- Words Spoken: ${metric?.word_count || 0}
- Words Per Minute: ${metric?.wpm || 0}
- Participation (% of total speaking time): ${metric?.participation_pct || 0}%
- Lexical Diversity (MTLD): ${metric?.vocab_mtld_score || "N/A"}
- Filler Rate: ${metric?.filler_rate || 0}%
- Total Turns Taken: ${metric?.turns_count || 0}
- Average Pause Duration (ms): ${metric?.avg_pause_ms || "N/A"}

Full Session Transcript:
${transcriptLines}

Please provide the detailed JSON grading for the target student.`;

    try {
      console.log(`Scoring participant ${participant.display_name}...`);
      const response = await scoreParticipant({ system: systemPrompt, user: userPrompt });
      
      let parsed: any;
      try {
        const cleanJson = response.raw.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        console.error("Failed to parse LLM JSON response:", response.raw);
        throw new Error("Invalid JSON from LLM");
      }

      const aggScore = Math.round(
        (parsed.topic_relevance_score + 
         parsed.initiative_engagement_score + 
         parsed.coherence_structure_score + 
         parsed.responsiveness_score) / 4
      );

      const flagged = (metric?.speaking_time_ms || 0) < 30000 || (metric?.word_count || 0) < 50;

      await prisma.score.create({
        data: {
          session_id: sessionId,
          participant_id: participant.id,
          topic_relevance_score: parsed.topic_relevance_score,
          topic_relevance_rationale: parsed.topic_relevance_rationale,
          initiative_engagement_score: parsed.initiative_engagement_score,
          initiative_engagement_rationale: parsed.initiative_engagement_rationale,
          coherence_structure_score: parsed.coherence_structure_score,
          coherence_structure_rationale: parsed.coherence_structure_rationale,
          responsiveness_score: parsed.responsiveness_score,
          responsiveness_rationale: parsed.responsiveness_rationale,
          aggregate_score: aggScore,
          flagged_low_data: flagged,
          communication_summary_strengths: parsed.communication_summary_strengths || [],
          communication_summary_improvements: parsed.communication_summary_improvements || [],
          llm_provider: response.provider
        }
      });
      console.log(`Scoring saved for ${participant.display_name}`);
    } catch(err) {
      console.error(`Failed to score participant ${participant.display_name}:`, err);
      throw err;
    }
  }
}
