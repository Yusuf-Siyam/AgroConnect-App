/** Provider errors are translated to HTTP errors by the /api/ai router. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AI_PROVIDER_ERROR',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export class AiNotConfiguredError extends AiProviderError {
  constructor(feature: string, detail: string) {
    super(`${feature} is not configured. ${detail}`, 'AI_NOT_CONFIGURED', false);
    this.name = 'AiNotConfiguredError';
  }
}

export class AiProviderTimeoutError extends AiProviderError {
  constructor(feature: string) {
    super(`${feature} timed out. Please try again.`, 'AI_PROVIDER_TIMEOUT', true);
    this.name = 'AiProviderTimeoutError';
  }
}

export function toAiHttpError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  if (error instanceof AiProviderError) {
    const statusCode = error.code === 'AI_NOT_CONFIGURED' ? 503 : 502;
    return { statusCode, code: error.code, message: error.message };
  }

  return {
    statusCode: 502,
    code: 'AI_PROVIDER_ERROR',
    message: 'The AI provider could not complete this request. Please try again.',
  };
}
