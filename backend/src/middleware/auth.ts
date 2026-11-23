import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../config/firebase';
import { getOrCreateProfile, parseRole } from '../services/userProfile';
import type { AuthenticatedUser, Role } from '../types/auth';
import { HttpError } from './error';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function isRoleAllowed(actual: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(actual);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = parseBearerToken(req.header('authorization'));
    if (!token) {
      throw new HttpError(401, 'UNAUTHORIZED', 'A bearer ID token is required');
    }

    const decoded = await getFirebaseAdmin().auth.verifyIdToken(token);
    const claimRole = parseRole(decoded.role);
    const profile = await getOrCreateProfile(decoded.uid, claimRole);
    const role = claimRole ?? profile.role;

    if (!role) {
      throw new HttpError(403, 'FORBIDDEN', 'No role is assigned to this account');
    }

    req.auth = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      role,
      claims: decoded as unknown as Record<string, unknown>,
    };

    next();
  } catch (error) {
    if (error instanceof HttpError) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[auth] request rejected', {
          path: req.originalUrl,
          code: error.code,
          status: error.status,
          message: error.message,
        });
      }
      next(error);
      return;
    }

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'UNKNOWN')
        : 'UNKNOWN';
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] token verification failed', {
        path: req.originalUrl,
        code,
        message,
      });
    }
    // Never leak token-verification details to the client.
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired ID token'));
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication is required'));
      return;
    }

    if (!isRoleAllowed(req.auth.role, allowed)) {
      next(new HttpError(403, 'FORBIDDEN', 'This role is not allowed to perform the action'));
      return;
    }

    next();
  };
}
