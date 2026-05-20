const assert = require('node:assert/strict');
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
