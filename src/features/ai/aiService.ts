import { api, assertApiConfigured, toApiError } from '@/services/api';
import type { TranslationKey } from '@/i18n';

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
  return request(() => api.post<ChatResult>('/api/ai/chat', input));
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

export function submitDiagnosis(input: {
  image: Diagnosis['image'];
  language: 'bn' | 'en';
  cropName?: string;
}): Promise<Diagnosis> {
  return request(() => api.post<Diagnosis>('/api/ai/diagnose', input));
}

export function listDiagnoses(limit = 20, offset = 0): Promise<DiagnosisList> {
  return request(() => api.get<DiagnosisList>('/api/ai/diagnoses', { params: { limit, offset } }));
}

export function deleteDiagnosis(diagnosisId: string): Promise<void> {
  return request(() => api.delete<void>(`/api/ai/diagnoses/${diagnosisId}`));
}

/** Backend error codes are never shown raw; the UI uses translated copy. */
export function aiErrorKey(code?: string): TranslationKey {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return 'ai.error.notConfigured';
    case 'AI_DAILY_MESSAGE_LIMIT_REACHED':
    case 'AI_DAILY_DIAGNOSIS_LIMIT_REACHED':
      return 'ai.error.limitReached';
    case 'AI_RATE_LIMITED':
      return 'ai.error.rateLimited';
    case 'AI_PROVIDER_TIMEOUT':
      return 'ai.error.timeout';
    case 'AI_PROVIDER_ERROR':
      return 'ai.error.provider';
    case 'IMAGE_NOT_FOUND':
      return 'ai.error.imageNotFound';
    case 'INVALID_IMAGE_TYPE':
      return 'ai.error.invalidType';
    case 'IMAGE_TOO_LARGE':
      return 'ai.error.tooLarge';
    case 'INVALID_IMAGE_PATH':
      return 'ai.error.invalidPath';
    case 'DIAGNOSIS_DUPLICATE':
      return 'ai.error.duplicate';
    case 'NETWORK_ERROR':
      return 'error.network';
    default:
      return 'error.generic';
  }
}
