import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { env } from "./env.js";

export type ProviderState = {
  status: "LIVE (verified)" | `KEY PRESENT BUT CALL FAILED: ${string}` | "MOCK (no key)";
  lastChecked: string;
  lastError?: string;
};

export type SystemProviderHealth = {
  assemblyai: ProviderState;
  gemini: ProviderState;
  groq: ProviderState;
};

const healthRecord: SystemProviderHealth = {
  assemblyai: { status: env.ASSEMBLYAI_API_KEY ? "LIVE (verified)" : "MOCK (no key)", lastChecked: new Date().toISOString() },
  gemini: { status: env.GEMINI_API_KEY ? "LIVE (verified)" : "MOCK (no key)", lastChecked: new Date().toISOString() },
  groq: { status: env.GROQ_API_KEY ? "LIVE (verified)" : "MOCK (no key)", lastChecked: new Date().toISOString() },
};

function formatErrorReason(err: any): string {
  if (!err) return "Unknown error";
  const msg = err.message || String(err);
  if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
    return "429 quota exceeded";
  }
  if (msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("invalid api key")) {
    return "Authentication failed / invalid API key";
  }
  if (msg.includes("404")) {
    return "Model / endpoint not found";
  }
  return msg.substring(0, 100);
}

export function updateProviderState(provider: "assemblyai" | "gemini" | "groq", success: boolean, err?: any) {
  const key = provider === "assemblyai" ? env.ASSEMBLYAI_API_KEY : provider === "gemini" ? env.GEMINI_API_KEY : env.GROQ_API_KEY;
  if (!key) {
    healthRecord[provider] = { status: "MOCK (no key)", lastChecked: new Date().toISOString() };
    return;
  }
  if (success) {
    healthRecord[provider] = { status: "LIVE (verified)", lastChecked: new Date().toISOString() };
  } else {
    const reason = formatErrorReason(err);
    healthRecord[provider] = {
      status: `KEY PRESENT BUT CALL FAILED: ${reason}`,
      lastChecked: new Date().toISOString(),
      lastError: err?.message || String(err)
    };
  }
}

export async function checkProviderHealth(): Promise<SystemProviderHealth> {
  // 1. AssemblyAI
  if (!env.ASSEMBLYAI_API_KEY) {
    updateProviderState("assemblyai", false);
  } else {
    try {
      const res = await fetch("https://api.assemblyai.com/v2/transcript?limit=1", {
        headers: { authorization: env.ASSEMBLYAI_API_KEY },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok || res.status === 200) {
        updateProviderState("assemblyai", true);
      } else {
        const errText = await res.text();
        updateProviderState("assemblyai", false, new Error(`HTTP ${res.status}: ${errText}`));
      }
    } catch (err) {
      updateProviderState("assemblyai", false, err);
    }
  }

  // 2. Gemini
  if (!env.GEMINI_API_KEY) {
    updateProviderState("gemini", false);
  } else {
    try {
      const ai = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      await Promise.race([
        model.generateContent("ping"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 5000ms")), 5000))
      ]);
      updateProviderState("gemini", true);
    } catch (err) {
      updateProviderState("gemini", false, err);
    }
  }

  // 3. Groq
  if (!env.GROQ_API_KEY) {
    updateProviderState("groq", false);
  } else {
    try {
      const client = new Groq({ apiKey: env.GROQ_API_KEY });
      await Promise.race([
        client.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 5000ms")), 5000))
      ]);
      updateProviderState("groq", true);
    } catch (err) {
      updateProviderState("groq", false, err);
    }
  }

  return healthRecord;
}

export function getProviderHealthRecord(): SystemProviderHealth {
  return healthRecord;
}
