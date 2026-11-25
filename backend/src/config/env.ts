import path from 'node:path';

import { config } from 'dotenv';
import { z } from 'zod';

// Works from both src/config and dist/config in this CommonJS backend.
const backendEnvPath = path.resolve(__dirname, '../../.env');

// Load backend/.env reliably regardless of process.cwd(), but do not override
// values already provided by the environment.
config({ path: backendEnvPath, override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CORS_ORIGINS: z.string().default(''),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  PRODUCT_IMAGE_REQUIRED: z.preprocess(
    (value) => (value === '' || value === undefined ? 'false' : value),
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),
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
  GEMINI_VISION_MODEL: z.string().default(''),
  // Image requests take substantially longer than text generation on the
  // Interactions endpoint; keep this independent so the chat timeout is unchanged.
  GEMINI_VISION_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(90_000),
  // Bounded retries for temporary image-provider failures (429/500/502/503/504).
  // This is a retry count, so the hard cap is three retries / four provider requests.
  GEMINI_VISION_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  // Wall-clock budget shared by all attempts and backoff waits. Must cover the
  // per-attempt timeout and stay below the mobile client's 120s request timeout.
  GEMINI_VISION_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(110_000),
  // Optional local image for `npm run ai:check-vision`; never sent by the API.
  AI_CHECK_IMAGE_PATH: z.string().default(''),
  DISEASE_PROVIDER: z.enum(['none', 'gemini', 'external']).default('none'),
  AI_DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().max(10_000).default(50),
  AI_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().max(100).default(10),
  AI_DAILY_DIAGNOSIS_LIMIT: z.coerce.number().int().positive().max(10_000).default(20),
  AI_DIAGNOSES_PER_MINUTE: z.coerce.number().int().positive().max(100).default(5),
  AI_HISTORY_LIMIT: z.coerce.number().int().min(1).max(20).default(8),
  AI_PROMPT_MAX_CHARS: z.coerce.number().int().min(500).max(50_000).default(6_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(50).max(4_000).default(600),
  DISEASE_MODEL_ENDPOINT: z.string().default(''),
  DISEASE_MODEL_API_KEY: z.string().default(''),
  DISEASE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(15_000),
  DISEASE_UNCERTAIN_MAX: z.coerce.number().min(0).max(1).default(0.5),
  DISEASE_POSSIBLE_MAX: z.coerce.number().min(0).max(1).default(0.8),
  CHAT_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().max(1_000).default(30),
  CHAT_CONVERSATIONS_PER_DAY: z.coerce.number().int().positive().max(1_000).default(20),
  CHAT_SUPPORT_MESSAGES_PER_HOUR: z.coerce.number().int().positive().max(1_000).default(10),
})
  .refine((data) => data.DISEASE_POSSIBLE_MAX >= data.DISEASE_UNCERTAIN_MAX, {
    message: 'DISEASE_POSSIBLE_MAX must be greater than or equal to DISEASE_UNCERTAIN_MAX',
    path: ['DISEASE_POSSIBLE_MAX'],
  })
  .refine((data) => data.GEMINI_VISION_TOTAL_TIMEOUT_MS >= data.GEMINI_VISION_TIMEOUT_MS, {
    message: 'GEMINI_VISION_TOTAL_TIMEOUT_MS must be greater than or equal to GEMINI_VISION_TIMEOUT_MS',
    path: ['GEMINI_VISION_TOTAL_TIMEOUT_MS'],
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
  cloudinaryCloudName: parsed.data.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: parsed.data.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: parsed.data.CLOUDINARY_API_SECRET,
  productImageRequired: parsed.data.PRODUCT_IMAGE_REQUIRED,
  openMeteoForecastUrl: parsed.data.OPEN_METEO_FORECAST_URL,
  openMeteoGeocodingUrl: parsed.data.OPEN_METEO_GEOCODING_URL,
  weatherCacheTtlMs: parsed.data.WEATHER_CACHE_TTL_MS,
  weatherRequestTimeoutMs: parsed.data.WEATHER_REQUEST_TIMEOUT_MS,
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiModel: parsed.data.GEMINI_MODEL,
  geminiRequestTimeoutMs: parsed.data.GEMINI_REQUEST_TIMEOUT_MS,
  geminiRetries: parsed.data.GEMINI_RETRIES,
  geminiVisionModel: parsed.data.GEMINI_VISION_MODEL,
  geminiVisionTimeoutMs: parsed.data.GEMINI_VISION_TIMEOUT_MS,
  geminiVisionRetries: parsed.data.GEMINI_VISION_RETRIES,
  geminiVisionTotalTimeoutMs: parsed.data.GEMINI_VISION_TOTAL_TIMEOUT_MS,
  aiCheckImagePath: parsed.data.AI_CHECK_IMAGE_PATH,
  diseaseProvider: parsed.data.DISEASE_PROVIDER,
  aiDailyMessageLimit: parsed.data.AI_DAILY_MESSAGE_LIMIT,
  aiMessagesPerMinute: parsed.data.AI_MESSAGES_PER_MINUTE,
  aiDiagnosisDailyLimit: parsed.data.AI_DAILY_DIAGNOSIS_LIMIT,
  aiDiagnosesPerMinute: parsed.data.AI_DIAGNOSES_PER_MINUTE,
  aiHistoryLimit: parsed.data.AI_HISTORY_LIMIT,
  aiPromptMaxChars: parsed.data.AI_PROMPT_MAX_CHARS,
  aiMaxOutputTokens: parsed.data.AI_MAX_OUTPUT_TOKENS,
  diseaseModelEndpoint: parsed.data.DISEASE_MODEL_ENDPOINT,
  diseaseModelApiKey: parsed.data.DISEASE_MODEL_API_KEY,
  diseaseRequestTimeoutMs: parsed.data.DISEASE_REQUEST_TIMEOUT_MS,
  diseaseUncertainMax: parsed.data.DISEASE_UNCERTAIN_MAX,
  diseasePossibleMax: parsed.data.DISEASE_POSSIBLE_MAX,
  chatMessagesPerMinute: parsed.data.CHAT_MESSAGES_PER_MINUTE,
  chatConversationsPerDay: parsed.data.CHAT_CONVERSATIONS_PER_DAY,
  chatSupportMessagesPerHour: parsed.data.CHAT_SUPPORT_MESSAGES_PER_HOUR,
} as const;
