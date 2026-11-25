import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AiInvalidImageError,
  AiNotConfiguredError,
  AiProviderError,
  AiProviderTimeoutError,
  toAiHttpError,
} from './aiErrors';
import {
  createGeminiVisionAdvisor,
  parseRetryAfterMs,
  visionRetryDelayMs,
} from './geminiVision';
import type { PlantPhotoAdviceInput } from '../types/ai';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const input: PlantPhotoAdviceInput = {
  image: {
    provider: 'cloudinary',
    publicId: 'agroconnect/diagnoses/user-1/suggestion-1/photo',
    resourceType: 'image',
    deliveryType: 'authenticated',
  },
  imageData: IMAGE_BYTES,
  mimeType: 'image/jpeg',
  cropName: 'Tomato',
  language: 'en',
};

type FakeResponse = {
  status?: number;
  payload: unknown;
  headers?: Record<string, string>;
};
type FetchCall = { url: string; init: RequestInit };

function fakeFetch(responses: FakeResponse[]): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify(response.payload), {
      status: response.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...response.headers },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Matches the raw Interactions REST shape, not the SDK's output_text helper. */
function interactionPayload(advice: Record<string, unknown> | string): unknown {
  const text = typeof advice === 'string' ? advice : JSON.stringify(advice);
  return {
    object: 'interaction',
    status: 'completed',
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

const validAdvice = {
  observation: 'Some leaves look spotted',
  possibleCauses: ['Possible leaf spot', 'Possible water stress'],
  careSteps: ['Remove badly affected leaves', 'Improve airflow around the plant'],
  uncertainty: 'possible',
};

function timingHooks() {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleepImpl: async (ms: number) => {
      sleeps.push(ms);
    },
    randomImpl: () => 0,
  };
}

describe('Gemini vision plant-photo advisor', () => {
  it('sends inline image bytes, strict JSON response format and parses an unverified suggestion', async () => {
    const { fetchImpl, calls } = fakeFetch([{ payload: interactionPayload(validAdvice) }]);
    const advisor = createGeminiVisionAdvisor({ apiKey: 'test-key', model: 'test-vision-model', fetchImpl });

    const result = await advisor.suggest(input);

    assert.equal(result.source, 'gemini_vision');
    assert.equal(result.verified, false);
    assert.equal(result.uncertainty, 'possible');
    assert.deepEqual(result.possibleCauses, validAdvice.possibleCauses);
    assert.match(result.notice, /unverified/i);
    assert.match(result.notice, /extension officer/i);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');

    const init = calls[0]!.init;
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['x-goog-api-key'], 'test-key');
    assert.equal(headers['Api-Revision'], '2026-05-20');

    const body = JSON.parse(String(init.body)) as {
      model: string;
      system_instruction: string;
      input: Array<{ type: string; data?: string; mime_type?: string; text?: string }>;
      response_format: {
        type: string;
        mime_type: string;
        schema: { required: string[]; additionalProperties: boolean };
      };
      generation_config: { max_output_tokens: number };
      store: boolean;
    };
    assert.equal(body.model, 'test-vision-model');
    assert.match(body.system_instruction, /unverified photo suggestion/i);
    assert.match(body.system_instruction, /never.*chemical names/i);
    assert.equal(body.input[1]!.type, 'image');
    assert.equal(body.input[1]!.data, IMAGE_BYTES.toString('base64'));
    assert.equal(body.input[1]!.mime_type, 'image/jpeg');
    assert.equal(body.response_format.type, 'text');
    assert.equal(body.response_format.mime_type, 'application/json');
    assert.equal(body.response_format.schema.additionalProperties, false);
    assert.deepEqual(body.response_format.schema.required, [
      'observation',
      'possibleCauses',
      'careSteps',
      'uncertainty',
    ]);
    assert.ok(body.generation_config.max_output_tokens > 0);
    assert.equal(body.store, false);
  });

  it('also accepts generateContent candidates and SDK-style output_text', async () => {
    const candidatePayload = {
      candidates: [{ content: { parts: [{ text: JSON.stringify(validAdvice) }] } }],
    };
    const candidateFetch = fakeFetch([{ payload: candidatePayload }]);
    const candidateAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 0,
      fetchImpl: candidateFetch.fetchImpl,
    });
    assert.equal((await candidateAdvisor.suggest(input)).uncertainty, 'possible');

    const sdkFetch = fakeFetch([{ payload: { output_text: JSON.stringify(validAdvice) } }]);
    const sdkAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 0,
      fetchImpl: sdkFetch.fetchImpl,
    });
    assert.equal((await sdkAdvisor.suggest(input)).source, 'gemini_vision');
  });

  it('rejects malformed or unsupported responses without inventing advice', async () => {
    const cases = [
      { payload: {} },
      { payload: { steps: [{ type: 'reasoning', content: [{ type: 'text', text: 'thinking' }] }] } },
      { payload: interactionPayload('not json') },
      { payload: interactionPayload({ ...validAdvice, unexpected: true }) },
      { payload: interactionPayload({ ...validAdvice, uncertainty: 'certain' }) },
      { payload: interactionPayload({ observation: '', possibleCauses: [], careSteps: [], uncertainty: 'possible' }) },
    ];
    const { fetchImpl } = fakeFetch(cases);
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 0,
      fetchImpl,
    });

    for (let index = 0; index < cases.length; index += 1) {
      await assert.rejects(advisor.suggest(input), AiProviderError);
    }
  });

  it('rejects chemical names and numeric doses on the server', async () => {
    const { fetchImpl } = fakeFetch([
      {
        payload: interactionPayload({
          ...validAdvice,
          careSteps: ['Spray 5 ml fungicide per litre'],
        }),
      },
    ]);
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      fetchImpl,
    });

    await assert.rejects(advisor.suggest(input), (error: unknown) => {
      return error instanceof AiProviderError && /safety check/i.test(error.message);
    });
  });

  it('rejects invalid image input with a stable client-safe code before calling Gemini', async () => {
    const { fetchImpl, calls } = fakeFetch([{ payload: interactionPayload(validAdvice) }]);
    const advisor = createGeminiVisionAdvisor({ apiKey: 'test-key', model: 'test-vision-model', fetchImpl });

    const cases: Array<{ image: PlantPhotoAdviceInput; code: string }> = [
      { image: { ...input, imageData: Buffer.alloc(0) }, code: 'INVALID_IMAGE_DATA' },
      { image: { ...input, imageData: Buffer.alloc(5 * 1024 * 1024 + 1) }, code: 'IMAGE_TOO_LARGE' },
      { image: { ...input, mimeType: 'application/pdf' }, code: 'INVALID_IMAGE_TYPE' },
    ];

    for (const testCase of cases) {
      await assert.rejects(advisor.suggest(testCase.image), (error: unknown) => {
        return error instanceof AiInvalidImageError && error.code === testCase.code && !error.retryable;
      });
      assert.equal(toAiHttpError(new AiInvalidImageError('x', testCase.code)).statusCode, 400);
    }
    assert.equal(calls.length, 0);
  });

  it('retries a 503 with bounded exponential backoff and then succeeds', async () => {
    const retry = fakeFetch([
      { status: 503, payload: { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } } },
      { status: 503, payload: { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } } },
      { payload: interactionPayload(validAdvice) },
    ]);
    const timing = timingHooks();
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 2,
      fetchImpl: retry.fetchImpl,
      ...timing,
    });

    const result = await advisor.suggest(input);

    assert.equal(result.uncertainty, 'possible');
    assert.equal(retry.calls.length, 3);
    assert.deepEqual(timing.sleeps, [1_000, 2_000]);
  });

  it('stops after the strict retry cap when every 503 attempt fails', async () => {
    const retry = fakeFetch([
      { status: 503, payload: { error: { code: 503, message: 'high demand' } } },
    ]);
    const timing = timingHooks();
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 99,
      fetchImpl: retry.fetchImpl,
      ...timing,
    });

    await assert.rejects(advisor.suggest(input), (error: unknown) => {
      return error instanceof AiProviderError && error.code === 'AI_PROVIDER_UNAVAILABLE' && error.retryable;
    });
    assert.equal(retry.calls.length, 4); // one attempt plus at most three retries
    assert.deepEqual(timing.sleeps, [1_000, 2_000, 4_000]);
  });

  it('retries a 429 rate limit, respects Retry-After and keeps the rate-limit code', async () => {
    const retry = fakeFetch([
      { status: 429, headers: { 'Retry-After': '3' }, payload: { error: { code: 429 } } },
      { payload: interactionPayload(validAdvice) },
    ]);
    const timing = timingHooks();
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 2,
      fetchImpl: retry.fetchImpl,
      ...timing,
    });

    assert.equal((await advisor.suggest(input)).source, 'gemini_vision');
    assert.deepEqual(timing.sleeps, [3_000]);
    assert.equal(toAiHttpError(new AiProviderError('x', 'AI_RATE_LIMITED', false)).statusCode, 429);

    const exhausted = fakeFetch([{ status: 429, payload: { error: { code: 429 } } }]);
    const exhaustedAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 1,
      fetchImpl: exhausted.fetchImpl,
      ...timingHooks(),
    });
    await assert.rejects(exhaustedAdvisor.suggest(input), (error: unknown) => {
      return error instanceof AiProviderError && error.code === 'AI_RATE_LIMITED';
    });
    assert.equal(exhausted.calls.length, 2);
  });

  it('does not retry permanent 4xx failures, including invalid requests and auth/model errors', async () => {
    const cases = [
      { status: 400, code: 'AI_PROVIDER_ERROR' },
      { status: 401, code: 'AI_PROVIDER_AUTH' },
      { status: 403, code: 'AI_PROVIDER_AUTH' },
      { status: 404, code: 'AI_MODEL_UNAVAILABLE' },
    ];
    for (const testCase of cases) {
      const { fetchImpl, calls } = fakeFetch([{ status: testCase.status, payload: { error: {} } }]);
      const advisor = createGeminiVisionAdvisor({
        apiKey: 'test-key',
        model: 'test-vision-model',
        retries: 3,
        fetchImpl,
      });
      await assert.rejects(advisor.suggest(input), (error: unknown) => {
        return error instanceof AiProviderError && error.code === testCase.code && !error.retryable;
      });
      assert.equal(calls.length, 1, `status ${testCase.status} must not be retried`);
    }
  });

  it('maps timeouts to a timeout code and stops at the total request budget', async () => {
    let calls = 0;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }) as typeof fetch;
    const timeoutAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      timeoutMs: 10,
      totalTimeoutMs: 1_000,
      retries: 0,
      fetchImpl,
    });

    await assert.rejects(timeoutAdvisor.suggest(input), (error: unknown) => {
      return (
        error instanceof AiProviderTimeoutError && toAiHttpError(error).code === 'AI_PROVIDER_TIMEOUT'
      );
    });
    assert.equal(calls, 1);

    const noTimeFetch = fakeFetch([{ status: 503, payload: {} }]);
    const budgetAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 2,
      fetchImpl: noTimeFetch.fetchImpl,
      totalTimeoutMs: 100,
      nowImpl: (() => {
        const times = [0, 0, 100];
        let index = 0;
        return () => times[Math.min(index++, times.length - 1)]!;
      })(),
      ...timingHooks(),
    });
    await assert.rejects(budgetAdvisor.suggest(input), AiProviderTimeoutError);
    assert.equal(noTimeFetch.calls.length, 1);
  });

  it('parses Retry-After and adds bounded jitter only when no header is present', () => {
    assert.equal(parseRetryAfterMs('2'), 2_000);
    assert.equal(parseRetryAfterMs(null), undefined);
    assert.equal(visionRetryDelayMs(1_500, 0, () => 0), 1_500);
    assert.equal(visionRetryDelayMs(undefined, 0, () => 0), 1_000);
    assert.equal(visionRetryDelayMs(undefined, 1, () => 0), 2_000);
    assert.equal(visionRetryDelayMs(undefined, 2, () => 0), 4_000);
    assert.equal(visionRetryDelayMs(undefined, 20, () => 0), 8_000);
  });

  it('does not send a request when the vision model or key is missing', async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const missingKey = createGeminiVisionAdvisor({ apiKey: '', model: 'test-vision-model', fetchImpl });
    const missingModel = createGeminiVisionAdvisor({ apiKey: 'test-key', model: '', fetchImpl });

    await assert.rejects(missingKey.suggest(input), AiNotConfiguredError);
    await assert.rejects(missingModel.suggest(input), AiNotConfiguredError);
    assert.equal(calls.length, 0);
  });
});
