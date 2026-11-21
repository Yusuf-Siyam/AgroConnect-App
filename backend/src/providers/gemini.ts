import { env } from '../config/env';
import type { AiLanguage, AiTextProvider, AiTextRequest } from '../types/ai';

import { AiNotConfiguredError, AiProviderError, AiProviderTimeoutError } from './aiErrors';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

const LANGUAGE_LABEL: Record<AiLanguage, string> = {
  bn: 'Bangla (Bengali)',
  en: 'English',
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

async function postWithTimeout(body: unknown, apiKey: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
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
      // Never include response bodies: they can contain request details.
      if (response.status >= 500) {
        throw new AiProviderError('The Gemini API is temporarily unavailable.', 'AI_PROVIDER_ERROR', true);
      }
      throw new AiProviderError('The Gemini API rejected this request.', 'AI_PROVIDER_ERROR', false);
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

  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText !== 'string' || outputText.trim() === '') {
    throw new AiProviderError('The Gemini API returned no usable text.');
  }

  return outputText.trim();
}

/**
 * The only file that talks to Gemini. The key and model are read from backend
 * environment variables; no model name or credential is embedded in the app.
 */
export function createGeminiTextProvider(): AiTextProvider {
  return {
    async generateText(request: AiTextRequest): Promise<string> {
      // Read at call time so configuration changes do not require a rebuild.
      const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
      const model = process.env.GEMINI_MODEL?.trim() ?? '';

      if (!apiKey || !model) {
        throw new AiNotConfiguredError(
          'AI assistant',
          'Set GEMINI_API_KEY and GEMINI_MODEL on the backend.',
        );
      }

      const body = {
        model,
        system_instruction: request.systemInstruction,
        input: buildInput(request),
        generation_config: { max_output_tokens: env.aiMaxOutputTokens },
      };

      const attempts = 1 + env.geminiRetries;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const payload = await postWithTimeout(body, apiKey, env.geminiRequestTimeoutMs);
          return extractText(payload);
        } catch (error) {
          const retryable =
            error instanceof AiProviderError && error.retryable;
          if (!retryable || attempt === attempts - 1) throw error;
        }
      }

      throw new AiProviderError('The Gemini assistant could not complete this request.');
    },
  };
}
