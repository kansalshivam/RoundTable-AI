import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry, { AbortError } from "p-retry";
import Groq from "groq-sdk";
import { env } from "../../lib/env.js";

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
    // Attempt Gemini Flash-Lite as the primary model exactly as specified
    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" }); 
    
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
        retries: 3,
        onFailedAttempt: (error: any) => {
          console.warn(`Gemini LLM attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
          // If it's a rate limit error and we have Groq fallback, we abort the retry early 
          // so it falls through to the catch block and uses Groq immediately.
          if (isRateLimitError(error) && groq) {
            throw new AbortError(String(error));
          }
        }
      }
    );

    return { raw: result.response.text(), provider: "gemini-flash-lite" as const };
  } catch (err: any) {
    // Unwrap AbortError if it was thrown above
    const actualError = err instanceof AbortError ? err.originalError : err;

    if (isRateLimitError(actualError) && groq) {
      console.log("Gemini rate limit hit, falling back to Groq Llama 3.1 8B Instant...");
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
      return { raw: completion.choices[0].message.content!, provider: "groq" as const };
    }
    
    throw actualError;
  }
}
