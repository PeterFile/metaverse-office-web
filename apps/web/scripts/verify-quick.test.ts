import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseVerifyQuickArgs,
  resolveVerifyQuickSteps
} from '../../../scripts/verify-quick.mjs';

const repoRoot = resolve(process.cwd(), '../..');

describe('verify-quick helpers', () => {
  it('keeps lane mode separate from explicit focused file runs', () => {
    expect(parseVerifyQuickArgs(['--lane=ui'])).toEqual({ mode: 'lane', lane: 'ui' });
    expect(() =>
      parseVerifyQuickArgs(['--lane=ui', '--focused-files', 'src/App.test.tsx'])
    ).toThrow(/Use either --lane or --focused-files/);
  });

  it('runs explicit web package test files through focused Vitest without broad validation', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--focused-files', 'src/App.test.tsx']), {
      cwd: repoRoot
    });

    expect(plan.steps).toEqual([
      ['git', ['diff', '--check']],
      [
        'pnpm',
        ['--filter', '@metaverse-office/web', 'exec', 'vitest', 'run', 'src/App.test.tsx']
      ]
    ]);
    expect(JSON.stringify(plan.steps)).not.toMatch(/\btest:all\b|\bweb:build\b|\bbuild\b/);
  });

  it('rejects unsafe or non-test focused file paths', () => {
    expect(() =>
      resolveVerifyQuickSteps(parseVerifyQuickArgs(['--focused-files', '../package.json']), {
        cwd: repoRoot
      })
    ).toThrow(/escapes the web package/);

    expect(() =>
      resolveVerifyQuickSteps(parseVerifyQuickArgs(['--focused-files', 'src/App.tsx']), {
        cwd: repoRoot
      })
    ).toThrow(/Vitest test\/spec file/);
  });
});
