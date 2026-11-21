import path from 'node:path';

import { config } from 'dotenv';
import { z } from 'zod';

config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CORS_ORIGINS: z.string().default(''),
  FIREBASE_STORAGE_BUCKET: z.string().default(''),
  FIREBASE_STORAGE_EMULATOR_HOST: z.string().default(''),
  OPEN_METEO_FORECAST_URL: z.string().url().default('https://api.open-meteo.com/v1/forecast'),
  OPEN_METEO_GEOCODING_URL: z
    .string()
    .url()
    .default('https://geocoding-api.open-meteo.com/v1/search'),
  WEATHER_CACHE_TTL_MS: z.coerce.number().int().min(0).default(600_000),
  WEATHER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).default(7_000),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default(''),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(15_000),
  GEMINI_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
  AI_DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().max(10_000).default(50),
  AI_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().max(100).default(10),
  AI_DAILY_DIAGNOSIS_LIMIT: z.coerce.number().int().positive().max(10_000).default(20),
  AI_DIAGNOSES_PER_MINUTE: z.coerce.number().int().positive().max(100).default(5),
  AI_HISTORY_LIMIT: z.coerce.number().int().min(1).max(20).default(8),
  AI_PROMPT_MAX_CHARS: z.coerce.number().int().min(500).max(50_000).default(6_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(50).max(4_000).default(600),
});

// Empty values in a copied .env.example should fall back to the schema defaults.
const candidates = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
);

const parsed = envSchema.safeParse(candidates);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid backend environment configuration: ${details}`);
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  firebaseStorageBucket: parsed.data.FIREBASE_STORAGE_BUCKET,
  firebaseStorageEmulatorHost: parsed.data.FIREBASE_STORAGE_EMULATOR_HOST,
  openMeteoForecastUrl: parsed.data.OPEN_METEO_FORECAST_URL,
  openMeteoGeocodingUrl: parsed.data.OPEN_METEO_GEOCODING_URL,
  weatherCacheTtlMs: parsed.data.WEATHER_CACHE_TTL_MS,
  weatherRequestTimeoutMs: parsed.data.WEATHER_REQUEST_TIMEOUT_MS,
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiModel: parsed.data.GEMINI_MODEL,
  geminiRequestTimeoutMs: parsed.data.GEMINI_REQUEST_TIMEOUT_MS,
  geminiRetries: parsed.data.GEMINI_RETRIES,
  aiDailyMessageLimit: parsed.data.AI_DAILY_MESSAGE_LIMIT,
  aiMessagesPerMinute: parsed.data.AI_MESSAGES_PER_MINUTE,
  aiDiagnosisDailyLimit: parsed.data.AI_DAILY_DIAGNOSIS_LIMIT,
  aiDiagnosesPerMinute: parsed.data.AI_DIAGNOSES_PER_MINUTE,
  aiHistoryLimit: parsed.data.AI_HISTORY_LIMIT,
  aiPromptMaxChars: parsed.data.AI_PROMPT_MAX_CHARS,
  aiMaxOutputTokens: parsed.data.AI_MAX_OUTPUT_TOKENS,
} as const;
