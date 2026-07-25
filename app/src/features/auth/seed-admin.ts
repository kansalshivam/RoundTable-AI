import { prisma } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { createPasswordHash } from "../../lib/auth.js";

export async function seedGoldenSession(adminId: string) {
  const existingSession = await prisma.session.findFirst({
    where: { topic: "Golden Fallback Session - AI Placement Prep" }
  });
  if (existingSession) return;

  console.log("Seeding offline golden fallback session...");
  await prisma.$transaction(async (tx) => {
    const s = await tx.session.create({
      data: {
        created_by: adminId,
        topic: "Golden Fallback Session - AI Placement Prep",
        expected_speaker_count: 3,
        status: "complete",
        recording_source: "uploaded",
        transcription_source: "mock",
        duration_seconds: 101,
        consent_confirmed: true,
        session_waveform_png_path: "/data/sessions/golden_fallback/waveform.png",
        session_spectrogram_png_path: "/data/sessions/golden_fallback/spectrogram.png",
        session_silence_ratio: 0.15
      }
    });

    const pA = await tx.participant.create({
      data: {
        session_id: s.id,
        display_name: "Student A",
        speaker_label: "A"
      }
    });

    const pB = await tx.participant.create({
      data: {
        session_id: s.id,
        display_name: "Student B",
        speaker_label: "B"
      }
    });

    const pC = await tx.participant.create({
      data: {
        session_id: s.id,
        display_name: "Student C",
        speaker_label: "C"
      }
    });

    // Seed Utterances
    const mockUtterances = [
      { session_id: s.id, speaker_label: "A", text: "Um, I would like to open by saying that campus placement discussions should measure reasoning, listening, and clarity together, not just who speaks first or longest.", start_ms: 1000, end_ms: 9800, sequence_index: 0 },
      { session_id: s.id, speaker_label: "B", text: "I agree with that framing, and I think the process also needs transparency because students should know whether the system is measuring words, pauses, pitch, or actual argument quality.", start_ms: 10200, end_ms: 20200, sequence_index: 1 },
      { session_id: s.id, speaker_label: "C", text: "Yes, but we should be careful. Acoustic measurements can describe the speech signal, like loudness or pauses, but they should not become judgments about confidence or personality.", start_ms: 21000, end_ms: 31900, sequence_index: 2 },
      { session_id: s.id, speaker_label: "A", text: "That is important. If the tool explains that pitch and energy are neutral measurements, then evaluators can use the data as context instead of treating it like an automatic verdict.", start_ms: 32600, end_ms: 43200, sequence_index: 3 },
      { session_id: s.id, speaker_label: "B", text: "Another point is fairness. Uh, someone may speak slowly because they are organizing thoughts, so the rubric should reward relevance, responsiveness, and structure more than raw speed.", start_ms: 44000, end_ms: 54500, sequence_index: 4 },
      { session_id: s.id, speaker_label: "C", text: "Exactly. The dashboard can still show words per minute and filler rate, but the score should come from the transcript and the discussion topic, with low-data warnings when a speaker barely contributes.", start_ms: 55300, end_ms: 67500, sequence_index: 5 },
      { session_id: s.id, speaker_label: "A", text: "For implementation, I think the strongest approach is to keep transcription, speaker mapping, signal analysis, and scoring as separate stages so a reviewer can inspect each one.", start_ms: 68400, end_ms: 79800, sequence_index: 6 },
      { session_id: s.id, speaker_label: "B", text: "That separation also helps during offline demos. If mock data is used, it must be labeled clearly, otherwise the product would look more complete than it actually is.", start_ms: 80600, end_ms: 90800, sequence_index: 7 },
      { session_id: s.id, speaker_label: "C", text: "So our conclusion is that AI can support placement assessment when it is transparent, consent-driven, and limited to evidence that the institution can defend.", start_ms: 91600, end_ms: 101000, sequence_index: 8 }
    ];

    await tx.utterance.createMany({ data: mockUtterances });

    // Seed Metrics
    await tx.speechMetric.createMany({
      data: [
        {
          session_id: s.id,
          participant_id: pA.id,
          speaking_time_ms: 35000,
          participation_pct: 35.0,
          word_count: 90,
          wpm: 154.3,
          filler_count: 2,
          filler_rate: 2.2,
          turns_count: 3,
          avg_turn_ms: 11666.7,
          vocab_mtld_score: 78.2,
          pitch_mean_hz: 135.2,
          pitch_range_semitones: 4.5,
          energy_rms_mean: 0.045,
          energy_rms_std: 0.012,
          pause_count: 3,
          avg_pause_ms: 450
        },
        {
          session_id: s.id,
          participant_id: pB.id,
          speaking_time_ms: 38000,
          participation_pct: 38.0,
          word_count: 100,
          wpm: 157.9,
          filler_count: 3,
          filler_rate: 3.0,
          turns_count: 3,
          avg_turn_ms: 12666.7,
          vocab_mtld_score: 80.1,
          pitch_mean_hz: 210.5,
          pitch_range_semitones: 6.2,
          energy_rms_mean: 0.062,
          energy_rms_std: 0.018,
          pause_count: 2,
          avg_pause_ms: 380
        },
        {
          session_id: s.id,
          participant_id: pC.id,
          speaking_time_ms: 27000,
          participation_pct: 27.0,
          word_count: 75,
          wpm: 166.7,
          filler_count: 1,
          filler_rate: 1.3,
          turns_count: 3,
          avg_turn_ms: 9000.0,
          vocab_mtld_score: 74.5,
          pitch_mean_hz: 165.1,
          pitch_range_semitones: 5.1,
          energy_rms_mean: 0.038,
          energy_rms_std: 0.009,
          pause_count: 4,
          avg_pause_ms: 520
        }
      ]
    });

    // Seed Scores
    await tx.score.createMany({
      data: [
        {
          session_id: s.id,
          participant_id: pA.id,
          topic_relevance_score: 88,
          topic_relevance_rationale: "[Offline Fallback] Demonstrated excellent focus on ethical AI and transparency. Structured thoughts clearly and engaged other speakers directly.",
          initiative_engagement_score: 90,
          initiative_engagement_rationale: "[Offline Fallback] Handled the introduction gracefully and kept the debate centered on core placement requirements.",
          coherence_structure_score: 82,
          coherence_structure_rationale: "[Offline Fallback] Formulated coherent paragraphs and organized talking points sequentially.",
          responsiveness_score: 88,
          responsiveness_rationale: "[Offline Fallback] Validated suggestions from Speaker B and Speaker C promptly.",
          aggregate_score: 87,
          flagged_low_data: false,
          communication_summary_strengths: ["Strong logical arguments", "Active discussion leading"],
          communication_summary_improvements: ["Can pause for emphasis occasionally"],
          llm_provider: "gemini-flash-lite",
          is_mock: true
        },
        {
          session_id: s.id,
          participant_id: pB.id,
          topic_relevance_score: 85,
          topic_relevance_rationale: "[Offline Fallback] Built constructively on Speaker A's prompt and raised important questions about algorithmic fairness.",
          initiative_engagement_score: 88,
          initiative_engagement_rationale: "[Offline Fallback] Took initiative to steer conversation to pacing differences and individual speaking speed.",
          coherence_structure_score: 85,
          coherence_structure_rationale: "[Offline Fallback] Highly clear expressions, with very minimal disfluency.",
          responsiveness_score: 86,
          responsiveness_rationale: "[Offline Fallback] Responded effectively to the warning boundaries mentioned by Speaker C.",
          aggregate_score: 86,
          flagged_low_data: false,
          communication_summary_strengths: ["Constructive building", "Empathetic active listening"],
          communication_summary_improvements: ["Try speaking with more vocal range"],
          llm_provider: "gemini-flash-lite",
          is_mock: true
        },
        {
          session_id: s.id,
          participant_id: pC.id,
          topic_relevance_score: 82,
          topic_relevance_rationale: "[Offline Fallback] Provided clear safety guardrails warning against psychological inferences from local signals.",
          initiative_engagement_score: 82,
          initiative_engagement_rationale: "[Offline Fallback] Kept a neutral stance and focused on summarizing final consensus.",
          coherence_structure_score: 80,
          coherence_structure_rationale: "[Offline Fallback] Made distinct points, although arguments could be expanded.",
          responsiveness_score: 84,
          responsiveness_rationale: "[Offline Fallback] Addressed concerns about transparency and consent directly.",
          aggregate_score: 82,
          flagged_low_data: false,
          communication_summary_strengths: ["Excellent boundary validation", "Strong summary skills"],
          communication_summary_improvements: ["Could initiate early arguments sooner"],
          llm_provider: "gemini-flash-lite",
          is_mock: true
        }
      ]
    });
  });
}

export async function seedAdmin() {
  const existing = await prisma.adminProfile.findFirst();
  if (existing) {
    // Make sure golden fallback is seeded even if admin exists
    await seedGoldenSession(existing.id);
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      email: env.SEED_ADMIN_EMAIL,
      name: "TPO Admin",
      emailVerified: true,
      accounts: {
        create: {
          accountId: env.SEED_ADMIN_EMAIL,
          providerId: "credential",
          password: await createPasswordHash(env.SEED_ADMIN_PASSWORD),
        },
      },
      profile: {
        create: {
          full_name: "TPO Admin",
          institution_name: env.INSTITUTION_NAME,
        },
      },
    },
    include: { profile: true },
  });

  await seedGoldenSession(user.profile!.id);
  return user.profile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => {
      console.log("Admin and golden session seed complete.");
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
