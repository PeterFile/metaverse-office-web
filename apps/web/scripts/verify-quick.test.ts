import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyChangedFiles,
  listChangedFiles,
  parseVerifyQuickArgs,
  resolveVerifyQuickSteps
} from '../../../scripts/verify-quick.mjs';

const repoRoot = resolve(process.cwd(), '../..');
const verifyQuickScript = resolve(repoRoot, 'scripts/verify-quick.mjs');

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

  it('routes docs-only changes to the docs lane', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['README.md', 'docs/current-direction.md', 'specs/api-contract.md']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'docs' });
    expect(plan.steps).toEqual([['git', ['diff', '--check', 'HEAD', '--']]]);
  });

  it('checks the requested since diff when routing committed changes', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--since=origin/master']), {
      cwd: repoRoot,
      changedFiles: ['README.md']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'docs', changed: true, since: 'origin/master' });
    expect(plan.steps).toEqual([['git', ['diff', '--check', 'origin/master', '--']]]);
  });

  it('fails --since when the committed changed diff has whitespace errors', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'verify-quick-since-check-'));
    const runGit = (...args: string[]) => execFileSync('git', args, { cwd: tempRepo, stdio: 'ignore' });

    try {
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n');
      runGit('init');
      runGit('config', 'user.email', 'verify-quick@example.invalid');
      runGit('config', 'user.name', 'verify quick');
      runGit('add', '.');
      runGit('commit', '-m', 'initial');
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n\nBad trailing space. \n');
      runGit('add', '.');
      runGit('commit', '-m', 'bad docs');

      let output = '';
      try {
        execFileSync('node', [verifyQuickScript, '--since=HEAD~1'], {
          cwd: tempRepo,
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        output = `${execError.stdout ?? ''}${execError.stderr ?? ''}`;
      }

      expect(output).toMatch(/trailing whitespace/);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('fails --changed when staged changed files have whitespace errors', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'verify-quick-staged-check-'));
    const runGit = (...args: string[]) => execFileSync('git', args, { cwd: tempRepo, stdio: 'ignore' });

    try {
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n');
      runGit('init');
      runGit('config', 'user.email', 'verify-quick@example.invalid');
      runGit('config', 'user.name', 'verify quick');
      runGit('add', '.');
      runGit('commit', '-m', 'initial');
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n\nBad staged space. \n');
      runGit('add', 'README.md');

      let output = '';
      try {
        execFileSync('node', [verifyQuickScript, '--changed'], {
          cwd: tempRepo,
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        output = `${execError.stdout ?? ''}${execError.stderr ?? ''}`;
      }

      expect(output).toMatch(/trailing whitespace/);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('routes backend-only changes to backend validation', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['src/server.js', 'tests/server.smoke.test.js']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'backend' });
    expect(plan.steps).toContainEqual(['pnpm', ['backend:test']]);
  });

  it('keeps deleted tracked files in changed-file routing', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'verify-quick-deleted-'));
    const runGit = (...args: string[]) => execFileSync('git', args, { cwd: tempRepo, stdio: 'ignore' });

    try {
      mkdirSync(join(tempRepo, 'src'));
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n');
      writeFileSync(join(tempRepo, 'src', 'deleted.js'), 'export const deleted = true;\n');
      runGit('init');
      runGit('config', 'user.email', 'verify-quick@example.invalid');
      runGit('config', 'user.name', 'verify quick');
      runGit('add', '.');
      runGit('commit', '-m', 'initial');

      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n\nDocs edit.\n');
      unlinkSync(join(tempRepo, 'src', 'deleted.js'));

      expect(listChangedFiles({ cwd: tempRepo })).toEqual(['README.md', 'src/deleted.js']);
      expect(
        resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), { cwd: tempRepo })
      ).toMatchObject({ mode: 'lane', lane: 'backend' });
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('routes web API/client changes to the web-api lane', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['apps/web/src/api.ts', 'apps/web/src/api.contract.test.ts']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'web-api' });
    expect(JSON.stringify(plan.steps)).toMatch(/api\.contract\.test\.ts/);
    expect(JSON.stringify(plan.steps)).toMatch(/web:typecheck/);
  });

  it('routes known changed web unit tests to focused-files', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['apps/web/src/App.test.tsx', 'apps/web/scripts/verify-quick.test.ts']
    });

    expect(plan).toMatchObject({
      mode: 'focused-files',
      focusedFiles: ['scripts/verify-quick.test.ts', 'src/App.test.tsx']
    });
  });

  it('routes smoke and e2e changes to the smoke lane', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['apps/web/e2e/operator-shell.live-evidence-journey.smoke.spec.ts']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'smoke' });
    expect(plan.steps).toContainEqual(['pnpm', ['web:test:browser-smoke:live-evidence']]);
  });

  it('rejects unknown or cross-layer changed-file routing instead of false-greening', () => {
    expect(() =>
      classifyChangedFiles(['scripts/verify-quick.mjs'])
    ).toThrow(/Cannot safely route changed files/);

    expect(() =>
      classifyChangedFiles(['src/server.js', 'apps/web/src/api.ts'])
    ).toThrow(/cross-layer/);
  });
});
