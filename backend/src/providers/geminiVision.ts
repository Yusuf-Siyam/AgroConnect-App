import { z } from 'zod';

import { env } from '../config/env';
import { CHEMICAL_SAFETY_NOTICE, PHOTO_ADVICE_NOTICE } from '../config/photoAdvice';
import type { PlantPhotoAdvice, PlantPhotoAdvisor, PlantPhotoAdviceInput } from '../types/ai';

import {
  AiInvalidImageError,
  AiNotConfiguredError,
  AiProviderError,
  AiProviderTimeoutError,
} from './aiErrors';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VISION_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 8_000;
const RETRY_JITTER_MS = 500;

export type GeminiVisionOptions = {
  /** Test doubles only; production reads env at call time. */
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  /** Deterministic timing hooks for tests; production uses wall-clock timers. */
  nowImpl?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
  randomImpl?: () => number;
};

type UpstreamDetail = {
  code?: string;
  message?: string;
  status?: string;
};

const adviceSchema = z
  .object({
    observation: z.string().trim().min(1).max(200),
    possibleCauses: z.array(z.string().trim().min(1).max(160)).max(5),
    careSteps: z.array(z.string().trim().min(1).max(240)).max(4),
    uncertainty: z.enum(['unclear', 'possible', 'likely']),
  })
  .strict();

const RESPONSE_FORMAT = {
  type: 'text',
  mime_type: 'application/json',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      observation: {
        type: 'string',
        description: 'A short, uncertain visual observation. Never a diagnosis.',
      },
      possibleCauses: {
        type: 'array',
        description: 'Up to five possible issues; must use uncertain wording.',
        items: { type: 'string' },
      },
      careSteps: {
        type: 'array',
        description: 'Up to four safe, non-chemical care steps. No products or doses.',
        items: { type: 'string' },
      },
      uncertainty: {
        type: 'string',
        enum: ['unclear', 'possible', 'likely'],
        description: 'Bounded uncertainty label, never a numeric confidence.',
      },
    },
    required: ['observation', 'possibleCauses', 'careSteps', 'uncertainty'],
  },
} as const;

const SYSTEM_INSTRUCTION = [
  'You are AgroConnect, an advisory assistant for Bangladesh farmers.',
  'You are giving an UNVERIFIED photo suggestion, not a diagnosis.',
  'Never state certainty, a percentage, or that a crop disease is confirmed.',
  'Never provide chemical names, product names, or numeric doses.',
  'Suggest only safe, non-chemical observations and care steps.',
  `If the photo is unclear, set uncertainty to "unclear" and ask for a clearer photo.`,
  PHOTO_ADVICE_NOTICE,
  CHEMICAL_SAFETY_NOTICE,
].join(' ');

const UNSAFE_ADVICE_PATTERNS = [
  /\b\d+(?:[.,]\d+)?\s*(?:mg|ml|l|lit(?:re|er)s?|g|gm|grams?|kgs?|tsp|tbsp|tablespoons?|teaspoons?)\b/i,
  /\b(?:dose|dosage|spray|mix|apply)\b[^.;]{0,80}\b\d/i,
  /\b(?:pesticide|insecticide|fungicide|herbicide|urea|npk)\b/i,
  /\bper\s+(?:acre|hectare|lit(?:re|er))\b/i,
];

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

function errorForStatus(status: number, retryAfterMs?: number): AiProviderError {
  if (status === 429) {
    return new AiProviderError(
      'The AI provider is rate limiting requests. Please wait a moment.',
      'AI_RATE_LIMITED',
      RETRYABLE_STATUSES.has(status),
      retryAfterMs,
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
      'The configured AI photo model is unavailable. Ask the app owner to select a supported image model.',
      'AI_MODEL_UNAVAILABLE',
      false,
    );
  }
  if (RETRYABLE_STATUSES.has(status)) {
    return new AiProviderError(
      'The AI photo service is temporarily unavailable. Please try again shortly.',
      'AI_PROVIDER_UNAVAILABLE',
      true,
      retryAfterMs,
    );
  }
  return new AiProviderError(
    'The AI service rejected this photo suggestion request.',
    'AI_PROVIDER_ERROR',
    false,
  );
}

/** Retry-After may be delta-seconds or an HTTP date. Both are bounded by the total deadline. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

export function visionRetryDelayMs(
  retryAfterMs: number | undefined,
  attemptIndex: number,
  random = Math.random,
): number {
  if (retryAfterMs !== undefined) return Math.max(0, Math.floor(retryAfterMs));
  const exponential = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attemptIndex);
  return exponential + Math.floor(random() * (RETRY_JITTER_MS + 1));
}

function assertImage(input: PlantPhotoAdviceInput): void {
  if (!Buffer.isBuffer(input.imageData) || input.imageData.byteLength === 0) {
    throw new AiInvalidImageError('The image is empty and cannot be reviewed.', 'INVALID_IMAGE_DATA');
  }
  if (input.imageData.byteLength > MAX_INLINE_IMAGE_BYTES) {
    throw new AiInvalidImageError('The image is too large for an inline Gemini request.', 'IMAGE_TOO_LARGE');
  }
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    throw new AiInvalidImageError('The image type is not supported.', 'INVALID_IMAGE_TYPE');
  }
}

function assertSafeAdvice(advice: z.infer<typeof adviceSchema>): void {
  const strings = [advice.observation, ...advice.possibleCauses, ...advice.careSteps];
  if (strings.some((value) => UNSAFE_ADVICE_PATTERNS.some((pattern) => pattern.test(value)))) {
    throw new AiProviderError('The photo suggestion was rejected by the safety check.');
  }
}

function buildPrompt(input: PlantPhotoAdviceInput): string {
  const crop = input.cropName?.trim() ? input.cropName.trim() : 'unspecified crop';
  return [
    `Language for any farmer-facing prose: ${input.language === 'bn' ? 'Bangla (Bengali)' : 'English'}.`,
    `Farmer-provided crop: ${crop}.`,
    'Review the photo and return only JSON that follows response_format.',
    'Use "unclear" whenever the photo or symptom is not enough to be confident.',
    'Keep every field short and avoid any claim of certainty.',
  ].join('\n');
}

function resolveApiKey(options: GeminiVisionOptions): string {
  return (options.apiKey ?? env.geminiApiKey).trim();
}

function resolveModel(options: GeminiVisionOptions): string {
  return (options.model ?? env.geminiVisionModel).trim();
}

function buildBody(input: PlantPhotoAdviceInput, options: GeminiVisionOptions): unknown {
  return {
    model: resolveModel(options),
    system_instruction: SYSTEM_INSTRUCTION,
    input: [
      { type: 'text', text: buildPrompt(input) },
      {
        type: 'image',
        data: input.imageData.toString('base64'),
        mime_type: input.mimeType,
      },
    ],
    response_format: RESPONSE_FORMAT,
    generation_config: { max_output_tokens: env.aiMaxOutputTokens },
    store: false,
  };
}

/**
 * Raw Interactions REST responses use steps[].content[].text. generateContent
 * uses candidates[].content.parts[].text, and the SDK exposes output_text.
 * Accept all three so a provider transport change cannot be mistaken for a
 * missing suggestion.
 */
function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new AiProviderError('The Gemini API returned an empty response.');
  }

  const root = payload as {
    output_text?: unknown;
    candidates?: unknown;
    steps?: unknown;
  };

  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text.trim();
  }

  if (Array.isArray(root.candidates)) {
    for (const candidate of root.candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
      if (!Array.isArray(parts)) continue;
      const text = parts
        .map((part) =>
          part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('')
        .trim();
      if (text) return text;
    }
  }

  if (Array.isArray(root.steps)) {
    for (const step of root.steps) {
      if (!step || typeof step !== 'object') continue;
      const content = (step as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      const text = content
        .map((part) =>
          part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('')
        .trim();
      if (text) return text;
    }
  }

  throw new AiProviderError('The Gemini API returned no usable suggestion.');
}

function parseAdvice(payload: unknown): PlantPhotoAdvice {
  const outputText = extractResponseText(payload);
  const json = outputText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    throw new AiProviderError('The Gemini API returned invalid JSON.');
  }

  const parsed = adviceSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AiProviderError('The Gemini photo advisor returned an invalid suggestion.');
  }
  assertSafeAdvice(parsed.data);

  return {
    source: 'gemini_vision',
    observation: parsed.data.observation,
    possibleCauses: parsed.data.possibleCauses,
    careSteps: parsed.data.careSteps,
    uncertainty: parsed.data.uncertainty,
    verified: false,
    notice: `${PHOTO_ADVICE_NOTICE} ${CHEMICAL_SAFETY_NOTICE}`,
  };
}

async function postWithTimeout(
  body: unknown,
  apiKey: string,
  model: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  attempt: number,
  totalAttempts: number,
): Promise<unknown> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Api-Revision': API_REVISION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await readUpstreamDetail(response, apiKey);
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      const error = errorForStatus(response.status, retryAfterMs);
      // Preserve the original upstream detail internally, redacted and never
      // returned to the client. No key, prompt or image is logged.
      console.error('[gemini] vision request failed', {
        model,
        attempt,
        totalAttempts,
        status: response.status,
        retryable: error.retryable,
        retryAfterMs: retryAfterMs ?? null,
        upstreamStatus: detail.status,
        upstreamCode: detail.code,
        upstreamMessage: detail.message,
        elapsedMs: Date.now() - startedAt,
      });
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted) throw new AiProviderTimeoutError('The Gemini photo advisor');
    console.error('[gemini] vision request could not be delivered', {
      model,
      attempt,
      totalAttempts,
      elapsedMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw new AiProviderError('Could not reach the Gemini API.', 'AI_PROVIDER_ERROR', true);
  } finally {
    clearTimeout(timer);
  }
}

/** The only file that sends plant photos to Gemini. No key or image is logged. */
export function createGeminiVisionAdvisor(options: GeminiVisionOptions = {}): PlantPhotoAdvisor {
  return {
    async suggest(input: PlantPhotoAdviceInput): Promise<PlantPhotoAdvice> {
      const apiKey = resolveApiKey(options);
      const model = resolveModel(options);
      if (!apiKey || !model) {
        throw new AiNotConfiguredError(
          'Gemini photo advisor',
          'Set GEMINI_API_KEY and GEMINI_VISION_MODEL on the backend.',
        );
      }

      assertImage(input);

      const timeoutMs = options.timeoutMs ?? env.geminiVisionTimeoutMs;
      const totalTimeoutMs = options.totalTimeoutMs ?? env.geminiVisionTotalTimeoutMs;
      const retries = Math.min(Math.max(0, options.retries ?? env.geminiVisionRetries), MAX_VISION_RETRIES);
      const attempts = 1 + retries;
      const fetchImpl = options.fetchImpl ?? fetch;
      const now = options.nowImpl ?? Date.now;
      const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const random = options.randomImpl ?? Math.random;
      const body = buildBody(input, options);
      const startedAt = now();

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const remainingMs = totalTimeoutMs - (now() - startedAt);
        if (remainingMs <= 0) throw new AiProviderTimeoutError('The Gemini photo advisor');

        const attemptTimeoutMs = Math.max(1, Math.min(timeoutMs, remainingMs));
        try {
          const payload = await postWithTimeout(
            body,
            apiKey,
            model,
            attemptTimeoutMs,
            fetchImpl,
            attempt + 1,
            attempts,
          );
          return parseAdvice(payload);
        } catch (error) {
          const providerError =
            error instanceof AiProviderError
              ? error
              : new AiProviderError('Could not reach the Gemini API.', 'AI_PROVIDER_ERROR', true);
          if (!providerError.retryable || attempt === attempts - 1) throw providerError;

          const delayMs = visionRetryDelayMs(providerError.retryAfterMs, attempt, random);
          const waitRemainingMs = totalTimeoutMs - (now() - startedAt);
          if (delayMs >= waitRemainingMs) throw new AiProviderTimeoutError('The Gemini photo advisor');
          await sleep(delayMs);
        }
      }

      throw new AiProviderTimeoutError('The Gemini photo advisor');
    },
  };
}
