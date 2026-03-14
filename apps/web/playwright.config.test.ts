import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const configSource = readFileSync(resolve(process.cwd(), 'playwright.config.ts'), 'utf8');

describe('browser smoke Playwright config', () => {
  it('starts its own Vite dev server instead of reusing an existing instance', () => {
    expect(configSource).toMatch(
      /command:\s*`pnpm dev[^`]*`[\s\S]*?reuseExistingServer:\s*false/
    );
  });

  it('does not allow any smoke-test web server to reuse an existing process', () => {
    expect(configSource).not.toMatch(/reuseExistingServer:\s*true/);
  });
});
