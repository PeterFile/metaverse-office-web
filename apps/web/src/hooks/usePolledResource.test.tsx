import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePolledResource } from './usePolledResource';

function HookProbe<T>({
  enabled = true,
  load,
  onError,
  resourceKey,
}: {
  enabled?: boolean;
  load: (signal: AbortSignal) => Promise<T>;
  onError?: (error: unknown) => void;
  resourceKey: string | null;
}) {
  const resource = usePolledResource({ enabled, load, onError, resourceKey });

  return (
    <>
      <div data-testid="state">{resource.state}</div>
      <div data-testid="error">{resource.error ?? 'null'}</div>
      <div data-testid="data">{resource.data === null ? 'null' : JSON.stringify(resource.data)}</div>
    </>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  delete (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__;
});

describe('usePolledResource', () => {
  it('surfaces an error on the first failed load', async () => {
    const onError = vi.fn();
    const load = vi.fn().mockRejectedValue(new Error('initial load failed'));

    render(<HookProbe load={load} onError={onError} resourceKey="alpha" />);

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('error');
    });

    expect(screen.getByTestId('error')).toHaveTextContent('initial load failed');
    expect(screen.getByTestId('data')).toHaveTextContent('null');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it(
    'keeps the last good data while exposing a later refresh failure',
    async () => {
      (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 50;

      const onError = vi.fn();
      const refreshDeferred = createDeferred<{ value: string }>();
      const load = vi.fn((signal: AbortSignal) => {
        const callIndex = load.mock.calls.length;
        if (callIndex === 1) {
          return Promise.resolve({ value: 'stable-snapshot' });
        }
        if (callIndex === 2) {
          signal.addEventListener('abort', () => {
            refreshDeferred.reject(new DOMException('Aborted', 'AbortError'));
          });
          return refreshDeferred.promise;
        }

        return Promise.resolve({ value: 'unexpected-extra-poll' });
      });

      render(<HookProbe load={load} onError={onError} resourceKey="alpha" />);

      await waitFor(() => {
        expect(screen.getByTestId('state')).toHaveTextContent('ready');
      });
      expect(screen.getByTestId('data')).toHaveTextContent('{"value":"stable-snapshot"}');
      expect(screen.getByTestId('error')).toHaveTextContent('null');

      await waitFor(
        () => {
          expect(load).toHaveBeenCalledTimes(2);
        },
        { timeout: 1000 }
      );

      refreshDeferred.reject(new Error('refresh failed'));

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('refresh failed');
      });
      expect(screen.getByTestId('state')).toHaveTextContent('ready');
      expect(screen.getByTestId('data')).toHaveTextContent('{"value":"stable-snapshot"}');
      expect(onError).toHaveBeenCalledTimes(1);
    },
    10000
  );

  it('clears stale data immediately when the resource key changes', async () => {
    const betaDeferred = createDeferred<{ scope: string }>();
    const load = vi.fn((signal: AbortSignal) => {
      if (signal.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }

      const callIndex = load.mock.calls.length;
      if (callIndex === 1) {
        return Promise.resolve({ scope: 'alpha' });
      }

      return betaDeferred.promise;
    });

    const view = render(<HookProbe load={load} resourceKey="alpha" />);

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('ready');
    });
    expect(screen.getByTestId('data')).toHaveTextContent('{"scope":"alpha"}');

    view.rerender(<HookProbe load={load} resourceKey="beta" />);

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('loading');
    });
    expect(screen.getByTestId('data')).toHaveTextContent('null');
    expect(screen.getByTestId('error')).toHaveTextContent('null');

    betaDeferred.resolve({ scope: 'beta' });

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('{"scope":"beta"}');
    });
    expect(screen.getByTestId('state')).toHaveTextContent('ready');
  });

  it('treats disabled aborts as idle transitions without fake errors', async () => {
    const onError = vi.fn();
    const load = vi.fn((signal: AbortSignal) => {
      const pending = createDeferred<{ scope: string }>();
      signal.addEventListener('abort', () => {
        pending.reject(new DOMException('Aborted', 'AbortError'));
      });
      return pending.promise;
    });

    const view = render(<HookProbe load={load} onError={onError} resourceKey="alpha" />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });

    view.rerender(<HookProbe enabled={false} load={load} onError={onError} resourceKey="alpha" />);

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('idle');
    });
    expect(screen.getByTestId('error')).toHaveTextContent('null');
    expect(screen.getByTestId('data')).toHaveTextContent('null');
    expect(onError).not.toHaveBeenCalled();
  });
});
