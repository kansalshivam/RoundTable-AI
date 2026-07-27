import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry, { AbortError } from "p-retry";
import Groq from "groq-sdk";
import { env } from "../../lib/env.js";
import { updateProviderState } from "../../lib/provider-health.js";

const gemini = new GoogleGenerativeAI(env.GEMINI_API_KEY || "dummy_key");
const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = err.toString().toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota");
}

export async function scoreParticipant(prompt: { system: string; user: string }) {
  if (!env.GEMINI_API_KEY) {
      console.log("No GEMINI_API_KEY provided. Using mock LLM response...");
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network latency
      return {
        raw: JSON.stringify({
          topic_relevance_score: 85,
          topic_relevance_rationale: "[Mock] Student consistently referred back to the core discussion topic.",
          initiative_engagement_score: 90,
          initiative_engagement_rationale: "[Mock] High participation and frequently initiated new sub-topics.",
          coherence_structure_score: 80,
          coherence_structure_rationale: "[Mock] Generally clear, though some points were slightly fragmented.",
          responsiveness_score: 88,
          responsiveness_rationale: "[Mock] Addressed other participants effectively and built on their ideas.",
          communication_summary_strengths: ["High engagement", "Good active listening"],
          communication_summary_improvements: ["Could structure complex arguments better"]
        }),
        provider: "mock" as const
      };
  }

  try {
    // Try standard production Gemini models in sequence
    const primaryModels = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
    let lastGeminiError: any = null;

    for (const modelName of primaryModels) {
      try {
        const model = gemini.getGenerativeModel({ model: modelName });
        const result = await pRetry(
          async () => {
            return await model.generateContent({
              contents: [
                { role: "user", parts: [{ text: prompt.system + "\n\n" + prompt.user }] }
              ],
              generationConfig: {
                responseMimeType: "application/json",
              }
            });
          },
          {
            retries: 1,
            onFailedAttempt: (error: any) => {
              console.warn(`Gemini LLM (${modelName}) attempt ${error.attemptNumber} failed.`);
              if (isRateLimitError(error) && groq) {
                throw new AbortError(String(error));
              }
            }
          }
        );

        updateProviderState("gemini", true);
        return { raw: result.response.text(), provider: "gemini-flash-lite" as const };
      } catch (err: any) {
        const actualError = err instanceof AbortError ? err.originalError : err;
        lastGeminiError = actualError;
        updateProviderState("gemini", false, actualError);
        console.warn(`Gemini model ${modelName} failed: ${actualError?.message || actualError}.`);
        if (isRateLimitError(actualError) && groq) {
          // Rate limit applies to the whole project/key, so break loop and switch to Groq
          break;
        }
      }
    }

    // DELIBERATELY RELIED-UPON BEHAVIOR:
    // If Gemini returns 429 quota errors or fails, scoreParticipant transparently falls back to Groq
    // (Llama 3.1 8B Instant) and persists is_mock = false with llm_provider = "groq".
    if (groq) {
      console.log("Gemini models failed/rate-limited, falling back to Groq Llama 3.1 8B Instant...");
      try {
        const completion = await pRetry(
          async () => {
            return await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user },
              ],
              response_format: { type: "json_object" }
            });
          },
          { retries: 2, onFailedAttempt: (e) => console.warn(`Groq fallback attempt ${e.attemptNumber} failed.`) }
        );
        updateProviderState("groq", true);
        return { raw: completion.choices[0].message.content!, provider: "groq" as const };
      } catch (groqErr) {
        updateProviderState("groq", false, groqErr);
        throw groqErr;
      }
    }

    throw lastGeminiError || new Error("Gemini generation failed");
  } catch (err: any) {
    console.error("All LLM providers failed, generating mock score fallback:", err);
    return {
      raw: JSON.stringify({
        topic_relevance_score: 85,
        topic_relevance_rationale: "[Fallback] Student consistently referred back to the core discussion topic.",
        initiative_engagement_score: 88,
        initiative_engagement_rationale: "[Fallback] High participation and frequently initiated new sub-topics.",
        coherence_structure_score: 82,
        coherence_structure_rationale: "[Fallback] Clear expression with coherent structure.",
        responsiveness_score: 86,
        responsiveness_rationale: "[Fallback] Addressed other participants effectively.",
        communication_summary_strengths: ["High engagement", "Good active listening"],
        communication_summary_improvements: ["Could structure complex arguments better"]
      }),
      provider: "mock" as const
    };
  }
}
