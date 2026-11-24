import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiNotConfiguredError, AiProviderError, toAiHttpError } from './aiErrors';
import { createGeminiVisionAdvisor } from './geminiVision';
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

type FakeResponse = { status?: number; payload: unknown };
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
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function interactionPayload(advice: Record<string, unknown>): unknown {
  return { output_text: JSON.stringify(advice) };
}

const validAdvice = {
  observation: 'Some leaves look spotted',
  possibleCauses: ['Possible leaf spot', 'Possible water stress'],
  careSteps: ['Remove badly affected leaves', 'Improve airflow around the plant'],
  uncertainty: 'possible',
};

describe('Gemini vision plant-photo advisor', () => {
  it('sends inline image bytes, strict JSON response format and parses an unverified suggestion', async () => {
    const { fetchImpl, calls } = fakeFetch([{ payload: interactionPayload(validAdvice) }]);
    const advisor = createGeminiVisionAdvisor({ apiKey: 'test-key', model: 'test-vision-model', fetchImpl });

    const result = await advisor.suggest(input);

    assert.equal(result.source, 'gemini_vision');
    assert.equal(result.verified, false);
    assert.equal(result.uncertainty, 'possible');
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
  });

  it('rejects invalid JSON and strict-schema violations without inventing advice', async () => {
    const invalid = fakeFetch([
      { payload: { output_text: 'not json' } },
      { payload: { output_text: JSON.stringify({ ...validAdvice, unexpected: true }) } },
    ]);
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 0,
      fetchImpl: invalid.fetchImpl,
    });

    await assert.rejects(advisor.suggest(input), AiProviderError);
    await assert.rejects(advisor.suggest(input), (error: unknown) => {
      return error instanceof AiProviderError && /invalid suggestion/i.test(error.message);
    });
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

  it('retries once for a transient provider error but not for a bad request', async () => {
    const retry = fakeFetch([
      { status: 503, payload: {} },
      { payload: interactionPayload(validAdvice) },
    ]);
    const retryAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 1,
      fetchImpl: retry.fetchImpl,
    });
    const result = await retryAdvisor.suggest(input);
    assert.equal(result.source, 'gemini_vision');
    assert.equal(retry.calls.length, 2);

    const badRequest = fakeFetch([{ status: 400, payload: {} }]);
    const badAdvisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 1,
      fetchImpl: badRequest.fetchImpl,
    });
    await assert.rejects(badAdvisor.suggest(input), AiProviderError);
    assert.equal(badRequest.calls.length, 1);
  });

  it('maps a provider rate limit to a 429 without retrying', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 429, payload: {} }]);
    const advisor = createGeminiVisionAdvisor({
      apiKey: 'test-key',
      model: 'test-vision-model',
      retries: 1,
      fetchImpl,
    });

    await assert.rejects(advisor.suggest(input), (error: unknown) => {
      return (
        error instanceof AiProviderError &&
        error.code === 'AI_RATE_LIMITED' &&
        toAiHttpError(error).statusCode === 429
      );
    });
    assert.equal(calls.length, 1);
  });

  it('does not send a request when the vision model or key is missing', async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const advisor = createGeminiVisionAdvisor({ apiKey: '', model: 'test-vision-model', fetchImpl });
    await assert.rejects(advisor.suggest(input), AiNotConfiguredError);
    assert.equal(calls.length, 0);
  });
});
