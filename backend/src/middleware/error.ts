import type { NextFunction, Request, Response } from 'express';

import type { ErrorResponse } from '../types/api';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };
  res.status(404).json(body);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    const body: ErrorResponse = { error: { code: err.code, message: err.message } };
    res.status(err.statusCode).json(body);
    return;
  }

  console.error(err);
  const body: ErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
  res.status(500).json(body);
}
