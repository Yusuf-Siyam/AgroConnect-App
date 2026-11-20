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
} as const;
