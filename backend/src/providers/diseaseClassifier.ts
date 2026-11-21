import { z } from 'zod';

import { env } from '../config/env';
import type { CropDiseaseClassifier, CropDiseaseInput, CropDiseaseResult } from '../types/ai';

import { AiNotConfiguredError, AiProviderError, AiProviderTimeoutError } from './aiErrors';

const resultSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    confidence: z.number().finite().min(0).max(1),
    alternatives: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  })
  .strict();

const responseSchema = z.union([
  resultSchema,
  z.object({ result: resultSchema }).strict(),
]);

function parseResult(payload: unknown): CropDiseaseResult {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiProviderError('The disease classifier returned an invalid result.');
  }
  return 'result' in parsed.data ? parsed.data.result : parsed.data;
}

async function postWithTimeout(
  endpoint: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status >= 500) {
        throw new AiProviderError('The disease classifier is temporarily unavailable.', 'AI_PROVIDER_ERROR', true);
      }
      throw new AiProviderError('The disease classifier rejected this request.');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted) throw new AiProviderTimeoutError('The disease classifier');
    throw new AiProviderError('Could not reach the disease classifier.', 'AI_PROVIDER_ERROR', true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Adapter for the owner-supplied disease service. No model is chosen here: the
 * endpoint and key come from env, and the service is expected to accept JSON
 * with an inline base64 image plus its MIME type and optional crop name.
 */
export function createCropDiseaseClassifier(): CropDiseaseClassifier {
  return {
    async classify(input: CropDiseaseInput): Promise<CropDiseaseResult> {
      const endpoint = process.env.DISEASE_MODEL_ENDPOINT?.trim() ?? '';
      const apiKey = process.env.DISEASE_MODEL_API_KEY?.trim() ?? '';

      if (!endpoint || !apiKey) {
        throw new AiNotConfiguredError(
          'Disease classifier',
          'Set DISEASE_MODEL_ENDPOINT and DISEASE_MODEL_API_KEY on the backend.',
        );
      }

      let url: URL;
      try {
        url = new URL(endpoint);
      } catch {
        throw new AiNotConfiguredError('Disease classifier', 'DISEASE_MODEL_ENDPOINT must be a valid URL.');
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AiNotConfiguredError('Disease classifier', 'DISEASE_MODEL_ENDPOINT must use http or https.');
      }

      const body = {
        image: {
          data: input.imageData.toString('base64'),
          mimeType: input.mimeType,
        },
        cropName: input.cropName ?? null,
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const payload = await postWithTimeout(
            endpoint,
            apiKey,
            body,
            env.diseaseRequestTimeoutMs,
          );
          return parseResult(payload);
        } catch (error) {
          const retryable = error instanceof AiProviderError && error.retryable;
          if (!retryable || attempt === 1) throw error;
        }
      }

      throw new AiProviderError('The disease classifier could not complete this request.');
    },
  };
}
