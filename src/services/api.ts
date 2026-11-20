import { create as createApiClient, isAxiosError } from 'axios';

import { env } from '@/config/env';
import type { UserProfile } from '@/types/user';

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider = async () => null;

export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export const api = createApiClient({
  baseURL: env.apiBaseUrl || undefined,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await tokenProvider();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type ApiError = {
  code: string;
  message: string;
};

export function toApiError(error: unknown): ApiError {
  if (isAxiosError(error)) {
    const data = error.response?.data as { error?: { code?: string; message?: string } } | undefined;
    return {
      code: data?.error?.code ?? (error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR'),
      message: data?.error?.message ?? error.message,
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return {
      code: error.code,
      message: 'message' in error && typeof error.message === 'string' ? error.message : error.code,
    };
  }

  return { code: 'UNKNOWN_ERROR', message: 'Unknown error' };
}

export function assertApiConfigured(): void {
  if (!env.isApiConfigured) {
    throw Object.assign(new Error('API base URL is not configured'), { code: 'api/not-configured' });
  }
}

export async function fetchMyProfile(): Promise<UserProfile> {
  assertApiConfigured();
  const { data } = await api.get<UserProfile>('/api/auth/me');
  return data;
}

export type ProfileUpdate = {
  displayName?: string;
  phoneNumber?: string;
  district?: string;
  preferredLanguage?: 'bn' | 'en';
};

export async function patchMyProfile(update: ProfileUpdate): Promise<UserProfile> {
  assertApiConfigured();
  const { data } = await api.patch<UserProfile>('/api/auth/profile', update);
  return data;
}
