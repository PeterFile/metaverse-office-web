import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const configSource = readFileSync(resolve(process.cwd(), 'playwright.config.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

describe('browser smoke Playwright config', () => {
  it('starts its own Vite dev server instead of reusing an existing instance', () => {
    expect(configSource).toMatch(
      /command:\s*`pnpm dev[^`]*`[\s\S]*?reuseExistingServer:\s*false/
    );
  });

  it('does not allow any smoke-test web server to reuse an existing process', () => {
    expect(configSource).not.toMatch(/reuseExistingServer:\s*true/);
  });

  it('supports explicit base URLs so the wrapper can manage dynamic server lifecycles', () => {
    expect(configSource).toContain('BROWSER_SMOKE_BASE_URL_ENV');
    expect(configSource).toContain('explicitBaseURL');
    expect(configSource).toContain('...(webServers ? { webServer: webServers } : {})');
  });

  it('still keeps env-driven fixed ports available for direct browser-smoke runs', () => {
    expect(configSource).toContain('resolveBrowserSmokePorts(process.env)');
  });

  it('runs browser smoke only in Chromium so the suite does not over-claim cross-browser gesture handoff proof', () => {
    expect(configSource).toContain("name: 'chromium'");
    expect(configSource).not.toContain("name: 'webkit-gesture-handoff'");
    expect(configSource).not.toContain("browserName: 'webkit'");
    expect(packageJson.scripts?.['install:browsers']).toBe('playwright install chromium');
    expect(packageJson.scripts?.['install:browsers:ci']).toBe('playwright install --with-deps chromium');
  });

  it('runs browser smoke through the managed wrapper script', () => {
    expect(packageJson.scripts?.['test:browser-smoke']).toBe(
      'node ./scripts/run-browser-smoke.mjs'
    );
  });
});
