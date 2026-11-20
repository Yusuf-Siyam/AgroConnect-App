import * as Location from 'expo-location';
import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { Weather } from './types';

const weatherSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  locationLabel: z.string(),
  locationSource: z.enum(['gps', 'district']),
  current: z.object({
    temperature: z.number(),
    humidity: z.number().nullable(),
    windSpeed: z.number().nullable(),
    weatherCode: z.number(),
    time: z.string(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      weatherCode: z.number(),
      maxTemperature: z.number(),
      minTemperature: z.number(),
    }),
  ),
  fetchedAt: z.string(),
});

function parseOrThrow(data: unknown): Weather {
  const result = weatherSchema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

async function getGpsCoordinates(): Promise<{ lat: number; lon: number } | undefined> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return undefined;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return undefined;
  }
}

/**
 * GPS first, then the profile district, then a manual district string.
 * The API owns the Open-Meteo key/proxy and caching.
 */
export async function getWeather(options?: {
  district?: string;
  useGps?: boolean;
}): Promise<Weather> {
  assertApiConfigured();
  const coordinates = options?.useGps === false ? undefined : await getGpsCoordinates();
  const district = options?.district?.trim();

  if (!coordinates && !district) {
    throw { code: 'LOCATION_REQUIRED', message: 'Allow location or provide a district' } as const;
  }

  try {
    const response = await api.get('/api/weather', { params: coordinates ?? { district } });
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
