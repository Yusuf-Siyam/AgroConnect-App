const RETURN_PATH_KEY = 'agroconnect.returnTo';

let inMemoryReturnPath: string | null = null;

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (typeof globalThis === 'undefined') return null;
  const candidate = (globalThis as { sessionStorage?: Storage }).sessionStorage;
  return candidate ?? null;
}

export function isSafeReturnPath(path?: string | null): boolean {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'));
}

export function rememberReturnPath(path?: string | null): void {
  const safe = typeof path === 'string' && isSafeReturnPath(path) ? path : null;
  inMemoryReturnPath = safe;
  try {
    const store = storage();
    if (!store) return;
    if (safe) store.setItem(RETURN_PATH_KEY, safe);
    else store.removeItem(RETURN_PATH_KEY);
  } catch {
    // Private browsing and restricted web views can deny storage access.
  }
}

export function readReturnPath(): string | null {
  try {
    const stored = storage()?.getItem(RETURN_PATH_KEY) ?? null;
    if (isSafeReturnPath(stored)) return stored;
  } catch {
    // Fall through to the in-memory value.
  }
  return isSafeReturnPath(inMemoryReturnPath) ? inMemoryReturnPath : null;
}

export function consumeReturnPath(): string | null {
  const path = readReturnPath();
  inMemoryReturnPath = null;
  try {
    storage()?.removeItem(RETURN_PATH_KEY);
  } catch {
    // Nothing else to clean up when storage is unavailable.
  }
  return path;
}
