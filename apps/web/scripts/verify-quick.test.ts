import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyChangedFiles,
  formatVerifyQuickPlanSummary,
  listChangedFiles,
  parseVerifyQuickArgs,
  resolveVerifyQuickSteps
} from '../../../scripts/verify-quick.mjs';

const repoRoot = resolve(process.cwd(), '../..');
const verifyQuickScript = resolve(repoRoot, 'scripts/verify-quick.mjs');

function runVerifyQuick(args: string[], cwd = repoRoot) {
  const result = spawnSync('node', [verifyQuickScript, ...args], {
    cwd,
    encoding: 'utf8'
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  };
}

describe('verify-quick helpers', () => {
  it('keeps lane mode separate from explicit focused file runs', () => {
    expect(parseVerifyQuickArgs(['--lane=ui'])).toEqual({ mode: 'lane', lane: 'ui' });
    expect(parseVerifyQuickArgs(['--lane=ui-source-gap'])).toEqual({ mode: 'lane', lane: 'ui-source-gap' });
    expect(() =>
      parseVerifyQuickArgs(['--lane=ui', '--focused-files', 'src/App.test.tsx'])
    ).toThrow(/Use either --lane or --focused-files/);
  });

  it('plans ui-source-gap without broad App, DetailsPanel, or WorldScene tests', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--lane=ui-source-gap']), {
      cwd: repoRoot
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'ui-source-gap' });
    expect(plan.steps).toEqual([
      ['git', ['diff', '--check']],
      [
        'pnpm',
        [
          '--filter',
          '@metaverse-office/web',
          'exec',
          'vitest',
          'run',
          'src/aitown/sourceGapSignals.test.ts',
          'src/aitown/sourceHealth.test.ts',
          'src/sourceHealthWorldBadges.test.ts'
        ]
      ],
      ['pnpm', ['web:typecheck']]
    ]);
    expect(JSON.stringify(plan.steps)).not.toMatch(/src\/App\.test\.tsx|DetailsPanel\.test\.tsx|WorldScene\.test\.tsx/);
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

  it('summarizes selected routing and planned steps before execution', () => {
    const changedPlan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['README.md']
    });

    expect(formatVerifyQuickPlanSummary(changedPlan)).toEqual([
      '[verify:quick] selected changed-files route=lane lane=docs steps=1',
      '[verify:quick] plan 1/1: git diff --check HEAD --'
    ]);

    const focusedPlan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--focused-files', 'src/App.test.tsx']), {
      cwd: repoRoot
    });

    expect(formatVerifyQuickPlanSummary(focusedPlan)).toEqual([
      '[verify:quick] selected focused-files=1 steps=2',
      '[verify:quick] plan 1/2: git diff --check',
      '[verify:quick] plan 2/2: pnpm --filter @metaverse-office/web exec vitest run src/App.test.tsx'
    ]);

    const changedFocusedPlan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['apps/web/src/App.test.tsx']
    });

    expect(formatVerifyQuickPlanSummary(changedFocusedPlan)[0]).toBe(
      '[verify:quick] selected changed-files route=focused-files focused-files=1 steps=2'
    );
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

  it('routes source-gap UI source and tests to the bounded ui-source-gap lane', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: [
        'apps/web/src/aitown/sourceGapSignals.ts',
        'apps/web/src/aitown/sourceGapSignals.test.ts',
        'apps/web/src/aitown/sourceHealth.ts',
        'apps/web/src/sourceHealthWorldBadges.test.ts'
      ]
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'ui-source-gap', changed: true });
    expect(JSON.stringify(plan.steps)).toMatch(/sourceGapSignals\.test\.ts/);
    expect(JSON.stringify(plan.steps)).toMatch(/sourceHealth\.test\.ts/);
    expect(JSON.stringify(plan.steps)).toMatch(/sourceHealthWorldBadges\.test\.ts/);
    expect(JSON.stringify(plan.steps)).not.toMatch(/src\/App\.test\.tsx|DetailsPanel\.test\.tsx|WorldScene\.test\.tsx/);
  });

  it('keeps non-source-gap web source changes on the broad ui lane', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: ['apps/web/src/App.tsx']
    });

    expect(plan).toMatchObject({ mode: 'lane', lane: 'ui', changed: true });
  });

  it('routes Live Evidence helper source changes to their exact focused tests', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: [
        'apps/web/src/selectedAgentEvidenceLedger.ts',
        'apps/web/src/evidenceProvenanceBundle.ts',
        'apps/web/src/aitown/selectedAgentEvidenceGlance.ts',
        'apps/web/src/aitown/selectedAgentSourceMatrix.ts'
      ]
    });

    expect(plan).toMatchObject({
      mode: 'focused-files',
      focusedFiles: [
        'src/aitown/selectedAgentEvidenceGlance.test.ts',
        'src/aitown/selectedAgentSourceMatrix.test.ts',
        'src/evidenceProvenanceBundle.test.ts',
        'src/selectedAgentEvidenceLedger.test.ts'
      ]
    });
  });

  it('dedupes Live Evidence helper source and counterpart test changes', () => {
    const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
      cwd: repoRoot,
      changedFiles: [
        'apps/web/src/selectedAgentEvidenceLedger.ts',
        'apps/web/src/selectedAgentEvidenceLedger.test.ts'
      ]
    });

    expect(plan).toMatchObject({
      mode: 'focused-files',
      focusedFiles: ['src/selectedAgentEvidenceLedger.test.ts']
    });
  });

  it('keeps Live Evidence containers on the broad ui lane', () => {
    for (const changedFile of [
      'apps/web/src/App.tsx',
      'apps/web/src/aitown/DetailsPanel.tsx',
      'apps/web/src/aitown/WorldScene.tsx'
    ]) {
      const plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(['--changed']), {
        cwd: repoRoot,
        changedFiles: [changedFile]
      });

      expect(plan).toMatchObject({ mode: 'lane', lane: 'ui', changed: true });
    }
  });

  it('rejects mixed Live Evidence helper and container changes', () => {
    expect(() =>
      classifyChangedFiles([
        'apps/web/src/selectedAgentEvidenceLedger.ts',
        'apps/web/src/aitown/DetailsPanel.tsx'
      ])
    ).toThrow(/cross-layer/);
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

  it('prints a lane plan without running commands', () => {
    const result = runVerifyQuick(['--plan', '--lane=docs']);

    expect(result.status).toBe(0);
    expect(result.output).toMatch(/\[verify:quick\] lane=docs/);
    expect(result.output).toMatch(/\[verify:quick\] plan: git diff --check/);
    expect(result.output).not.toMatch(/\[verify:quick\] run:/);
  });

  it('prints a focused-files plan with exact Vitest command', () => {
    const result = runVerifyQuick(['--dry-run', '--focused-files', 'src/App.test.tsx']);

    expect(result.status).toBe(0);
    expect(result.output).toMatch(/\[verify:quick\] focused-files=1/);
    expect(result.output).toMatch(
      /\[verify:quick\] plan: pnpm --filter @metaverse-office\/web exec vitest run src\/App\.test\.tsx/
    );
    expect(result.output).not.toMatch(/\[verify:quick\] run:/);
  });

  it('prints changed and since plans with the routed diff check args', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'verify-quick-plan-diff-'));
    const runGit = (...args: string[]) => execFileSync('git', args, { cwd: tempRepo, stdio: 'ignore' });

    try {
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n');
      runGit('init');
      runGit('config', 'user.email', 'verify-quick@example.invalid');
      runGit('config', 'user.name', 'verify quick');
      runGit('add', '.');
      runGit('commit', '-m', 'initial');

      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n\nDocs edit.\n');
      const changedResult = runVerifyQuick(['--plan', '--changed'], tempRepo);
      expect(changedResult.status).toBe(0);
      expect(changedResult.output).toMatch(/\[verify:quick\] lane=docs/);
      expect(changedResult.output).toMatch(/\[verify:quick\] plan: git diff --check HEAD --/);

      runGit('add', 'README.md');
      runGit('commit', '-m', 'docs edit');
      const sinceResult = runVerifyQuick(['--dry-run', '--since=HEAD~1'], tempRepo);
      expect(sinceResult.status).toBe(0);
      expect(sinceResult.output).toMatch(/\[verify:quick\] lane=docs/);
      expect(sinceResult.output).toMatch(/\[verify:quick\] plan: git diff --check HEAD~1 --/);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('fails plan mode for unsafe changed-file routes', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'verify-quick-plan-fail-'));
    const runGit = (...args: string[]) => execFileSync('git', args, { cwd: tempRepo, stdio: 'ignore' });

    try {
      mkdirSync(join(tempRepo, 'scripts'));
      writeFileSync(join(tempRepo, 'README.md'), '# Temp repo\n');
      runGit('init');
      runGit('config', 'user.email', 'verify-quick@example.invalid');
      runGit('config', 'user.name', 'verify quick');
      runGit('add', '.');
      runGit('commit', '-m', 'initial');
      writeFileSync(join(tempRepo, 'scripts', 'tool.mjs'), 'export const tool = true;\n');

      const result = runVerifyQuick(['--plan', '--changed'], tempRepo);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/Cannot safely route changed files: scripts\/tool\.mjs/);
      expect(result.output).not.toMatch(/\[verify:quick\] plan:/);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });
});
