import { assertApiConfigured, api, toApiError } from '@/services/api';

import {
  parseBuyerDelivery,
  parseDeliveryJob,
  parseDeliveryJobList,
  parseEarningsHistory,
  parseEarningsSummary,
  parseTransporterProfile,
} from './schema';
import type {
  BuyerDelivery,
  DeliveryJob,
  DeliveryJobList,
  EarningsHistory,
  EarningsSummary,
  TransporterProfile,
} from './types';

export type PaginationParams = { limit?: number; offset?: number };
export type TransporterProfilePayload = {
  name: string;
  phone: string;
  district: string;
  vehicleType: string;
  plateNumber: string;
  capacityKg: number;
};

function cleanParams(params: PaginationParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  ) as Record<string, number>;
}

export async function getTransporterProfile(): Promise<TransporterProfile | null> {
  assertApiConfigured();
  try {
    const { data } = await api.get('/api/delivery/transporter-profile');
    return parseTransporterProfile(data);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === 'HTTP_404' || apiError.code === 'PROFILE_NOT_FOUND') return null;
    throw apiError;
  }
}

export async function createTransporterProfile(
  payload: TransporterProfilePayload,
): Promise<TransporterProfile> {
  assertApiConfigured();
  try {
    const { data } = await api.post('/api/delivery/transporter-profile', payload);
    return parseTransporterProfile(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateTransporterProfile(
  payload: Partial<TransporterProfilePayload>,
): Promise<TransporterProfile> {
  assertApiConfigured();
  try {
    const { data } = await api.patch('/api/delivery/transporter-profile', payload);
    return parseTransporterProfile(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listAvailableJobs(params: PaginationParams): Promise<DeliveryJobList> {
  assertApiConfigured();
  try {
    const { data } = await api.get('/api/delivery/jobs', { params: cleanParams(params) });
    return parseDeliveryJobList(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listMyDeliveries(params: PaginationParams): Promise<DeliveryJobList> {
  assertApiConfigured();
  try {
    const { data } = await api.get('/api/delivery/jobs/mine', { params: cleanParams(params) });
    return parseDeliveryJobList(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getDeliveryJob(jobId: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.get(`/api/delivery/jobs/${jobId}`);
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function acceptDeliveryJob(jobId: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/accept`);
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function rejectDeliveryJob(jobId: string, reason?: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/reject`, {
      ...(reason ? { reason } : {}),
    });
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function confirmPickup(jobId: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/collect`);
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function startDelivery(jobId: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/ship`);
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function confirmDelivery(jobId: string, code: string): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/deliver`, { code });
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function sendJobLocation(
  jobId: string,
  latitude: number,
  longitude: number,
): Promise<DeliveryJob> {
  assertApiConfigured();
  try {
    const { data } = await api.post(`/api/delivery/jobs/${jobId}/location`, { latitude, longitude });
    return parseDeliveryJob(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getBuyerDelivery(orderId: string): Promise<BuyerDelivery> {
  assertApiConfigured();
  try {
    const { data } = await api.get(`/api/delivery/buyer/orders/${orderId}/delivery`);
    return parseBuyerDelivery(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getEarningsSummary(): Promise<EarningsSummary> {
  assertApiConfigured();
  try {
    const { data } = await api.get('/api/delivery/earnings/summary');
    return parseEarningsSummary(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listEarnings(params: PaginationParams): Promise<EarningsHistory> {
  assertApiConfigured();
  try {
    const { data } = await api.get('/api/delivery/earnings/history', { params: cleanParams(params) });
    return parseEarningsHistory(data);
  } catch (error) {
    throw toApiError(error);
  }
}
