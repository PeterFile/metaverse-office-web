import { EventEmitter } from 'node:events';
import http from 'node:http';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  BROWSER_SMOKE_FRONTEND_READY_PATH,
  BROWSER_SMOKE_PROXY_READY_PATH,
  extractOrigin,
  launchManagedServer,
  parseBrowserSmokeArgs,
  resolveBrowserSmokeFrontendReadyPath,
  resolveBrowserSmokePlaywrightEnv,
  resolveBrowserSmokeRunMode,
  resolveFrontendServerArgs,
  resolvePlaywrightArgs,
  stopManagedServer,
  waitForChildExit,
  waitForHttpReady,
  waitForServerOrigin
} from './run-browser-smoke.mjs';

describe('run-browser-smoke helpers', () => {
  it('keeps explicit fixed-port runs on the managed hermetic path so preview-mode smoke semantics stay consistent', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4321',
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'preview',
      backendPort: 4321,
      devServerPort: 5432
    });
  });

  it('still honors an explicit dev frontend mode when both backend and frontend ports are pinned', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4321',
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432',
        BROWSER_SMOKE_FRONTEND_MODE: 'dev'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'dev',
      backendPort: 4321,
      devServerPort: 5432
    });
  });

  it('rejects duplicate backend and frontend ports on the managed hermetic path before spawning either server', () => {
    expect(() =>
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4173',
        BROWSER_SMOKE_DEV_SERVER_PORT: '4173'
      })
    ).toThrow(/must differ/);
  });

  it('keeps a backend-only port pin on the managed hermetic path while leaving frontend port selection unpinned', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_BACKEND_PORT: '4321'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'preview',
      backendPort: 4321
    });
  });

  it('keeps a dev-server-only port pin on the managed hermetic path while leaving backend port selection unpinned', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_DEV_SERVER_PORT: '5432'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'preview',
      devServerPort: 5432
    });
  });

  it('allows a single pinned port to reuse the other side\'s historical default because the unpinned side still auto-selects at launch', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_DEV_SERVER_PORT: '3210'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'preview',
      devServerPort: 3210
    });
  });

  it('reuses a caller-supplied proxy target instead of forcing the hermetic backend', () => {
    expect(
      resolveBrowserSmokeRunMode({
        VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:3000'
      })
    ).toEqual({
      type: 'managed-frontend',
      frontendMode: 'preview',
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
      frontendMode: 'preview',
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
      frontendMode: 'preview',
      proxyTarget: 'http://127.0.0.1:3000'
    });
  });

  it('falls back to the hermetic backend with a preview frontend when no explicit target is provided', () => {
    expect(resolveBrowserSmokeRunMode({})).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'preview'
    });
  });

  it('lets callers force the faster Vite dev frontend when preview realism is unnecessary', () => {
    expect(
      resolveBrowserSmokeRunMode({
        BROWSER_SMOKE_FRONTEND_MODE: 'dev'
      })
    ).toEqual({
      type: 'managed-hermetic',
      frontendMode: 'dev'
    });
  });

  it('parses a frontend-mode CLI override without swallowing forwarded Playwright args', () => {
    expect(parseBrowserSmokeArgs(['--frontend-mode=dev', '--', '--headed', '--grep', 'pinch handoff'])).toEqual({
      frontendMode: 'dev',
      playwrightArgs: ['--headed', '--grep', 'pinch handoff']
    });
  });

  it('strictly pins explicit dev frontend ports instead of allowing Vite to silently increment them', () => {
    expect(resolveFrontendServerArgs({ frontendMode: 'dev', devServerPort: 5432 })).toEqual([
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      '5432',
      '--strictPort'
    ]);
  });

  it('keeps unpinned dev frontend runs flexible so Vite can auto-select a free port', () => {
    expect(resolveFrontendServerArgs({ frontendMode: 'dev' })).toEqual([
      'exec',
      'vite',
      '--host',
      '127.0.0.1'
    ]);
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

  it('threads the inspectable backend origin into Playwright only when the smoke target exposes request logs', () => {
    expect(
      resolveBrowserSmokePlaywrightEnv('http://127.0.0.1:4173', 'http://127.0.0.1:3210')
    ).toEqual({
      BROWSER_SMOKE_BASE_URL: 'http://127.0.0.1:4173',
      BROWSER_SMOKE_BACKEND_ORIGIN: 'http://127.0.0.1:3210'
    });

    expect(resolveBrowserSmokePlaywrightEnv('http://127.0.0.1:4173')).toEqual({
      BROWSER_SMOKE_BASE_URL: 'http://127.0.0.1:4173',
      BROWSER_SMOKE_BACKEND_ORIGIN: ''
    });
  });

  it('uses different frontend readiness paths for hermetic versus external-backend smoke runs', () => {
    expect(BROWSER_SMOKE_FRONTEND_READY_PATH).toBe('/');
    expect(BROWSER_SMOKE_PROXY_READY_PATH).toBe('/office/overview');
    expect(resolveBrowserSmokeFrontendReadyPath('http://127.0.0.1:3210')).toBe('/');
    expect(resolveBrowserSmokeFrontendReadyPath()).toBe('/office/overview');
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

    expect(
      extractOrigin(
        '  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://127.0.0.1:\u001b[1m45680\u001b[22m/\u001b[39m',
        'Local:'
      )
    ).toBe('http://127.0.0.1:45680');
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
      waitForUrlPath: BROWSER_SMOKE_FRONTEND_READY_PATH,
      waitForReady: async (url) => {
        seenUrls.push(url);
      }
    });

    stdout.write('  ➜  Local:   http://127.0.0.1:45681/\n');

    await expect(ready).resolves.toBe('http://127.0.0.1:45681');
    expect(seenUrls).toEqual([`http://127.0.0.1:45681${BROWSER_SMOKE_FRONTEND_READY_PATH}`]);
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

  it('retries readiness probes when the first HTTP request connects but never returns a response', async () => {
    let requestCount = 0;
    const sockets = new Set();
    const server = http.createServer((req, res) => {
      requestCount += 1;
      sockets.add(req.socket);
      req.socket.on('close', () => sockets.delete(req.socket));

      if (requestCount === 1) {
        return;
      }

      res.statusCode = 200;
      res.end('ready');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to bind test server');
    }

    try {
      await expect(waitForHttpReady(`http://127.0.0.1:${address.port}/`, 1_000, 100)).resolves.toBeUndefined();
      expect(requestCount).toBeGreaterThanOrEqual(2);
    } finally {
      for (const socket of sockets) {
        socket.destroy();
      }
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
        waitForUrlPath: BROWSER_SMOKE_FRONTEND_READY_PATH,
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
