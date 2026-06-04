const assert = require('node:assert/strict');
const { mkdir, mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const taskEvidenceSource = require('../src/collectors/task-evidence-source');

const LEAK_CANARIES = [
  '/Users/cwp/secret.txt',
  '/tmp/slack-token-canary',
  '/tmp/github-token-canary',
  'token=super-secret-value',
  'https://example.test/webhook/secret',
  'POST /control-plane/dispatch',
  'raw payload snippet should never escape'
];

function assertNoLeaks(value) {
  const serialized = JSON.stringify(value);

  for (const canary of LEAK_CANARIES) {
    assert.equal(serialized.includes(canary), false, `leaked canary: ${canary}`);
  }
}

async function writeTempEvidenceFile(name, content) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'task-evidence-source-'));
  const filePath = path.join(root, name);
  await writeFile(filePath, content);
  return { root, filePath };
}

test('normalizes fixture task facts into allowlisted evidence summaries', () => {
  const result = taskEvidenceSource.normalizeTaskEvidenceFacts([
    {
      task_ref: 'TASK-123',
      id: 'internal-row-1',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-123',
      agent_id: 'app-engineering',
      title: `Ship the thing ${LEAK_CANARIES[0]}`,
      comment: LEAK_CANARIES[1],
      body: LEAK_CANARIES[2],
      description: LEAK_CANARIES[3],
      local_path: LEAK_CANARIES[0],
      raw_payload: { text: LEAK_CANARIES[3] }
    }
  ]);

  assert.deepEqual(result.candidates, [
    {
      status: 'observed',
      task_ref: 'TASK-123',
      id: 'internal-row-1',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-123',
      agent_id: 'app-engineering'
    }
  ]);
  assert.deepEqual(result.rejected, []);
  assertNoLeaks(result);
  assert.equal(Object.hasOwn(result.candidates[0], 'title'), false);
  assert.equal(Object.hasOwn(result.candidates[0], 'comment'), false);
  assert.equal(Object.hasOwn(result.candidates[0], 'body'), false);
  assert.equal(Object.hasOwn(result.candidates[0], 'description'), false);
});

test('reports invalid unsupported and degraded facts without raw payload leakage', () => {
  const result = taskEvidenceSource.normalizeTaskEvidenceFacts([
    {
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-missing-task',
      title: LEAK_CANARIES[3]
    },
    {
      task_ref: 'TASK-124',
      source_kind: 'linear_live_api',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-live',
      body: LEAK_CANARIES[2]
    },
    {
      task_ref: 'TASK-125',
      source_kind: 'slack_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-agent-path',
      agent_id: LEAK_CANARIES[0],
      comment: LEAK_CANARIES[1]
    }
  ]);

  assert.deepEqual(result.candidates, [
    {
      status: 'degraded',
      task_ref: 'TASK-125',
      source_kind: 'slack_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-agent-path',
      warnings: ['agent_id suppressed']
    }
  ]);
  assert.deepEqual(result.rejected, [
    {
      status: 'invalid',
      index: 0,
      missing_fields: ['task_ref'],
      error: 'task evidence fact missing required fields'
    },
    {
      status: 'unsupported',
      index: 1,
      source_kind: 'linear_live_api',
      error: 'task evidence source kind is not supported for read-only fixtures'
    }
  ]);
  assertNoLeaks(result);
});

test('rejects id-only facts without promoting id into task_ref', () => {
  const result = taskEvidenceSource.normalizeTaskEvidenceFacts([
    {
      id: 'internal-row-777',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-id-only'
    }
  ]);

  assert.deepEqual(result, {
    candidates: [],
    rejected: [
      {
        status: 'invalid',
        index: 0,
        missing_fields: ['task_ref'],
        error: 'task evidence fact missing required fields'
      }
    ]
  });
  assert.equal(JSON.stringify(result).includes('internal-row-777'), false);
});

test('rejects task control-plane fields without leakage', () => {
  const result = taskEvidenceSource.normalizeTaskEvidenceFacts([
    {
      task_ref: 'TASK-127',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-control',
      claim_url: LEAK_CANARIES[4],
      [`claim_${LEAK_CANARIES[3]}`]: 'redacted-field-name',
      assignedTo: 'app-engineering',
      assigneeId: 'app-engineering',
      completedAt: '2026-05-20T01:05:00.000Z',
      dispatchPayload: LEAK_CANARIES[6],
      'route.profile': 'worker-profile'
    },
    {
      task_ref: 'TASK-128',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-writeback',
      write_back_status: 'complete',
      writeBackStatus: 'complete',
      mutationToken: LEAK_CANARIES[3]
    }
  ]);

  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.rejected, [
    {
      status: 'invalid',
      index: 0,
      missing_fields: ['assign', 'claim', 'complete', 'dispatch', 'route'],
      error: 'task evidence fact contains control-plane fields'
    },
    {
      status: 'invalid',
      index: 1,
      missing_fields: ['mutate', 'writeback'],
      error: 'task evidence fact contains control-plane fields'
    }
  ]);
  assertNoLeaks(result);
});

test('rejects or suppresses secret-shaped identifier fields without leakage', () => {
  const result = taskEvidenceSource.normalizeTaskEvidenceFacts([
    {
      task_ref: LEAK_CANARIES[1],
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-secret-task'
    },
    {
      task_ref: 'TASK-127',
      id: LEAK_CANARIES[2],
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-secret-id',
      agent_id: LEAK_CANARIES[4]
    },
    {
      task_ref: 'TASK-128',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: LEAK_CANARIES[3]
    }
  ]);

  assert.deepEqual(result.candidates, [
    {
      status: 'degraded',
      task_ref: 'TASK-127',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-secret-id',
      warnings: ['agent_id suppressed']
    }
  ]);
  assert.deepEqual(result.rejected, [
    {
      status: 'invalid',
      index: 0,
      missing_fields: ['task_ref'],
      error: 'task evidence fact missing required fields'
    },
    {
      status: 'invalid',
      index: 2,
      missing_fields: ['correlation_id'],
      error: 'task evidence fact missing required fields'
    }
  ]);
  assert.equal(Object.hasOwn(result.candidates[0], 'id'), false);
  assert.equal(Object.hasOwn(result.candidates[0], 'agent_id'), false);
  assertNoLeaks(result);
});

test('read-only source surface has no mutation verbs and does not call client writes', async () => {
  const mutationVerbs = /create|update|delete|patch|post|put|assign|claim|complete|dispatch|route|writeback|mutate/i;

  assert.deepEqual(
    Object.keys(taskEvidenceSource).filter((key) => mutationVerbs.test(key)),
    []
  );

  const source = taskEvidenceSource.taskEvidenceSourceFrom({
    client: {
      async listTaskEvidenceFacts() {
        return [
          {
            task_ref: 'TASK-126',
            source_kind: 'kanban_fixture',
            observed_at: '2026-05-20T01:00:00.000Z',
            correlation_id: 'corr-read'
          }
        ];
      },
      async createTask() {
        throw new Error(`write attempted ${LEAK_CANARIES[0]}`);
      },
      async updateTask() {
        throw new Error(`write attempted ${LEAK_CANARIES[1]}`);
      },
      async deleteTask() {
        throw new Error(`write attempted ${LEAK_CANARIES[2]}`);
      }
    }
  });

  const result = await source.readEvidenceCandidates();

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].task_ref, 'TASK-126');
  assertNoLeaks(result);
});

test('reads opt-in task evidence facts from a JSON array file', async () => {
  const { root, filePath } = await writeTempEvidenceFile(
    'task-evidence.json',
    JSON.stringify([
      {
        task_ref: 'TASK-200',
        id: 'row-200',
        source_kind: 'kanban_fixture',
        observed_at: '2026-05-20T01:00:00.000Z',
        correlation_id: 'corr-json',
        agent_id: 'app-engineering',
        raw_payload: { text: LEAK_CANARIES[5] }
      }
    ])
  );

  const reader = taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath });
  const result = await reader.readEvidenceCandidates();

  assert.deepEqual(result, {
    candidates: [
      {
        status: 'observed',
        task_ref: 'TASK-200',
        id: 'row-200',
        source_kind: 'kanban_fixture',
        observed_at: '2026-05-20T01:00:00.000Z',
        correlation_id: 'corr-json',
        agent_id: 'app-engineering',
        source_provenance: {
          source_format: 'json_array',
          source_index: 0,
          source_input_ordinal: 1,
          source_file_ordinal: 1
        }
      }
    ],
    rejected: []
  });
  assert.equal(JSON.stringify(result).includes(root), false);
  assertNoLeaks(result);
});

test('reads opt-in task evidence facts from a JSONL file', async () => {
  const { root, filePath } = await writeTempEvidenceFile(
    'task-evidence.jsonl',
    [
      JSON.stringify({
        task_ref: 'TASK-201',
        source_kind: 'linear_fixture',
        observed_at: '2026-05-20T01:01:00.000Z',
        correlation_id: 'corr-jsonl'
      }),
      '',
      JSON.stringify({
        task_ref: 'TASK-202',
        source_kind: 'slack_fixture',
        observed_at: '2026-05-20T01:02:00.000Z',
        correlation_id: 'corr-jsonl-2'
      })
    ].join('\n')
  );

  const reader = taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath });
  const result = await reader.readEvidenceCandidates();

  assert.deepEqual(result.candidates.map((candidate) => candidate.task_ref), ['TASK-201', 'TASK-202']);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.source_provenance),
    [
      {
        source_format: 'jsonl',
        source_index: 0,
        line: 1,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      },
      {
        source_format: 'jsonl',
        source_index: 2,
        line: 3,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      }
    ]
  );
  assert.deepEqual(result.rejected, []);
  assert.equal(JSON.stringify(result).includes(root), false);
  assertNoLeaks(result);
});

test('reads opt-in task evidence facts from paths and expands directories lexically', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'task-evidence-source-'));
  const sourcesDir = path.join(root, 'sources');
  const extraFile = path.join(root, 'z-extra.jsonl');
  await mkdir(sourcesDir);
  await writeFile(path.join(sourcesDir, 'ignore.txt'), 'not json');
  await writeFile(
    path.join(sourcesDir, 'b-task.jsonl'),
    `${JSON.stringify({
      task_ref: 'TASK-302',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:02:00.000Z',
      correlation_id: 'corr-task-302'
    })}\n`
  );
  await writeFile(
    path.join(sourcesDir, 'a-task.json'),
    JSON.stringify([
      {
        task_ref: 'TASK-301',
        source_kind: 'kanban_fixture',
        observed_at: '2026-05-20T01:01:00.000Z',
        correlation_id: 'corr-task-301'
      }
    ])
  );
  await writeFile(
    extraFile,
    `${JSON.stringify({
      task_ref: 'TASK-303',
      source_kind: 'slack_fixture',
      observed_at: '2026-05-20T01:03:00.000Z',
      correlation_id: 'corr-task-303'
    })}\n`
  );

  const reader = taskEvidenceSource.taskEvidencePathsReaderFrom({
    inputPaths: [sourcesDir, extraFile]
  });
  const result = await reader.readEvidenceCandidates();

  assert.deepEqual(result.rejected, []);
  assert.deepEqual(
    result.candidates.map((candidate) => [
      candidate.task_ref,
      candidate.source_provenance.source_format,
      candidate.source_provenance.line || null,
      candidate.source_provenance.source_input_ordinal,
      candidate.source_provenance.source_file_ordinal
    ]),
    [
      ['TASK-301', 'json_array', null, 1, 1],
      ['TASK-302', 'jsonl', 1, 1, 2],
      ['TASK-303', 'jsonl', 1, 2, 3]
    ]
  );
  assert.equal(JSON.stringify(result).includes(root), false);
  assertNoLeaks(result);
});

test('fails closed for malformed task evidence JSON and JSONL files without leaks', async () => {
  const json = await writeTempEvidenceFile('bad.json', `[{ "task_ref": "${LEAK_CANARIES[0]}" }`);
  const jsonl = await writeTempEvidenceFile('bad.jsonl', `${LEAK_CANARIES[6]}\n`);

  const jsonResult = await taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath: json.filePath }).readEvidenceCandidates();
  const jsonlResult = await taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath: jsonl.filePath }).readEvidenceCandidates();

  assert.deepEqual(jsonResult.candidates, []);
  assert.deepEqual(jsonlResult.candidates, []);
  assert.deepEqual(jsonResult.rejected, [
    {
      status: 'invalid',
      index: null,
      missing_fields: ['file'],
      error: 'task evidence file could not be parsed'
    }
  ]);
  assert.deepEqual(jsonlResult.rejected, [
    {
      status: 'invalid',
      index: null,
      missing_fields: ['file'],
      error: 'task evidence file could not be parsed'
    }
  ]);
  assert.equal(JSON.stringify([jsonResult, jsonlResult]).includes(json.root), false);
  assert.equal(JSON.stringify([jsonResult, jsonlResult]).includes(jsonl.root), false);
  assertNoLeaks([jsonResult, jsonlResult]);
});

test('fails closed for unreadable task evidence files without path leakage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'task-evidence-source-'));
  const filePath = path.join(root, 'missing.jsonl');

  const result = await taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath }).readEvidenceCandidates();

  assert.deepEqual(result, {
    candidates: [],
    rejected: [
      {
        status: 'invalid',
        index: null,
        missing_fields: ['file'],
        error: 'task evidence file could not be read'
      }
    ]
  });
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.equal(JSON.stringify(result).includes(filePath), false);
  assertNoLeaks(result);
});

test('fails closed for unsafe optional identifiers in task evidence files', async () => {
  const { root, filePath } = await writeTempEvidenceFile(
    'unsafe.jsonl',
    `${JSON.stringify({
      task_ref: 'TASK-203',
      id: LEAK_CANARIES[2],
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:03:00.000Z',
      correlation_id: 'corr-unsafe',
      agent_id: LEAK_CANARIES[4]
    })}\n${JSON.stringify({
      task_ref: LEAK_CANARIES[0],
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:04:00.000Z',
      correlation_id: 'corr-secret-task'
    })}\n${JSON.stringify({
      task_ref: 'TASK-204',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:05:00.000Z',
      correlation_id: LEAK_CANARIES[3]
    })}\n${JSON.stringify({
      task_ref: 'TASK-205',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:06:00.000Z',
      correlation_id: 'corr-path',
      path: LEAK_CANARIES[0]
    })}\n`
  );

  const result = await taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath }).readEvidenceCandidates();

  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.rejected, [
    {
      status: 'invalid',
      index: 0,
      missing_fields: ['id', 'agent_id'],
      error: 'task evidence fact has unsafe optional identifiers'
    },
    {
      status: 'invalid',
      index: 1,
      missing_fields: ['task_ref'],
      error: 'task evidence fact missing required fields'
    },
    {
      status: 'invalid',
      index: 2,
      missing_fields: ['correlation_id'],
      error: 'task evidence fact missing required fields'
    },
    {
      status: 'invalid',
      index: 3,
      missing_fields: ['path'],
      error: 'task evidence fact has unsafe optional identifiers'
    }
  ]);
  assert.equal(JSON.stringify(result).includes(root), false);
  assertNoLeaks(result);
});

test('file-reader output projects to canonical task_reference evidence records', async () => {
  const { filePath } = await writeTempEvidenceFile(
    'project.json',
    JSON.stringify([
      {
        task_ref: 'TASK-204',
        source_kind: 'task_fixture',
        observed_at: '2026-05-20T01:04:00.000Z',
        correlation_id: 'corr-project'
      }
    ])
  );

  const readResult = await taskEvidenceSource.taskEvidenceFileReaderFrom({ filePath }).readEvidenceCandidates();
  const projected = taskEvidenceSource.projectTaskEvidenceRecords(readResult.candidates, {
    collected_at: '2026-05-20T01:05:00.000Z',
    collector_snapshot_id: 'task-evidence:file-reader'
  });

  assert.deepEqual(projected.rejected, []);
  assert.equal(projected.records[0].evidence_ref, 'task://task_fixture/TASK-204');
  assert.equal(projected.records[0].evidence_role, 'task_reference');
  assert.equal(projected.records[0].output_candidate, false);
  assert.equal(projected.records[0].source_status, 'observed');
  assert.deepEqual(projected.records[0].metadata.source_provenance, {
    source_format: 'json_array',
    source_index: 0,
    source_input_ordinal: 1,
    source_file_ordinal: 1
  });
  assertNoLeaks(projected);
});

test('projects task facts into canonical read-only evidence records', () => {
  const result = taskEvidenceSource.projectTaskEvidenceRecords(
    [
      {
        task_ref: 'TASK-129',
        id: 'fixture-row-129',
        source_kind: 'kanban_fixture',
        observed_at: '2026-05-20T01:02:03.000Z',
        correlation_id: 'corr-task-129',
        agent_id: 'app-engineering',
        raw_payload: {
          text: LEAK_CANARIES[5]
        }
      },
      {
        task_ref: 'TASK-130',
        source_kind: 'linear_fixture',
        observed_at: '2026-05-20T01:03:00.000Z',
        correlation_id: 'corr-task-130',
        agent_id: LEAK_CANARIES[0]
      }
    ],
    {
      collected_at: '2026-05-20T01:04:00.000Z',
      collector_snapshot_id: 'task-evidence:2026-05-20T01:04:00.000Z'
    }
  );

  assert.deepEqual(result.records, [
    {
      evidence_id: 'ev_task-evidence_2026-05-20T01_04_00_000Z_kanban_fixture_TASK-129_1',
      observed_at: '2026-05-20T01:02:03.000Z',
      collected_at: '2026-05-20T01:04:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'kanban_fixture',
      evidence_ref: 'task://kanban_fixture/TASK-129',
      evidence_role: 'task_reference',
      source_status: 'observed',
      output_candidate: false,
      collector_snapshot_id: 'task-evidence:2026-05-20T01:04:00.000Z',
      correlation_id: 'corr-task-129',
      degraded_reasons: [],
      metadata: {
        task_ref: 'TASK-129',
        fact_id: 'fixture-row-129',
        source_index: 0
      }
    },
    {
      evidence_id: 'ev_task-evidence_2026-05-20T01_04_00_000Z_linear_fixture_TASK-130_2',
      observed_at: '2026-05-20T01:03:00.000Z',
      collected_at: '2026-05-20T01:04:00.000Z',
      agent_id: null,
      source_kind: 'linear_fixture',
      evidence_ref: 'task://linear_fixture/TASK-130',
      evidence_role: 'task_reference',
      source_status: 'degraded',
      output_candidate: false,
      collector_snapshot_id: 'task-evidence:2026-05-20T01:04:00.000Z',
      correlation_id: 'corr-task-130',
      degraded_reasons: ['agent_id suppressed'],
      metadata: {
        task_ref: 'TASK-130',
        source_index: 1,
        warnings: ['agent_id suppressed']
      }
    }
  ]);
  assert.deepEqual(result.rejected, []);
  assertNoLeaks(result);
});
