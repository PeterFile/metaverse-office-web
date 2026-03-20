import { describe, expect, it } from 'vitest';

import {
  assertDistinctBrowserSmokePorts,
  BROWSER_SMOKE_BACKEND_PORT_ENV,
  BROWSER_SMOKE_BASE_URL_ENV,
  BROWSER_SMOKE_DEV_SERVER_PORT_ENV,
  DEFAULT_BROWSER_SMOKE_BACKEND_PORT,
  DEFAULT_BROWSER_SMOKE_DEV_SERVER_PORT,
  readBrowserSmokePortOverride,
  resolveBrowserSmokePorts
} from './browser-smoke-ports.mjs';

describe('browser smoke port helpers', () => {
  it('uses the legacy defaults when no overrides are set', () => {
    expect(resolveBrowserSmokePorts({})).toEqual({
      backendPort: DEFAULT_BROWSER_SMOKE_BACKEND_PORT,
      devServerPort: DEFAULT_BROWSER_SMOKE_DEV_SERVER_PORT
    });
  });

  it('parses explicit backend and dev-server overrides', () => {
    expect(
      resolveBrowserSmokePorts({
        [BROWSER_SMOKE_BACKEND_PORT_ENV]: '4321',
        [BROWSER_SMOKE_DEV_SERVER_PORT_ENV]: '5432'
      })
    ).toEqual({
      backendPort: 4321,
      devServerPort: 5432
    });
  });

  it('rejects invalid port overrides', () => {
    expect(() =>
      readBrowserSmokePortOverride(BROWSER_SMOKE_BACKEND_PORT_ENV, {
        [BROWSER_SMOKE_BACKEND_PORT_ENV]: 'not-a-port'
      })
    ).toThrow(/must be an integer TCP port/);
  });

  it('rejects duplicate backend and dev-server ports', () => {
    expect(() => assertDistinctBrowserSmokePorts(4173, 4173)).toThrow(/must differ/);
  });

  it('exposes the wrapper-managed explicit base URL env', () => {
    expect(BROWSER_SMOKE_BASE_URL_ENV).toBe('BROWSER_SMOKE_BASE_URL');
  });
});
