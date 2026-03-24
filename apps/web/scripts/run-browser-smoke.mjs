import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDistinctBrowserSmokePorts,
  BROWSER_SMOKE_BACKEND_ORIGIN_ENV,
  BROWSER_SMOKE_BACKEND_PORT_ENV,
  BROWSER_SMOKE_BASE_URL_ENV,
  BROWSER_SMOKE_DEV_SERVER_PORT_ENV,
  BROWSER_SMOKE_FRONTEND_MODE_ENV,
  readBrowserSmokePortOverride,
  resolveBrowserSmokeFrontendMode
} from './browser-smoke-ports.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const defaultPlaywrightArgs = [
  'exec',
  'playwright',
  'test',
  'e2e/operator-shell.keyboard.smoke.spec.ts',
  '--config',
  'playwright.config.ts'
];
export const BROWSER_SMOKE_FRONTEND_READY_PATH = '/';
export const BROWSER_SMOKE_PROXY_READY_PATH = '/office/overview';

export function resolvePlaywrightArgs(extraArgs = process.argv.slice(2)) {
  const forwardedArgs = extraArgs[0] === '--' ? extraArgs.slice(1) : extraArgs;
  return [...defaultPlaywrightArgs, ...forwardedArgs];
}

export async function main(cliArgs = process.argv.slice(2)) {
  const { frontendMode, playwrightArgs } = parseBrowserSmokeArgs(cliArgs);
  const mode = resolveBrowserSmokeRunMode(
    frontendMode ? { ...process.env, BROWSER_SMOKE_FRONTEND_MODE: frontendMode } : process.env
  );

  if (mode.type === 'managed-frontend') {
    const inspectableBackendOrigin = await detectInspectableBrowserSmokeBackendOrigin(mode.proxyTarget);
    await runManagedFrontendSmoke(mode.proxyTarget, {
      devServerPort: mode.devServerPort,
      frontendMode: mode.frontendMode,
      inspectableBackendOrigin,
      playwrightArgs
    });
    return;
  }

  const backend = await launchManagedServer({
    command: 'node',
    args: ['./scripts/browser-smoke-backend.mjs'],
    env: {
      ...process.env,
      PORT: String(mode.backendPort ?? 0)
    },
    waitForUrlPath: '/health',
    readyPrefix: 'browser smoke backend listening on '
  });

  try {
    await runManagedFrontendSmoke(backend.origin, {
      devServerPort: mode.devServerPort,
      frontendMode: mode.frontendMode,
      inspectableBackendOrigin: backend.origin,
      playwrightArgs
    });
  } finally {
    await stopManagedServer(backend.child);
  }
}

export function resolveBrowserSmokeRunMode(env = process.env) {
  const explicitBackendPort = readBrowserSmokePortOverride(BROWSER_SMOKE_BACKEND_PORT_ENV, env);
  const explicitDevServerPort = readBrowserSmokePortOverride(BROWSER_SMOKE_DEV_SERVER_PORT_ENV, env);
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim();
  const frontendMode = resolveBrowserSmokeFrontendMode(env);

  if (proxyTarget) {
    return {
      type: 'managed-frontend',
      frontendMode,
      proxyTarget,
      ...(explicitDevServerPort !== null ? { devServerPort: explicitDevServerPort } : {})
    };
  }

  if (explicitBackendPort !== null && explicitDevServerPort !== null) {
    assertDistinctBrowserSmokePorts(explicitBackendPort, explicitDevServerPort);
  }

  return {
    type: 'managed-hermetic',
    frontendMode,
    ...(explicitBackendPort !== null ? { backendPort: explicitBackendPort } : {}),
    ...(explicitDevServerPort !== null ? { devServerPort: explicitDevServerPort } : {})
  };
}

export function parseBrowserSmokeArgs(args = []) {
  const forwardedArgs = [...args];
  let frontendMode = null;

  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];
    if (arg === '--') {
      break;
    }

    if (arg.startsWith('--frontend-mode=')) {
      frontendMode = arg.slice('--frontend-mode='.length);
      forwardedArgs.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === '--frontend-mode') {
      const nextValue = forwardedArgs[index + 1];
      if (!nextValue || nextValue === '--') {
        throw new Error('--frontend-mode requires a value of "preview" or "dev"');
      }
      frontendMode = nextValue;
      forwardedArgs.splice(index, 2);
      index -= 1;
    }
  }

  if (frontendMode) {
    resolveBrowserSmokeFrontendMode({ [BROWSER_SMOKE_FRONTEND_MODE_ENV]: frontendMode });
  }

  const playwrightArgs = forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;

  return {
    frontendMode,
    playwrightArgs
  };
}

export function resolveFrontendServerArgs({ frontendMode = 'preview', devServerPort } = {}) {
  if (frontendMode === 'dev') {
    const args = ['exec', 'vite', '--host', '127.0.0.1'];
    if (typeof devServerPort === 'number') {
      args.push('--port', String(devServerPort), '--strictPort');
    }
    return args;
  }

  return [
    'exec',
    'vite',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(devServerPort ?? 0),
    '--strictPort'
  ];
}

async function runManagedFrontendSmoke(
  proxyTarget,
  options = {}
) {
  const frontendMode = options.frontendMode ?? 'preview';
  const usePreview = frontendMode !== 'dev';
  const frontendEnv = {
    ...process.env,
    VITE_DEV_PROXY_TARGET: proxyTarget
  };

  if (usePreview) {
    await runForegroundCommand(['exec', 'vite', 'build'], frontendEnv);
  }

  const frontend = await launchManagedServer({
    command: resolvePnpmCommand(),
    args: resolveFrontendServerArgs({ frontendMode, devServerPort: options.devServerPort }),
    env: frontendEnv,
    waitForUrlPath: resolveBrowserSmokeFrontendReadyPath(options.inspectableBackendOrigin ?? null),
    readyPrefix: 'Local:'
  });

  try {
    await runPlaywright({
      env: resolveBrowserSmokePlaywrightEnv(frontend.origin, options.inspectableBackendOrigin ?? null),
      summary: `browser smoke origins backend=${proxyTarget} web=${frontend.origin}`,
      args: resolvePlaywrightArgs(options.playwrightArgs)
    });
  } finally {
    await stopManagedServer(frontend.child);
  }
}

export function resolveBrowserSmokePlaywrightEnv(frontendOrigin, inspectableBackendOrigin = null) {
  return {
    [BROWSER_SMOKE_BASE_URL_ENV]: frontendOrigin,
    [BROWSER_SMOKE_BACKEND_ORIGIN_ENV]: inspectableBackendOrigin ?? ''
  };
}

export async function detectInspectableBrowserSmokeBackendOrigin(candidateOrigin) {
  const origin = candidateOrigin?.trim().replace(/\/+$/, '');
  if (!origin) {
    return null;
  }

  const requestLogUrl = `${origin}/__browser-smoke__/requests`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);

    try {
      const response = await fetch(requestLogUrl, {
        method: 'GET',
        signal: controller.signal
      });
      return response.ok ? origin : null;
    } catch {
      if (attempt === 1) {
        return null;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export function resolveBrowserSmokeFrontendReadyPath(inspectableBackendOrigin = null) {
  return inspectableBackendOrigin ? BROWSER_SMOKE_FRONTEND_READY_PATH : BROWSER_SMOKE_PROXY_READY_PATH;
}

async function runPlaywright({ env, summary, args = resolvePlaywrightArgs() }) {
  process.stdout.write(`${summary}\n`);

  const child = spawn(resolvePnpmCommand(), args, {
    cwd: appRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env
    }
  });

  await waitForChildExit(child);
}

export function waitForChildExit(child) {
  return new Promise((resolve, reject) => {
    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    const cleanup = () => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
    };

    child.on('error', (error) => {
      cleanup();
      reject(error);
    });

    child.on('exit', (code, signal) => {
      cleanup();
      if (signal) {
        reject(new Error(`Process exited from signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

export function runForegroundCommand(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePnpmCommand(), args, {
      cwd: appRoot,
      stdio: 'inherit',
      env
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Process exited from signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

export async function launchManagedServer({
  command,
  args,
  env,
  waitForUrlPath,
  readyPrefix,
  spawnProcess = spawn,
  waitForReady
}) {
  const child = spawnProcess(command, args, {
    cwd: appRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const origin = await waitForServerOrigin({
      child,
      readyPrefix,
      waitForUrlPath,
      ...(waitForReady ? { waitForReady } : {})
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    return { child, origin };
  } catch (error) {
    await stopManagedServer(child);
    throw error;
  }
}

export function waitForServerOrigin({
  child,
  readyPrefix,
  waitForUrlPath,
  timeoutMs = 120_000,
  waitForReady = waitForHttpReady
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
      callback();
    };

    const onStdout = (chunk) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      const origin = extractOrigin(stdoutBuffer, readyPrefix);
      if (!origin) {
        return;
      }

      waitForReady(`${origin}${waitForUrlPath}`)
        .then(() => finish(() => resolve(origin)))
        .catch((error) => finish(() => reject(error)));
    };

    const onStderr = (chunk) => {
      stderrBuffer += chunk.toString();
    };

    const onExit = (code, signal) => {
      finish(() => {
        reject(
          new Error(
            `Managed server exited before becoming ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n${stderrBuffer || stdoutBuffer}`
          )
        );
      });
    };

    const onError = (error) => {
      finish(() => reject(error));
    };

    const timeoutId = setTimeout(() => {
      finish(() => {
        reject(new Error(`Timed out waiting for managed server readiness\n${stderrBuffer || stdoutBuffer}`));
      });
    }, timeoutMs);

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

export function extractOrigin(output, readyPrefix) {
  const lines = output.split(/\r?\n/).reverse();
  for (const rawLine of lines) {
    const line = stripAnsi(rawLine);
    const prefixIndex = line.indexOf(readyPrefix);
    if (prefixIndex === -1) {
      continue;
    }

    const match = line.slice(prefixIndex + readyPrefix.length).match(/https?:\/\/127\.0\.0\.1:\d+/);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

export async function waitForHttpReady(url, timeoutMs = 120_000, requestTimeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const status = await requestStatus(url, requestTimeoutMs);
      if (status >= 200 && status < 400) {
        return;
      }
      lastError = new Error(`Unexpected status ${status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function requestStatus(url, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out waiting for ${url}`));
    });
    req.on('error', reject);
  });
}

export function stopManagedServer(child, signal = 'SIGTERM') {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    child.once('exit', () => resolve());
    child.kill(signal);
  });
}

function resolvePnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
}
