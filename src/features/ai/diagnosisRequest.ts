/**
 * One active diagnosis operation per screen. Repeated taps return the promise
 * already in flight instead of sending another request to the API.
 */
export type ExclusiveRunner<TResult> = {
  readonly busy: boolean;
  run(task: () => Promise<TResult>): Promise<TResult>;
};

export function createExclusiveRunner<TResult = void>(
  onBusyChange?: (busy: boolean) => void,
): ExclusiveRunner<TResult> {
  let active: Promise<TResult> | null = null;

  return {
    get busy(): boolean {
      return active !== null;
    },
    run(task: () => Promise<TResult>): Promise<TResult> {
      if (active) return active;

      const promise = Promise.resolve().then(task);
      active = promise;
      onBusyChange?.(true);
      const clear = () => {
        if (active !== promise) return;
        active = null;
        onBusyChange?.(false);
      };
      promise.then(clear, clear);
      return promise;
    },
  };
}
