import { EventEmitter } from 'node:events';
import http from 'node:http';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  extractOrigin,
  launchManagedServer,
  resolveBrowserSmokeRunMode,
  resolvePlaywrightArgs,
  stopManagedServer,
  waitForChildExit,
  waitForHttpReady,
  waitForServerOrigin
} from './run-browser-smoke.mjs';

describe('run-browser-smoke helpers', () => {
  it('keeps explicit fixed-port runs on the direct Playwright path when both overrides are set', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4321',
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432'
      })
    ).toEqual({
      type: 'fixed-ports',
      backendPort: 4321,
      devServerPort: 5432
    });
  });

  it('keeps a backend-only port pin on the managed hermetic path so the frontend can still auto-select a free port', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4321'
      })
    ).toEqual({
      type: 'managed-hermetic',
      backendPort: 4321
    });
  });

  it('keeps a dev-server-only port pin on the managed hermetic path so the backend can still auto-select a free port', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432'
      })
    ).toEqual({
      type: 'managed-hermetic',
      devServerPort: 5432
    });
  });

  it('reuses a caller-supplied proxy target instead of forcing the hermetic backend', () => {
    expect(
      resolveBrowserSmokeRunMode({
        VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:3000'
      })
    ).toEqual({
      type: 'managed-frontend',
      proxyTarget: 'http://127.0.0.1:3000'
    });
  });

  it('keeps a dev-server pin with a caller-supplied proxy target without forcing fixed backend ports', () => {
    expect(
      resolveBrowserSmokeRunMode({
        VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:3000',
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432'
      })
    ).toEqual({
      type: 'managed-frontend',
      proxyTarget: 'http://127.0.0.1:3000',
      devServerPort: 5432
    });
  });

  it('ignores hermetic-backend port pins when a caller already supplies the backend proxy target', () => {
    expect(
      resolveBrowserSmokeRunMode({
        VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:3000',
        BROWSER_SMOKE_BACKEND_PORT: '4321'
      })
    ).toEqual({
      type: 'managed-frontend',
      proxyTarget: 'http://127.0.0.1:3000'
    });
  });

  it('falls back to the hermetic backend only when no explicit target is provided', () => {
    expect(resolveBrowserSmokeRunMode({})).toEqual({
      type: 'managed-hermetic'
    });
  });

  it('forwards extra Playwright CLI args through the wrapper after pnpm\'s separator', () => {
    expect(resolvePlaywrightArgs(['--', '--headed', '--grep', 'pinch handoff'])).toEqual([
      'exec',
      'playwright',
      'test',
      'e2e/operator-shell.keyboard.smoke.spec.ts',
      '--config',
      'playwright.config.ts',
      '--headed',
      '--grep',
      'pinch handoff'
    ]);
  });

  it('extracts localhost origins from backend and Vite readiness output', () => {
    expect(
      extractOrigin(
        'browser smoke backend listening on http://127.0.0.1:45678\nstore: /tmp/browser-smoke',
        'browser smoke backend listening on '
      )
    ).toBe('http://127.0.0.1:45678');

    expect(
      extractOrigin(
        [
          '  VITE v7.3.1 ready in 333 ms',
          '',
          '  ➜  Local:   http://127.0.0.1:45679/'
        ].join('\n'),
        'Local:'
      )
    ).toBe('http://127.0.0.1:45679');
  });

  it('waits for child exit success and rejects non-zero exits', async () => {
    const successChild = new EventEmitter() as EventEmitter & { killed?: boolean };
    const successPromise = waitForChildExit(successChild as any);
    successChild.emit('exit', 0, null);
    await expect(successPromise).resolves.toBeUndefined();

    const failureChild = new EventEmitter() as EventEmitter & { killed?: boolean };
    const failurePromise = waitForChildExit(failureChild as any);
    failureChild.emit('exit', 1, null);
    await expect(failurePromise).rejects.toThrow(/code 1/);
  });

  it('resolves server origin from readiness logs and waits for the HTTP path', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.stdout = stdout;
    child.stderr = stderr;

    const seenUrls: string[] = [];
    const ready = waitForServerOrigin({
      child: child as any,
      readyPrefix: 'Local:',
      waitForUrlPath: '/',
      waitForReady: async (url) => {
        seenUrls.push(url);
      }
    });

    stdout.write('  ➜  Local:   http://127.0.0.1:45681/\n');

    await expect(ready).resolves.toBe('http://127.0.0.1:45681');
    expect(seenUrls).toEqual(['http://127.0.0.1:45681/']);
  });

  it('requires a successful readiness probe instead of accepting 4xx responses', async () => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end('not ready');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to bind test server');
    }

    try {
      await expect(waitForHttpReady(`http://127.0.0.1:${address.port}/`, 300)).rejects.toThrow(/Unexpected status 404/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('stops a managed server if readiness fails after spawn', async () => {
    const killedSignals: string[] = [];
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      exitCode: number | null;
      signalCode: string | null;
      kill: (signal?: string) => boolean;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal = 'SIGTERM') => {
      killedSignals.push(signal);
      child.signalCode = signal;
      queueMicrotask(() => child.emit('exit', 0, signal));
      return true;
    };

    await expect(
      launchManagedServer({
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10_000)'],
        env: process.env,
        waitForUrlPath: '/',
        readyPrefix: 'Local:',
        spawnProcess: () => {
          queueMicrotask(() => {
            child.stdout.write('  ➜  Local:   http://127.0.0.1:45681/\n');
          });
          return child as any;
        },
        waitForReady: async () => {
          throw new Error('backend never became ready');
        }
      })
    ).rejects.toThrow(/backend never became ready/);

    expect(killedSignals).toEqual(['SIGTERM']);
  });

  it('allows callers to choose the shutdown signal for managed servers', async () => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: string | null;
      kill: (signal?: string) => boolean;
    };
    child.exitCode = null;
    child.signalCode = null;
    const signals: string[] = [];
    child.kill = (signal = 'SIGTERM') => {
      signals.push(signal);
      child.signalCode = signal;
      queueMicrotask(() => child.emit('exit', 0, signal));
      return true;
    };

    await stopManagedServer(child as any, 'SIGINT');
    expect(signals).toEqual(['SIGINT']);
  });

  it('resolves shutdown immediately for children that already exited by signal', async () => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: string | null;
      kill: (signal?: string) => boolean;
    };
    child.exitCode = null;
    child.signalCode = 'SIGTERM';
    const signals: string[] = [];
    child.kill = (signal = 'SIGTERM') => {
      signals.push(signal);
      return true;
    };

    await expect(stopManagedServer(child as any, 'SIGINT')).resolves.toBeUndefined();
    expect(signals).toEqual([]);
  });
});
