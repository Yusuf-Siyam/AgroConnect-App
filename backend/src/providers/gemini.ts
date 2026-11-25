import { env } from '../config/env';
import type { AiLanguage, AiTextProvider, AiTextRequest } from '../types/ai';

import { AiNotConfiguredError, AiProviderError, AiProviderTimeoutError } from './aiErrors';

const GEMINI_GENERATE_CONTENT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const LANGUAGE_LABEL: Record<AiLanguage, string> = {
  bn: 'Bangla (Bengali)',
  en: 'English',
};

export type GeminiTextOptions = {
  /** Test doubles only; production reads env at call time. */
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
};

type UpstreamDetail = {
  code?: string;
  message?: string;
  status?: string;
};

function languageName(language: AiLanguage): string {
  return LANGUAGE_LABEL[language];
}

function buildInput(request: AiTextRequest): string {
  const lines = request.messages.map((message) => {
    const speaker = message.role === 'user' ? 'Farmer' : 'Assistant';
    return `${speaker}: ${message.text}`;
  });
  lines.push(`Assistant (reply only in ${languageName(request.language)}):`);
  return lines.join('\n\n');
}

function buildBody(request: AiTextRequest): unknown {
  return {
    system_instruction: { parts: [{ text: request.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: buildInput(request) }] }],
    generationConfig: { maxOutputTokens: env.aiMaxOutputTokens },
  };
}

function sanitizeDetail(value: unknown, apiKey: string): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return '';
  let safe = value;
  if (apiKey) safe = safe.split(apiKey).join('[REDACTED]');
  safe = safe.replace(/key=[^\s&"']+/gi, 'key=[REDACTED]');
  safe = safe.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]');
  return safe.slice(0, 300);
}

async function readUpstreamDetail(response: Response, apiKey: string): Promise<UpstreamDetail> {
  try {
    const raw = await response.text();
    const parsed = JSON.parse(raw) as {
      error?: { code?: unknown; message?: unknown; status?: unknown };
    };
    return {
      code: sanitizeDetail(parsed.error?.code, apiKey),
      message: sanitizeDetail(parsed.error?.message, apiKey),
      status: sanitizeDetail(parsed.error?.status, apiKey),
    };
  } catch {
    return {};
  }
}

function errorForStatus(status: number): AiProviderError {
  if (status === 429) {
    return new AiProviderError(
      'The AI provider is rate limiting requests. Please wait a moment.',
      'AI_RATE_LIMITED',
    );
  }
  if (status === 401 || status === 403) {
    return new AiProviderError(
      'The AI service credentials were rejected. Ask the app owner to check the backend configuration.',
      'AI_PROVIDER_AUTH',
      false,
    );
  }
  if (status === 404) {
    return new AiProviderError(
      'The configured AI model is unavailable. Ask the app owner to select a supported model.',
      'AI_MODEL_UNAVAILABLE',
      false,
    );
  }
  if (status >= 500) {
    return new AiProviderError(
      'The AI service is temporarily unavailable. Please try again shortly.',
      'AI_PROVIDER_UNAVAILABLE',
      true,
    );
  }
  return new AiProviderError(
    'The AI service rejected this request. Please try again.',
    'AI_PROVIDER_ERROR',
    false,
  );
}

async function postWithTimeout(
  url: string,
  body: unknown,
  apiKey: string,
  model: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await readUpstreamDetail(response, apiKey);
      // Log status and redacted upstream fields only; never the key or request body.
      console.error('[gemini] text request failed', {
        model,
        status: response.status,
        upstreamStatus: detail.status,
        upstreamCode: detail.code,
        upstreamMessage: detail.message,
      });
      throw errorForStatus(response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted) throw new AiProviderTimeoutError('The Gemini assistant');
    throw new AiProviderError('Could not reach the Gemini API.', 'AI_PROVIDER_ERROR', true);
  } finally {
    clearTimeout(timer);
  }
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new AiProviderError('The Gemini API returned an empty response.');
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    throw new AiProviderError('The Gemini API returned no usable text.');
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? ((part as { text: string }).text)
          : '',
      )
      .join('')
      .trim();
    if (text) return text;
  }

  throw new AiProviderError('The Gemini API returned no usable text.');
}

/**
 * The only file that talks to Gemini. The key and model are read from backend
 * environment variables; no model name or credential is embedded in the app.
 */
export function createGeminiTextProvider(options: GeminiTextOptions = {}): AiTextProvider {
  return {
    async generateText(request: AiTextRequest): Promise<string> {
      // Read at call time so configuration changes do not require a rebuild.
      const apiKey = options.apiKey !== undefined
        ? options.apiKey.trim()
        : process.env.GEMINI_API_KEY?.trim() ?? '';
      const model = options.model !== undefined
        ? options.model.trim()
        : process.env.GEMINI_MODEL?.trim() ?? '';

      if (!apiKey || !model) {
        throw new AiNotConfiguredError(
          'AI assistant',
          'Set GEMINI_API_KEY and GEMINI_MODEL on the backend.',
        );
      }

      const url = `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`;
      const body = buildBody(request);
      const timeoutMs = options.timeoutMs ?? env.geminiRequestTimeoutMs;
      const fetchImpl = options.fetchImpl ?? fetch;
      const retries = options.retries ?? env.geminiRetries;
      const attempts = 1 + retries;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const payload = await postWithTimeout(url, body, apiKey, model, timeoutMs, fetchImpl);
          return extractText(payload);
        } catch (error) {
          const retryable = error instanceof AiProviderError && error.retryable;
          if (!retryable || attempt === attempts - 1) throw error;
        }
      }

      throw new AiProviderError('The Gemini assistant could not complete this request.');
    },
  };
}
