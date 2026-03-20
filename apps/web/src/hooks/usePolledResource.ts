import { useEffect, useEffectEvent, useState } from 'react';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export type PolledResource<T> = {
  data: T | null;
  error: string | null;
  state: LoadState;
};

export const POLL_INTERVAL_MS = 15_000;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function resolvePollIntervalMs() {
  if (typeof window === 'undefined') {
    return POLL_INTERVAL_MS;
  }

  const override = (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__;
  return typeof override === 'number' && Number.isFinite(override) && override > 0 ? override : POLL_INTERVAL_MS;
}

export function usePolledResource<T>({
  enabled = true,
  load,
  onError,
  resourceKey
}: {
  enabled?: boolean;
  load: (signal: AbortSignal) => Promise<T>;
  onError?: (error: unknown) => void;
  resourceKey: string | null;
}): PolledResource<T> {
  const loadEvent = useEffectEvent(load);
  const errorEvent = useEffectEvent(onError || (() => {}));
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>(enabled ? 'loading' : 'idle');

  useEffect(() => {
    if (!enabled || !resourceKey) {
      setData(null);
      setError(null);
      setState('idle');
      return undefined;
    }

    let active = true;
    let currentRequestId = 0;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;
    let hasCommittedData = false;

    setData(null);
    setError(null);
    setState('loading');

    const scheduleNextPoll = () => {
      if (!active) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void loadResource();
      }, resolvePollIntervalMs());
    };

    const loadResource = async () => {
      const requestId = ++currentRequestId;
      const requestController = new AbortController();
      controller = requestController;

      if (!hasCommittedData) {
        setState('loading');
      }

      try {
        const nextData = await loadEvent(requestController.signal);
        if (!active || requestController.signal.aborted || requestId !== currentRequestId) {
          return;
        }

        hasCommittedData = true;
        setData(nextData);
        setError(null);
        setState('ready');
      } catch (nextError) {
        if (
          !active ||
          requestController.signal.aborted ||
          requestId !== currentRequestId ||
          isAbortError(nextError)
        ) {
          return;
        }

        errorEvent(nextError);
        setError(nextError instanceof Error ? nextError.message : 'unknown_error');
        setState(hasCommittedData ? 'ready' : 'error');
      } finally {
        if (controller === requestController) {
          controller = null;
        }
        scheduleNextPoll();
      }
    };

    void loadResource();

    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      controller?.abort();
    };
  }, [enabled, resourceKey]);

  return { data, error, state };
}
