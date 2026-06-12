const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createRuntimeInputInventory,
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

test('runtime input inventory reports unset file paths and precedence without leaking values', () => {
  const cases = [
    {
      options: {},
      expected: {
        hermes_runtime_sources: {
          enabled: false,
          mode: 'unset',
          configured_input_count: 0
        },
        task_evidence_sources: {
          enabled: false,
          mode: 'unset',
          configured_input_count: 0
        }
      }
    },
    {
      options: {
        hermesRuntimeSourcesFile: '/tmp/runtime-secret/hermes-runtime.jsonl',
        taskEvidenceFile: '/tmp/runtime-secret/task-evidence.jsonl'
      },
      expected: {
        hermes_runtime_sources: {
          enabled: true,
          mode: 'file',
          configured_input_count: 1
        },
        task_evidence_sources: {
          enabled: true,
          mode: 'file',
          configured_input_count: 1
        }
      }
    },
    {
      options: {
        hermesRuntimeSourcesPaths: [
          '/tmp/runtime-secret/hermes-a.jsonl',
          '/tmp/runtime-secret/hermes-dir'
        ],
        taskEvidencePaths: ['/tmp/runtime-secret/task-dir']
      },
      expected: {
        hermes_runtime_sources: {
          enabled: true,
          mode: 'paths',
          configured_input_count: 2
        },
        task_evidence_sources: {
          enabled: true,
          mode: 'paths',
          configured_input_count: 1
        }
      }
    },
    {
      options: {
        hermesRuntimeSourcesFile: '/tmp/runtime-secret/legacy-hermes.jsonl',
        hermesRuntimeSourcesPaths: ['/tmp/runtime-secret/current-hermes.jsonl'],
        taskEvidenceFile: '/tmp/runtime-secret/legacy-task.jsonl',
        taskEvidencePaths: [
          '/tmp/runtime-secret/current-task-a.jsonl',
          '/tmp/runtime-secret/current-task-b.jsonl'
        ]
      },
      expected: {
        hermes_runtime_sources: {
          enabled: true,
          mode: 'paths',
          configured_input_count: 1
        },
        task_evidence_sources: {
          enabled: true,
          mode: 'paths',
          configured_input_count: 2
        }
      }
    }
  ];

  for (const testCase of cases) {
    const inventory = createRuntimeInputInventory(testCase.options);

    assert.deepEqual(inventory, testCase.expected);
    const serialized = JSON.stringify(inventory);
    for (const forbidden of [
      '/tmp/runtime-secret',
      'hermes-runtime.jsonl',
      'task-evidence.jsonl',
      'legacy-hermes.jsonl',
      'legacy-task.jsonl'
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
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
      agent_id: 'app-engineering',
      source_provenance: {
        source_format: 'jsonl',
        source_index: 0,
        line: 1,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      }
    }
  ]);
});

test('task evidence PATHS take precedence over legacy FILE', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-task-evidence-index-'));
  const pathsFile = path.join(root, 'task-evidence-from-paths.jsonl');
  const legacyFile = path.join(root, 'missing-legacy-task-evidence.jsonl');

  await writeFile(
    pathsFile,
    `${JSON.stringify({
      task_ref: 'TASK-301',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:01:00.000Z',
      correlation_id: 'corr-task-301'
    })}\n`
  );

  const options = createTaskEvidenceOptions({
    taskEvidenceFile: legacyFile,
    taskEvidencePaths: [pathsFile]
  });
  const result = await options.readTaskEvidenceCandidates();

  assert.deepEqual(result.rejected, []);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.task_ref),
    ['TASK-301']
  );
});
