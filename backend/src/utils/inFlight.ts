/**
 * Coalesces concurrent operations with the same key. Used only as an
 * in-process guard; Firestore's deterministic diagnosis ID remains the
 * durable duplicate check.
 */
export class InFlightMap<T> {
  private readonly pending = new Map<string, Promise<T>>();

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    const promise = Promise.resolve().then(operation);
    this.pending.set(key, promise);
    const clear = () => {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  get size(): number {
    return this.pending.size;
  }
}
