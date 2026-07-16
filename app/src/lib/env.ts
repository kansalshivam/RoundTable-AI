import { config } from "dotenv";
import { z } from "zod";

config({ path: "../.env" });
config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  DSP_SERVICE_URL: z.string().default("http://dsp:8000"),
  BETTER_AUTH_SECRET: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@roundtable.local"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("roundtable-admin"),
  INSTITUTION_NAME: z.string().default("Institution"),
});

export const env = envSchema.parse(process.env);
