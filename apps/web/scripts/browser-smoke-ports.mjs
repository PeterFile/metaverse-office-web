export const DEFAULT_BROWSER_SMOKE_BACKEND_PORT = 3210;
export const DEFAULT_BROWSER_SMOKE_DEV_SERVER_PORT = 4173;
export const BROWSER_SMOKE_BACKEND_PORT_ENV = 'BROWSER_SMOKE_BACKEND_PORT';
export const BROWSER_SMOKE_DEV_SERVER_PORT_ENV = 'BROWSER_SMOKE_DEV_SERVER_PORT';
export const BROWSER_SMOKE_BASE_URL_ENV = 'BROWSER_SMOKE_BASE_URL';
export const BROWSER_SMOKE_BACKEND_ORIGIN_ENV = 'BROWSER_SMOKE_BACKEND_ORIGIN';
export const BROWSER_SMOKE_FRONTEND_MODE_ENV = 'BROWSER_SMOKE_FRONTEND_MODE';

export function readBrowserSmokePortOverride(envName, env = process.env) {
  const rawValue = env[envName]?.trim();
  if (!rawValue) {
    return null;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${envName} must be an integer TCP port, got "${rawValue}"`);
  }

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${envName} must be between 1 and 65535, got "${rawValue}"`);
  }

  return port;
}

export function assertDistinctBrowserSmokePorts(backendPort, devServerPort) {
  if (backendPort === devServerPort) {
    throw new Error(
      `Browser smoke backend and dev server ports must differ, both were ${backendPort}`
    );
  }
}

export function resolveBrowserSmokePorts(env = process.env) {
  const backendPort =
    readBrowserSmokePortOverride(BROWSER_SMOKE_BACKEND_PORT_ENV, env) ??
    DEFAULT_BROWSER_SMOKE_BACKEND_PORT;
  const devServerPort =
    readBrowserSmokePortOverride(BROWSER_SMOKE_DEV_SERVER_PORT_ENV, env) ??
    DEFAULT_BROWSER_SMOKE_DEV_SERVER_PORT;

  assertDistinctBrowserSmokePorts(backendPort, devServerPort);

  return {
    backendPort,
    devServerPort
  };
}

export function resolveBrowserSmokeFrontendMode(env = process.env) {
  const rawValue = env[BROWSER_SMOKE_FRONTEND_MODE_ENV]?.trim().toLowerCase();
  if (!rawValue) {
    return 'preview';
  }

  if (rawValue === 'preview' || rawValue === 'dev') {
    return rawValue;
  }

  throw new Error(
    `${BROWSER_SMOKE_FRONTEND_MODE_ENV} must be either "preview" or "dev", got "${env[BROWSER_SMOKE_FRONTEND_MODE_ENV]}"`
  );
}
