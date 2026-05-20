const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createHermesRuntimeSourcesOptions,
  createTaskEvidenceOptions,
  parseDelimitedEnvPaths
} = require('../src/index');

test('parseDelimitedEnvPaths trims blanks using the platform delimiter', () => {
  assert.deepEqual(
    parseDelimitedEnvPaths(['  /runtime/one  ', '', ' /runtime/two '].join(path.delimiter)),
    ['/runtime/one', '/runtime/two']
  );
});

test('Hermes runtime source PATHS take precedence over legacy FILE', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-index-'));
  const pathsFile = path.join(root, 'runtime-from-paths.jsonl');
  const legacyFile = path.join(root, 'missing-legacy-runtime.jsonl');

  await writeFile(
    pathsFile,
    `${JSON.stringify({
      source_kind: 'hermes_profile',
      profile_id: 'paths-profile',
      observed_at: '2026-03-09T18:02:00.000Z'
    })}\n`
  );

  const options = createHermesRuntimeSourcesOptions({
    hermesRuntimeSourcesFile: legacyFile,
    hermesRuntimeSourcesPaths: [pathsFile]
  });

  const facts = await options.readHermesRuntimeSources();
  assert.deepEqual(
    facts.map((fact) => fact.evidence_ref),
    ['hermes://profile/paths-profile']
  );
});

test('task evidence file env is opt-in and returns normalized candidates only when set', async () => {
  assert.deepEqual(createTaskEvidenceOptions({ taskEvidenceFile: '' }), {});

  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-task-evidence-index-'));
  const filePath = path.join(root, 'task-evidence.jsonl');
  await writeFile(
    filePath,
    `${JSON.stringify({
      task_ref: 'TASK-300',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task-300',
      agent_id: 'app-engineering'
    })}\n`
  );

  const options = createTaskEvidenceOptions({ taskEvidenceFile: filePath });
  const result = await options.readTaskEvidenceCandidates();

  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.candidates, [
    {
      status: 'observed',
      task_ref: 'TASK-300',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task-300',
      agent_id: 'app-engineering'
    }
  ]);
});
