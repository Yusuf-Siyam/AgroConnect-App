import { api, assertApiConfigured, toApiError } from '@/services/api';

import type {
  ChatResult,
  Conversation,
  ConversationList,
  Diagnosis,
  DiagnosisList,
} from './types';

async function request<T>(operation: () => Promise<{ data: T }>): Promise<T> {
  assertApiConfigured();
  try {
    return (await operation()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export function sendAiMessage(input: {
  message: string;
  language: 'bn' | 'en';
  conversationId?: string;
}): Promise<ChatResult> {
  // The backend may retry a transient Gemini failure, so allow longer than the
  // global API timeout for this one request.
  return request(() => api.post<ChatResult>('/api/ai/chat', input, { timeout: 60_000 }));
}

export function listAiConversations(limit = 20, offset = 0): Promise<ConversationList> {
  return request(() => api.get<ConversationList>('/api/ai/conversations', { params: { limit, offset } }));
}

export function getAiConversation(conversationId: string): Promise<Conversation> {
  return request(() => api.get<Conversation>(`/api/ai/conversations/${conversationId}`));
}

export function deleteAiConversation(conversationId: string): Promise<void> {
  return request(() => api.delete<void>(`/api/ai/conversations/${conversationId}`));
}

export type AiPhotoStatus = {
  provider: 'none' | 'gemini' | 'external' | 'invalid';
  photoAdviceConfigured: boolean;
  geminiApiKeyPresent: boolean;
  geminiVisionModelPresent: boolean;
  externalConfigured: boolean;
};

/** Secret-free flags from the running server, not from the client bundle. */
export function getAiPhotoStatus(): Promise<AiPhotoStatus> {
  return request(() => api.get<AiPhotoStatus>('/api/ai/status'));
}

export function submitDiagnosis(input: {
  image: Diagnosis['image'];
  language: 'bn' | 'en';
  cropName?: string;
}): Promise<Diagnosis> {
  // A real Gemini image request can take close to a minute; keep the app from
  // timing out before the backend's 90s vision timeout completes.
  return request(() => api.post<Diagnosis>('/api/ai/diagnose', input, { timeout: 120_000 }));
}

export function listDiagnoses(limit = 20, offset = 0): Promise<DiagnosisList> {
  return request(() => api.get<DiagnosisList>('/api/ai/diagnoses', { params: { limit, offset } }));
}

export function deleteDiagnosis(diagnosisId: string): Promise<void> {
  return request(() => api.delete<void>(`/api/ai/diagnoses/${diagnosisId}`));
}

export { aiErrorKey, isRetryableAiError } from './aiErrors';
