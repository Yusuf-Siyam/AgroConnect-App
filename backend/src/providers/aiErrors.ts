/** Provider errors are translated to HTTP errors by the /api/ai router. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AI_PROVIDER_ERROR',
    public readonly retryable = false,
    public readonly retryAfterMs?: number,
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

/** Client-side image validation failures are never provider failures. */
export class AiInvalidImageError extends AiProviderError {
  constructor(message: string, code = 'INVALID_IMAGE_ASSET') {
    super(message, code, false);
    this.name = 'AiInvalidImageError';
  }
}

export function toAiHttpError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  if (error instanceof AiProviderError) {
    const statusCode = error.code === 'INVALID_IMAGE_DATA' ||
      error.code === 'INVALID_IMAGE_TYPE' ||
      error.code === 'INVALID_IMAGE_FORMAT' ||
      error.code === 'INVALID_IMAGE_ASSET' ||
      error.code === 'IMAGE_TOO_LARGE'
      ? 400
      : error.code === 'AI_RATE_LIMITED'
        ? 429
        : error.code === 'AI_PROVIDER_TIMEOUT'
          ? 504
          : error.code === 'AI_NOT_CONFIGURED' ||
              error.code === 'AI_PROVIDER_AUTH' ||
              error.code === 'AI_MODEL_UNAVAILABLE' ||
              error.code === 'AI_PROVIDER_UNAVAILABLE'
            ? 503
            : 502;
    return { statusCode, code: error.code, message: error.message };
  }

  return {
    statusCode: 502,
    code: 'AI_PROVIDER_ERROR',
    message: 'The AI provider could not complete this request. Please try again.',
  };
}
