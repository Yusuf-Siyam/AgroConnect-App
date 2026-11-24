import { z } from 'zod';

import { env } from '../config/env';
import { CHEMICAL_SAFETY_NOTICE, PHOTO_ADVICE_NOTICE } from '../config/photoAdvice';
import type { PlantPhotoAdvice, PlantPhotoAdvisor, PlantPhotoAdviceInput } from '../types/ai';

import { AiNotConfiguredError, AiProviderError, AiProviderTimeoutError } from './aiErrors';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

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
  };
}

function resolveApiKey(options: GeminiVisionOptions): string {
  return (options.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
}

function resolveModel(options: GeminiVisionOptions): string {
  return (options.model ?? process.env.GEMINI_VISION_MODEL ?? '').trim();
}

function parseAdvice(payload: unknown): PlantPhotoAdvice {
  if (!payload || typeof payload !== 'object') {
    throw new AiProviderError('The Gemini API returned an empty response.');
  }
  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText !== 'string' || outputText.trim() === '') {
    throw new AiProviderError('The Gemini API returned no usable suggestion.');
  }

  const json = outputText
    .trim()
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

export type GeminiVisionOptions = {
  /** Test doubles only; production reads env at call time. */
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
};

async function postWithTimeout(
  body: unknown,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
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
      // Never log or forward response bodies: they can contain request details.
      if (response.status === 429) {
        throw new AiProviderError(
          'The AI provider is rate limiting requests. Please wait a moment.',
          'AI_RATE_LIMITED',
        );
      }
      if (response.status >= 500) {
        throw new AiProviderError('The Gemini API is temporarily unavailable.', 'AI_PROVIDER_ERROR', true);
      }
      throw new AiProviderError('The Gemini API rejected this photo suggestion request.');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted) throw new AiProviderTimeoutError('The Gemini photo advisor');
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

      const timeoutMs = options.timeoutMs ?? env.geminiRequestTimeoutMs;
      const attempts = 1 + (options.retries ?? env.geminiRetries);
      const fetchImpl = options.fetchImpl ?? fetch;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const payload = await postWithTimeout(buildBody(input, options), apiKey, timeoutMs, fetchImpl);
          return parseAdvice(payload);
        } catch (error) {
          const retryable = error instanceof AiProviderError && error.retryable;
          if (!retryable || attempt === attempts - 1) throw error;
        }
      }

      throw new AiProviderError('The Gemini photo advisor could not complete this request.');
    },
  };
}
