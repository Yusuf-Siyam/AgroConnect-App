import { z } from 'zod';

/** For endpoints that intentionally accept no query parameters. */
export const emptyQuerySchema = z.object({}).strict();

export function validationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
}
