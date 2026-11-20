import { z } from 'zod';

import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import type { WeatherQuery } from '../validators/weather';
import type { WeatherDay, WeatherResponse } from '../types/weather';

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .default([]),
});

const forecastSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    current: z.object({
      time: z.string(),
      temperature_2m: z.number(),
      relative_humidity_2m: z.number().nullish(),
      wind_speed_10m: z.number().nullish(),
      weather_code: z.number(),
    }),
    daily: z.object({
      time: z.array(z.string()),
      weather_code: z.array(z.number()),
      temperature_2m_max: z.array(z.number()),
      temperature_2m_min: z.array(z.number()),
    }),
  })
  .refine((value) => value.daily.time.length > 0, 'No daily forecast returned')
  .refine(
    (value) =>
      value.daily.weather_code.length === value.daily.time.length &&
      value.daily.temperature_2m_max.length === value.daily.time.length &&
      value.daily.temperature_2m_min.length === value.daily.time.length,
    'Daily forecast arrays have different lengths',
  );

type CachedWeather = { value: WeatherResponse; expiresAt: number };
type Location = { latitude: number; longitude: number; label: string; source: 'gps' | 'district' };

const cache = new Map<string, CachedWeather>();

/** Used by tests to isolate cache behavior without restarting the process. */
export function clearWeatherCache(): void {
  cache.clear();
}

function queryCacheKey(query: WeatherQuery): string {
  if (query.lat !== undefined && query.lon !== undefined) {
    return `query:coords:${query.lat.toFixed(3)}:${query.lon.toFixed(3)}`;
  }
  return `query:district:${query.district!.trim().toLowerCase()}`;
}

function coordinateCacheKey(latitude: number, longitude: number): string {
  return `location:coords:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}

async function fetchJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(env.weatherRequestTimeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new HttpError(504, 'WEATHER_TIMEOUT', 'The weather provider timed out.');
    }
    throw new HttpError(502, 'WEATHER_PROVIDER_ERROR', 'The weather provider is unavailable.');
  }

  if (!response.ok) {
    throw new HttpError(502, 'WEATHER_PROVIDER_ERROR', 'The weather provider returned an error.');
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'WEATHER_PROVIDER_ERROR', 'The weather provider returned invalid data.');
  }
}

async function resolveLocation(query: WeatherQuery): Promise<Location> {
  if (query.lat !== undefined && query.lon !== undefined) {
    return {
      latitude: query.lat,
      longitude: query.lon,
      label: 'GPS location',
      source: 'gps',
    };
  }

  const url = new URL(env.openMeteoGeocodingUrl);
  url.searchParams.set('name', query.district!.trim());
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const parsed = geocodingSchema.safeParse(await fetchJson(url));
  const first = parsed.success ? parsed.data.results[0] : undefined;
  if (!first) {
    throw new HttpError(404, 'DISTRICT_NOT_FOUND', 'The district could not be found.');
  }

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    label: first.name || query.district!.trim(),
    source: 'district',
  };
}

function toDailyForecast(daily: z.infer<typeof forecastSchema>['daily']): WeatherDay[] {
  return daily.time.map((date, index) => ({
    date,
    weatherCode: daily.weather_code[index],
    maxTemperature: daily.temperature_2m_max[index],
    minTemperature: daily.temperature_2m_min[index],
  }));
}

export async function getWeather(query: WeatherQuery): Promise<WeatherResponse> {
  const primaryKey = queryCacheKey(query);
  const now = Date.now();
  const cached = cache.get(primaryKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) cache.delete(primaryKey);

  const location = await resolveLocation(query);
  const coordinateKey = coordinateCacheKey(location.latitude, location.longitude);
  const coordinateCached = cache.get(coordinateKey);
  if (coordinateCached && coordinateCached.expiresAt > now) {
    const value =
      coordinateCached.value.locationSource === location.source
        ? coordinateCached.value
        : {
            ...coordinateCached.value,
            locationLabel: location.label,
            locationSource: location.source,
          };
    cache.set(primaryKey, { value, expiresAt: coordinateCached.expiresAt });
    return value;
  }

  const url = new URL(env.openMeteoForecastUrl);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Dhaka');
  url.searchParams.set('forecast_days', '7');

  const parsed = forecastSchema.safeParse(await fetchJson(url));
  if (!parsed.success) {
    throw new HttpError(502, 'WEATHER_PROVIDER_ERROR', 'The weather provider returned invalid data.');
  }

  const response: WeatherResponse = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    locationLabel: location.label,
    locationSource: location.source,
    current: {
      temperature: parsed.data.current.temperature_2m,
      humidity: parsed.data.current.relative_humidity_2m ?? null,
      windSpeed: parsed.data.current.wind_speed_10m ?? null,
      weatherCode: parsed.data.current.weather_code,
      time: parsed.data.current.time,
    },
    daily: toDailyForecast(parsed.data.daily),
    fetchedAt: new Date().toISOString(),
  };

  if (env.weatherCacheTtlMs > 0) {
    const entry: CachedWeather = { value: response, expiresAt: now + env.weatherCacheTtlMs };
    cache.set(primaryKey, entry);
    cache.set(coordinateKey, entry);
  }

  return response;
}
