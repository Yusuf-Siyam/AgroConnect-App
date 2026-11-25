import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiProviderError, AiProviderTimeoutError, toAiHttpError } from './aiErrors';
import { createGeminiTextProvider } from './gemini';
import type { AiTextRequest } from '../types/ai';

const API_KEY = 'test-gemini-key-1234567890';
const MODEL = 'test-text-model';

const request: AiTextRequest = {
  messages: [
    { role: 'user', text: 'What fertilizer should I use?', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  language: 'bn',
  systemInstruction: 'Reply only in Bangla (Bengali). Give safe farming advice.',
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

function generateContentText(text: string): unknown {
  return {
    candidates: [{ content: { parts: [{ text, thoughtSignature: 'test-signature' }] } }],
  };
}

function loggedText(value: unknown): string {
  return JSON.stringify(value);
}

describe('Gemini text provider', () => {
  it('posts the generateContent payload and parses candidate text', async () => {
    const { fetchImpl, calls } = fakeFetch([{ payload: generateContentText('Use compost.') }]);
    const provider = createGeminiTextProvider({ apiKey: API_KEY, model: MODEL, fetchImpl });

    const reply = await provider.generateText(request);

    assert.equal(reply, 'Use compost.');
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    );
    assert.equal(calls[0]!.init.method, 'POST');

    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers['x-goog-api-key'], API_KEY);
    assert.equal(headers['Content-Type'], 'application/json');

    const body = JSON.parse(String(calls[0]!.init.body)) as {
      system_instruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      generationConfig: { maxOutputTokens: number };
    };
    assert.equal(body.system_instruction.parts[0]!.text, request.systemInstruction);
    assert.equal(body.contents[0]!.role, 'user');
    assert.match(body.contents[0]!.parts[0]!.text, /Farmer: What fertilizer should I use\?/);
    assert.match(body.contents[0]!.parts[0]!.text, /Assistant \(reply only in Bangla \(Bengali\)\):/);
    assert.ok(body.generationConfig.maxOutputTokens > 0);
  });

  it('rejects a response with no candidate text', async () => {
    const { fetchImpl } = fakeFetch([{ payload: { candidates: [] } }]);
    const provider = createGeminiTextProvider({ apiKey: API_KEY, model: MODEL, fetchImpl });

    await assert.rejects(provider.generateText(request), (error: unknown) => {
      return error instanceof AiProviderError && /no usable text/i.test(error.message);
    });
  });

  it('logs sanitized upstream details and retries a 503 once', async () => {
    const { fetchImpl, calls } = fakeFetch([
      {
        status: 503,
        payload: {
          error: { code: 503, status: 'UNAVAILABLE', message: `Busy. key=${API_KEY} AIza1234567890123456` },
        },
      },
      { payload: generateContentText('OK') },
    ]);
    const provider = createGeminiTextProvider({ apiKey: API_KEY, model: MODEL, retries: 1, fetchImpl });
    const originalError = console.error;
    const logs: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      assert.equal(await provider.generateText(request), 'OK');
    } finally {
      console.error = originalError;
    }

    assert.equal(calls.length, 2);
    const serialized = logs.map(loggedText).join('\n');
    assert.match(serialized, /"status":503/);
    assert.match(serialized, /"upstreamCode":"503"/);
    assert.match(serialized, /UNAVAILABLE/);
    assert.doesNotMatch(serialized, /test-gemini-key-1234567890/);
    assert.doesNotMatch(serialized, /AIza1234567890123456/);
  });

  it('maps an unavailable model to a safe, actionable error without retrying', async () => {
    const { fetchImpl, calls } = fakeFetch([
      {
        status: 404,
        payload: {
          error: { code: 404, status: 'NOT_FOUND', message: 'This model is no longer available to new users.' },
        },
      },
    ]);
    const provider = createGeminiTextProvider({ apiKey: API_KEY, model: MODEL, retries: 1, fetchImpl });

    await assert.rejects(provider.generateText(request), (error: unknown) => {
      return (
        error instanceof AiProviderError &&
        error.code === 'AI_MODEL_UNAVAILABLE' &&
        toAiHttpError(error).statusCode === 503
      );
    });
    assert.equal(calls.length, 1);
  });

  it('maps an upstream rate limit to the dedicated 429 error', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 429, payload: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota' } } },
    ]);
    const provider = createGeminiTextProvider({ apiKey: API_KEY, model: MODEL, retries: 1, fetchImpl });

    await assert.rejects(provider.generateText(request), (error: unknown) => {
      return (
        error instanceof AiProviderError &&
        error.code === 'AI_RATE_LIMITED' &&
        toAiHttpError(error).statusCode === 429
      );
    });
    assert.equal(calls.length, 1);
  });

  it('maps a network timeout to a retryable timeout error', async () => {
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const provider = createGeminiTextProvider({
      apiKey: API_KEY,
      model: MODEL,
      retries: 0,
      timeoutMs: 10,
      fetchImpl,
    });

    await assert.rejects(provider.generateText(request), AiProviderTimeoutError);
  });

  it('does not send a request when the key or model is missing', async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const provider = createGeminiTextProvider({ apiKey: '', model: MODEL, fetchImpl });

    await assert.rejects(provider.generateText(request), /not configured/i);
    assert.equal(calls.length, 0);
  });
});
