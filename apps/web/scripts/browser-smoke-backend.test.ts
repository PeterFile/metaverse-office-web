import { describe, expect, it, vi } from 'vitest';

import { applyBrowserSmokeCors, isLoopbackOrigin, readScenarioRequestContext } from './browser-smoke-backend.mjs';

function createResponseRecorder() {
  const headers = new Map<string, string>();

  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    writeHead: vi.fn(),
    end: vi.fn()
  };
}

describe('browser smoke backend preview-mode CORS', () => {
  it('allows loopback GET origins to reuse the hermetic backend from Vite preview', () => {
    const res = createResponseRecorder();

    const handled = applyBrowserSmokeCors(
      {
        method: 'GET',
        headers: {
          origin: 'http://127.0.0.1:4173'
        }
      } as any,
      res as any
    );

    expect(handled).toBe(false);
    expect(res.headers.get('vary')).toBe('Origin');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4173');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('answers loopback GET preflights with the existing read-only CORS contract', () => {
    const res = createResponseRecorder();

    const handled = applyBrowserSmokeCors(
      {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:4173',
          'access-control-request-method': 'GET'
        }
      } as any,
      res as any
    );

    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('rejects non-GET preflights even for loopback origins', () => {
    const res = createResponseRecorder();

    const handled = applyBrowserSmokeCors(
      {
        method: 'OPTIONS',
        headers: {
          origin: 'http://127.0.0.1:4173',
          'access-control-request-method': 'POST'
        }
      } as any,
      res as any
    );

    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('ignores non-loopback origins', () => {
    const res = createResponseRecorder();

    const handled = applyBrowserSmokeCors(
      {
        method: 'GET',
        headers: {
          origin: 'https://example.com'
        }
      } as any,
      res as any
    );

    expect(handled).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('isLoopbackOrigin', () => {
  it('accepts localhost and 127.0.0.1 origins only', () => {
    expect(isLoopbackOrigin('http://localhost:4173')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1:4173')).toBe(true);
    expect(isLoopbackOrigin('https://example.com')).toBe(false);
    expect(isLoopbackOrigin('not a url')).toBe(false);
    expect(isLoopbackOrigin(null)).toBe(false);
  });
});

describe('readScenarioRequestContext', () => {
  it('reads scenario identity from browser-smoke cookies', () => {
    expect(
      readScenarioRequestContext(
        new URL('http://127.0.0.1:3210/office/overview?browser_smoke_mode=degraded-refresh&browser_smoke_run=run-123'),
        'browser_smoke_mode=stale-selection-404; browser_smoke_run=run-456'
      )
    ).toEqual({
      scenario: 'stale-selection-404',
      runId: 'run-456'
    });
  });

  it('ignores query params and falls back to the default run when cookies are absent', () => {
    expect(
      readScenarioRequestContext(
        new URL('http://127.0.0.1:3210/office/overview?browser_smoke_mode=degraded-refresh&browser_smoke_run=run-123'),
        undefined
      )
    ).toEqual({
      scenario: undefined,
      runId: 'default'
    });
  });
});