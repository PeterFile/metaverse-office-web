const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const {
  collectControllerSnapshot,
  createControllerSnapshotCollector,
  createHermesRuntimeSourcesReader,
  createHermesRuntimeSourcesFileReader
} = require('../src/collectors/controller-snapshot');
const { SEED_AGENTS } = require('../src/domain');
const {
  MAX_WRITE_JSON_BODY_BYTES,
  createAppServer,
  formatPublicError,
  handleRequest
} = require('../src/server');
const { createPrototypeStore } = require('../src/store/prototype-store');
const {
  taskEvidenceFileReaderFrom,
  taskEvidencePathsReaderFrom
} = require('../src/collectors/task-evidence-source');

const execFileAsync = promisify(execFile);

async function createHarness(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const sqliteStoreFile = path.join(root, 'prototype-store.sqlite');
  const store = await createPrototypeStore(
    options.storeBackend === 'sqlite'
      ? { sqliteFilePath: sqliteStoreFile }
      : { filePath: storeFile }
  );
  const server = createAppServer({
    store,
    now: options.now || (() => '2026-03-09T18:05:00.000Z'),
    controllerSnapshotCollector: options.controllerSnapshotCollector,
    allowedOrigins: options.allowedOrigins
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address();
  return {
    store,
    storeFile,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function createDirectStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-direct-'));
  return createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
}

async function hasSqlite3() {
  try {
    await execFileAsync('sqlite3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { response, body };
}

async function requestJsonDirect({
  url,
  store,
  controllerSnapshotCollector,
  now = () => '2026-03-09T18:05:00.000Z',
  method = 'GET',
  headers = {},
  body = ''
}) {
  let statusCode = null;
  let bodyText = '';
  const res = {
    setHeader() {},
    writeHead(code) {
      statusCode = code;
    },
    end(chunk = '') {
      bodyText = chunk;
    }
  };
  const chunks = body ? [Buffer.from(body)] : [];

  try {
    await handleRequest({
      req: {
        url,
        method,
        headers,
        async *[Symbol.asyncIterator]() {
          yield* chunks;
        }
      },
      res,
      store,
      now,
      controllerSnapshotCollector,
      allowedOrigins: []
    });
  } catch (error) {
    const publicError = formatPublicError(error);
    res.writeHead(publicError.statusCode);
    res.end(
      JSON.stringify({
        error: publicError.error,
        details: publicError.details
      })
    );
  }

  return {
    response: { status: statusCode },
    body: JSON.parse(bodyText),
    text: bodyText
  };
}

const PUBLIC_404_FORBIDDEN_FRAGMENTS = [
  '/tmp',
  '/Users',
  '/Volumes',
  'tmux://',
  'hermes://',
  'profile://',
  'session://',
  'file://',
  'https://hooks',
  'http://hooks',
  'token',
  'webhook',
  'secret',
  'control-plane'
];

function assertPublic404DoesNotExposeCanary(response, canary) {
  assert.equal(response.response.status, 404);
  assert.equal(response.body.error, 'not_found');

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(canary), false, `404 echoed ${canary}`);
  for (const fragment of PUBLIC_404_FORBIDDEN_FRAGMENTS) {
    assert.equal(
      serialized.toLowerCase().includes(fragment.toLowerCase()),
      false,
      `404 exposed forbidden fragment ${fragment}: ${serialized}`
    );
  }
}

function getAppendCounts(store) {
  const counts = store.getCounts();
  return {
    event_count: counts.event_count,
    heartbeat_count: counts.heartbeat_count,
    evidence_record_count: store.evidenceRecords.length,
    collector_snapshot_count: store.collectorReports.length
  };
}

test('server invalid runtime error redaction bounds unexpected internal details while preserving safe public errors', () => {
  const unexpected = formatPublicError(
    new Error(
      [
        'runtime exploded',
        '/Users/alice/private/runtime.json',
        'file:///tmp/private/runtime.json',
        'tmux://private-session/0.0',
        'hermes://profile/private-runtime',
        'session_ref=private-session',
        'profile_id=private-profile',
        'token=collector-secret',
        '{"raw_payload":true}'
      ].join(' ')
    )
  );

  assert.deepEqual(unexpected, {
    statusCode: 500,
    error: 'internal_error',
    details: 'internal_error'
  });

  const invalidJson = new Error('Unexpected token');
  invalidJson.statusCode = 400;
  invalidJson.publicMessage = 'invalid_json';
  invalidJson.publicDetails = 'invalid_json';
  assert.deepEqual(formatPublicError(invalidJson), {
    statusCode: 400,
    error: 'invalid_json',
    details: 'invalid_json'
  });

  assert.deepEqual(
    formatPublicError(
      new Error('Invalid Hermes runtime source fact at Hermes runtime source input 1 record 1: invalid status')
    ),
    {
      statusCode: 422,
      error: 'invalid_runtime_evidence_input',
      details: 'Invalid Hermes runtime source fact at Hermes runtime source input 1 record 1: invalid status'
    }
  );
});

function assertNoPartialCollectorAppend(store, beforeCounts) {
  assert.deepEqual(getAppendCounts(store), beforeCounts);
}

function createEvent({
  eventId,
  ts,
  agentId,
  actorId = agentId,
  eventType,
  currentState,
  activeTask,
  summary,
  location = 'meeting-zone',
  severity = 'normal',
  correlationId,
  counterpartyAgentIds = [],
  evidenceRefs = [],
  metadata = {},
  sourceKind = actorId === agentId ? 'workspace_file' : 'controller_event'
}) {
  return {
    event_id: eventId,
    ts,
    agent_id: agentId,
    actor_id: actorId,
    agent_role: agentId,
    event_type: eventType,
    current_state: currentState,
    active_task: activeTask,
    location,
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: sourceKind,
    metadata
  };
}

function createRouteParityCollectorReport() {
  return {
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 0,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 3,
      covered_agent_count: 1,
      low_confidence_agent_ids: ['protocol-engineering'],
      source_kind_buckets: {
        workspace_file: 2,
        workspace_root: 0,
        tmux_observation: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 3,
          source_kinds: ['workspace_file', 'tmux_observation'],
          latest_evidence_at: '2026-03-09T18:05:30.000Z',
          confidence_level: 'high'
        },
        {
          agent_id: 'protocol-engineering',
          evidence_ref_count: 0,
          source_kinds: [],
          latest_evidence_at: null,
          confidence_level: 'low'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-route-parity',
          pane_refs: ['tmux://unmapped-route-parity/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [
          '/tmp/route-parity/app/inbox.md',
          '/tmp/route-parity/app/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/route-parity/app/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:04:00.000Z'
          },
          {
            path: '/tmp/route-parity/app/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:00.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_current_command: 'nvim',
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/route-parity/app',
            last_observed_at: '2026-03-09T18:03:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 2,
            missing_count: 1,
            error_count: 0,
            last_observed_at: '2026-03-09T18:05:00.000Z',
            degraded_reasons: ['missing workspace files: todo.md']
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:06:00.000Z',
          current_state: 'coding',
          active_task: 'Validate evidence read-route parity',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:05:00.000Z',
          last_file_write_at: '2026-03-09T18:05:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/route-parity/app/outbox.md', 'tmux://5-web3-app-engineering/0.1']
        }
      },
      {
        agent_id: 'protocol-engineering',
        evidence_refs: [],
        workspace_observations: [],
        tmux_observations: [],
        source_health: {
          workspace_root: {
            status: 'missing',
            path: '/tmp/route-parity/protocol',
            last_observed_at: null,
            degraded_reasons: ['workspace root not observed']
          },
          workspace_files: {
            status: 'missing',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 0,
            missing_count: 3,
            error_count: 0,
            last_observed_at: null,
            degraded_reasons: ['missing workspace files: inbox.md, outbox.md, todo.md']
          }
        }
      }
    ]
  };
}

function createEvidenceSpineRedactionCollectorReport() {
  const report = createRouteParityCollectorReport();
  const item = report.items[0];

  item.evidence_refs.push('hermes://profile/redaction-profile');
  item.hermes_runtime_observations = [
    {
      source_kind: 'hermes_profile',
      evidence_ref: 'hermes://profile/redaction-profile',
      profile_id: 'redaction-profile-id',
      session_ref: 'redaction-session-ref',
      status: 'observed',
      observed_at: '2026-03-09T18:07:20.000Z',
      source_provenance: {
        payload: 'token=redaction-profile-payload',
        webhook: 'https://hooks.slack.com/services/redaction-profile'
      }
    }
  ];
  item.task_evidence_observations = [
    {
      status: 'degraded',
      task_ref: 'RED-101',
      source_kind: 'kanban_fixture',
      observed_at: '2026-03-09T18:07:25.000Z',
      correlation_id: 'corr-redaction-task',
      warnings: ['agent_id suppressed'],
      source_provenance: {
        payload: 'token=redaction-task-payload',
        webhook: 'https://hooks.slack.com/services/redaction-task'
      }
    }
  ];
  item.source_health.hermes_profile = {
    status: 'observed',
    profile_id: 'redaction-profile-id',
    session_ref: 'redaction-session-ref',
    observed_count: 1,
    last_observed_at: '2026-03-09T18:07:20.000Z',
    degraded_reasons: ['token=redaction-hermes-secret']
  };

  return report;
}

function assertNoEvidenceSpineRuntimeLeak(payload, { allowCollectorAnchors = false } = {}) {
  const serialized = JSON.stringify(payload);
  const forbidden = [
    'evidence_ref',
    '/tmp/evidence-spine-redaction',
    'tmux://redaction-session',
    'hermes://profile/redaction',
    'redaction-session-ref',
    'redaction-profile-id',
    'metadata',
    'degraded_reasons',
    '"payload"',
    'raw_payload',
    'token=redaction',
    'hooks.slack.com/services/redaction',
    'webhook',
    'source_provenance',
    'RED-101'
  ];

  if (!allowCollectorAnchors) {
    forbidden.push('collector_snapshot_id', 'correlation_id', 'corr-redaction');
  }

  for (const canary of forbidden) {
    assert.equal(serialized.includes(canary), false, `${canary} leaked`);
  }
}

const SAFE_ROUTE_HOSTILE_CANARIES = [
  '/Users/safe-route-canary/private.json',
  '/Volumes/safe-route-canary/runtime.json',
  '/tmp/safe-route-canary/runtime.json',
  'file:///tmp/safe-route-canary/runtime.json',
  'tmux://safe-route-canary/0.1',
  'hermes://profile/safe-route-canary',
  'hermes://session/safe-route-canary',
  'profile://safe-route-canary',
  'session://safe-route-canary',
  'token=safe-route-canary',
  'webhook-safe-route-canary',
  'https://hooks.slack.com/services/safe-route-canary',
  'https://example.test/callback/safe-route-canary',
  'control-plane://safe-route-canary'
];

function assertNoSafeRouteCanaries(payload, route) {
  const serialized = JSON.stringify(payload);
  for (const canary of SAFE_ROUTE_HOSTILE_CANARIES) {
    assert.equal(serialized.includes(canary), false, `${route} leaked ${canary}`);
  }
}

const READONLY_RUNTIME_INPUT_CANARIES = [
  '/tmp/readonly-no-append-proof/runtime.jsonl',
  'file:///tmp/readonly-no-append-proof/runtime.jsonl',
  'tmux://readonly-no-append-proof/0.1',
  'hermes://profile/readonly-no-append-proof',
  'hermes://session/readonly-no-append-proof',
  'token=readonly-no-append-proof',
  'webhook-readonly-no-append-proof'
];

const READONLY_ACTION_CANARY_PATTERNS = [
  /\bdispatch\b/i,
  /\bclaim\b/i,
  /\bassign(?:ment)?\b/i,
  /\bcomplete\b/i,
  /\bworker orchestration\b/i
];

function assertNoReadOnlyRuntimeInputLeak(payload, route) {
  const serialized = JSON.stringify(payload);
  for (const canary of READONLY_RUNTIME_INPUT_CANARIES) {
    assert.equal(serialized.includes(canary), false, `${route} leaked ${canary}`);
  }
  for (const pattern of READONLY_ACTION_CANARY_PATTERNS) {
    assert.equal(pattern.test(serialized), false, `${route} exposed ${pattern}`);
  }
}

const READ_ONLY_ROUTE_BOUNDARY_SAFE_EVIDENCE_ID = 'ev_route_boundary_safe';
const READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID = SAFE_ROUTE_HOSTILE_CANARIES.join(' ');

const READ_ONLY_ROUTE_BOUNDARY_WRITE_METHODS = [
  'appendEvent',
  'appendHeartbeat',
  'appendCollectorReport'
];

function withHostileRouteBoundaryQuery(pathname) {
  const separator = pathname.includes('?') ? '&' : '?';
  return `${pathname}${separator}ignored_hostile_id=${encodeURIComponent(
    READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID
  )}`;
}

function createReadOnlyRouteBoundaryStore(route) {
  const calls = [];
  const methods = route.methods;

  return {
    calls,
    store: new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property !== 'string') {
            return undefined;
          }

          return (...args) => {
            calls.push(property);

            if (READ_ONLY_ROUTE_BOUNDARY_WRITE_METHODS.includes(property)) {
              throw new Error(`${route.name} called write method ${property}`);
            }

            const method = methods[property];
            if (!method) {
              throw new Error(`${route.name} crossed route boundary into ${property}`);
            }

            return method(...args);
          };
        }
      }
    )
  };
}

function createReadOnlyRouteBoundaryEvidenceRecord() {
  return {
    evidence_id: READ_ONLY_ROUTE_BOUNDARY_SAFE_EVIDENCE_ID,
    agent_id: 'app-engineering',
    evidence_ref: 'route-boundary-safe-ref'
  };
}

function createSafeRouteCanaryCollectorReport() {
  return {
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 1,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 4,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        workspace_file: 1,
        tmux_observation: 1,
        hermes_profile: 1,
        task_evidence: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 4,
          source_kinds: ['workspace_file', 'tmux_observation', 'hermes_profile', 'kanban_fixture'],
          latest_evidence_at: '2026-03-09T18:05:40.000Z',
          confidence_level: 'high'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'safe-route-canary-tmux-session',
          pane_refs: ['tmux://safe-route-canary/0.1'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES
        }
      ],
      unmapped_hermes_sources: [
        {
          source_kind: 'hermes_session',
          evidence_ref: 'hermes://session/safe-route-canary',
          profile_id: 'profile-safe-route-canary',
          session_ref: 'session-safe-route-canary',
          observed_at: '2026-03-09T18:05:45.000Z',
          status: 'observed',
          degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES,
          metadata: {
            token: 'token=safe-route-canary',
            webhook: 'webhook-safe-route-canary'
          }
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: SAFE_ROUTE_HOSTILE_CANARIES,
        workspace_observations: [
          {
            path: '/tmp/safe-route-canary/runtime.json',
            file_name: 'runtime.json',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:20.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: 'safe-route-canary-tmux-session',
            window_index: '0',
            pane_index: '1',
            pane_id: '%91',
            pane_current_command: 'nvim',
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        hermes_runtime_observations: [
          {
            source_kind: 'hermes_profile',
            evidence_ref: 'hermes://profile/safe-route-canary',
            profile_id: 'profile-safe-route-canary',
            session_ref: 'session-safe-route-canary',
            status: 'observed',
            observed_at: '2026-03-09T18:05:35.000Z',
            degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES,
            source_provenance: {
              source_format: 'json_array',
              source_index: 0,
              source_input_ordinal: 1,
              source_file_ordinal: 1,
              payload: 'token=safe-route-canary',
              webhook: 'webhook-safe-route-canary'
            },
            metadata: {
              local_path: '/Users/safe-route-canary/private.json',
              callback_url: 'https://example.test/callback/safe-route-canary'
            }
          }
        ],
        task_evidence_observations: [
          {
            status: 'observed',
            task_ref: 'SAFE-ROUTE-101',
            source_kind: 'kanban_fixture',
            observed_at: '2026-03-09T18:05:40.000Z',
            correlation_id: 'safe-route-canary-task',
            source_provenance: {
              source_format: 'jsonl',
              source_index: 2,
              line: 7,
              source_input_ordinal: 3,
              source_file_ordinal: 4,
              webhook: 'webhook-safe-route-canary'
            }
          }
        ],
        source_health: {
          workspace_files: {
            status: 'degraded',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:20.000Z',
            degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: 'safe-route-canary-tmux-session',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES
          },
          hermes_profile: {
            status: 'observed',
            profile_id: 'profile-safe-route-canary',
            expected_session_ref: 'session-safe-route-canary',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:35.000Z',
            degraded_reasons: SAFE_ROUTE_HOSTILE_CANARIES
          }
        }
      }
    ]
  };
}

test('GET endpoints expose the seeded canonical scaffold', async (t) => {
  const { baseUrl } = await createHarness(t);

  const health = await requestJson(`${baseUrl}/health`);
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.agent_count, 7);

  const agents = await requestJson(`${baseUrl}/agents`);
  assert.equal(agents.response.status, 200);
  assert.equal(agents.body.items.length, 7);
  assert.ok(agents.body.items.some((agent) => agent.agent_id === 'product-pmf'));

  const agent = await requestJson(`${baseUrl}/agents/team-lead`);
  assert.equal(agent.response.status, 200);
  assert.equal(agent.body.item.agent_id, 'team-lead');

  const agentEvents = await requestJson(`${baseUrl}/agents/team-lead/events`);
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(agentEvents.body.items, []);

  const missing = await requestJson(`${baseUrl}/agents/missing-agent`);
  assert.equal(missing.response.status, 404);
});

test('GET /office/overview exposes seeded layout, empty zones, and watch edges', async (t) => {
  const { baseUrl } = await createHarness(t);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.generated_at, '2026-03-09T18:05:00.000Z');
  assert.equal(overview.body.summary.agent_count, 7);
  assert.equal(overview.body.summary.blocked_count, 0);
  assert.equal(overview.body.summary.reboot_recommended_count, 0);
  assert.deepEqual(overview.body.summary.severity_buckets, {
    normal: 7,
    yellow: 0,
    orange: 0,
    red: 0
  });
  assert.equal(overview.body.zones.length, 11);
  assert.equal(overview.body.watch_edges.length, 12);
  assert.equal(overview.body.agents.length, 7);

  const leadDesk = overview.body.zones.find((zone) => zone.zone_id === 'lead-desk');
  assert.deepEqual(leadDesk.occupants, []);

  const meetingZone = overview.body.zones.find((zone) => zone.zone_id === 'meeting-zone');
  assert.deepEqual(meetingZone.occupants, []);

  const reviewZone = overview.body.zones.find((zone) => zone.zone_id === 'review-zone');
  assert.equal(reviewZone.occupants.length, 1);
  assert.equal(reviewZone.occupants[0].agent_id, 'team-lead');

  assert.ok(
    overview.body.watch_edges.some(
      (edge) =>
        edge.from_agent_id === 'team-lead' &&
        edge.to_agent_id === 'app-engineering' &&
        edge.watch_mode === 'lead'
    )
  );
});

test('GET /office/operations exposes the active queue with agent_id, state, severity, and limit filters', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendHeartbeat({
    agent_id: 'market-intel',
    received_at: '2026-03-09T18:04:00.000Z',
    current_state: 'researching',
    active_task: 'Scan competitor notes',
    current_location: 'desk-market-intel',
    last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
    last_file_write_at: '2026-03-09T17:45:00.000Z',
    current_blocker: '',
    confidence_level: 'medium',
    reboot_recommended: false
  });

  await store.appendHeartbeat({
    agent_id: 'growth-revenue',
    received_at: '2026-03-09T18:04:10.000Z',
    current_state: 'coding',
    active_task: 'Repair outbound funnel notes',
    current_location: 'desk-growth-revenue',
    last_meaningful_output_at: '2026-03-09T17:35:00.000Z',
    last_file_write_at: '2026-03-09T17:35:00.000Z',
    current_blocker: '',
    confidence_level: 'low',
    reboot_recommended: true
  });

  await store.appendHeartbeat({
    agent_id: 'product-pmf',
    received_at: '2026-03-09T18:04:20.000Z',
    current_state: 'sleeping',
    active_task: 'Sleep until next lead task',
    current_location: 'rest-zone',
    last_meaningful_output_at: '2026-03-09T18:00:00.000Z',
    last_file_write_at: '2026-03-09T18:00:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_ops_blocked',
      ts: '2026-03-09T18:04:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Stop broken handler rollout',
      location: 'review-zone',
      summary: 'Peer watch found a severe regression',
      severity: 'red',
      correlationId: 'corr-ops-alert',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/ops-alert.md'],
      sourceKind: 'controller_event'
    })
  );

  const operations = await requestJson(`${baseUrl}/office/operations`);
  assert.equal(operations.response.status, 200);
  assert.equal(operations.body.generated_at, '2026-03-09T18:05:00.000Z');
  assert.deepEqual(operations.body.summary, {
    item_count: 4,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      coding: 1,
      researching: 1,
      reviewing: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 1,
      red: 1
    }
  });
  assert.deepEqual(
    operations.body.items.map((item) => item.agent_id),
    ['app-engineering', 'growth-revenue', 'market-intel', 'team-lead']
  );

  const blocked = operations.body.items[0];
  assert.deepEqual(blocked, {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    current_state: 'blocked',
    active_task: 'Stop broken handler rollout',
    current_blocker: 'Peer watch found a severe regression',
    current_location: 'review-zone',
    reported_severity: 'red',
    effective_severity: 'red',
    derived_staleness: {
      severity: 'normal',
      stale_for_ms: 30000,
      stale_for_minutes: 0,
      last_meaningful_output_at: '2026-03-09T18:04:30.000Z'
    },
    reboot_recommended: false,
    last_event_at: '2026-03-09T18:04:30.000Z',
    last_heartbeat_at: null,
    last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
    correlation_id: 'corr-ops-alert',
    latest_event: {
      event_id: 'evt_ops_blocked',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      ts: '2026-03-09T18:04:30.000Z',
      summary: 'Peer watch found a severe regression',
      source_kind: 'controller_event',
      evidence_refs: ['/tmp/ops-alert.md'],
      counterparty_agent_ids: ['protocol-engineering']
    }
  });

  const rebooting = operations.body.items[1];
  assert.equal(rebooting.agent_id, 'growth-revenue');
  assert.equal(rebooting.reported_severity, 'orange');
  assert.equal(rebooting.effective_severity, 'orange');
  assert.equal(rebooting.correlation_id, null);
  assert.equal(rebooting.latest_event, null);

  const filtered = await requestJson(`${baseUrl}/office/operations?state=blocked`);
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.summary, {
    item_count: 1,
    blocked_count: 1,
    reboot_recommended_count: 0,
    state_buckets: {
      blocked: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 1
    }
  });
  assert.deepEqual(filtered.body.items.map((item) => item.agent_id), ['app-engineering']);

  const severityFiltered = await requestJson(`${baseUrl}/office/operations?severity=yellow&limit=1`);
  assert.equal(severityFiltered.response.status, 200);
  assert.deepEqual(severityFiltered.body.items.map((item) => item.agent_id), ['market-intel']);
  assert.deepEqual(severityFiltered.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {
      researching: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 1,
      orange: 0,
      red: 0
    }
  });
  assert.equal(severityFiltered.body.items[0].reported_severity, 'normal');
  assert.equal(severityFiltered.body.items[0].effective_severity, 'yellow');

  const limited = await requestJson(`${baseUrl}/office/operations?limit=2`);
  assert.equal(limited.response.status, 200);
  assert.deepEqual(limited.body.items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);
  assert.deepEqual(limited.body.summary, {
    item_count: 2,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      coding: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 1,
      red: 1
    }
  });

  const selectedAgent = await requestJson(`${baseUrl}/office/operations?agent_id=growth-revenue`);
  assert.equal(selectedAgent.response.status, 200);
  assert.deepEqual(selectedAgent.body.items.map((item) => item.agent_id), ['growth-revenue']);
  assert.deepEqual(selectedAgent.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 1,
    state_buckets: {
      coding: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 1,
      red: 0
    }
  });

  const sleepingWithExplicitState = await requestJson(`${baseUrl}/office/operations?agent_id=product-pmf&state=sleeping`);
  assert.equal(sleepingWithExplicitState.response.status, 200);
  assert.deepEqual(sleepingWithExplicitState.body.items.map((item) => item.agent_id), ['product-pmf']);
  assert.deepEqual(sleepingWithExplicitState.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {
      sleeping: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 0,
      orange: 0,
      red: 0
    }
  });
});

test('GET /office/claim-audit returns aggregate evidence-backed counts only', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_http_claim_audit_backed',
      ts: '2026-03-09T18:04:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Audit HTTP claim surface',
      location: 'review-zone',
      summary: 'token=http-claim-audit-secret /tmp/http-claim-audit',
      severity: 'red',
      correlationId: 'corr-http-claim-audit',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/http-claim-audit.md'],
      sourceKind: 'controller_event'
    })
  );

  const response = await requestJson(
    `${baseUrl}/office/claim-audit?agent_id=app-engineering&surface=incident&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body, {
    items: [
      {
        surface: 'incident',
        claim_count: 1,
        evidence_backed_count: 1,
        missing_evidence_count: 0,
        safe_kind_buckets: { peer_watch_alert: 1, handoff: 0, reboot: 0 }
      }
    ]
  });

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('/tmp/http-claim-audit'), false);
  assert.equal(serialized.includes('token=http-claim-audit-secret'), false);
  assert.equal(serialized.includes('evt_http_claim_audit'), false);
  assert.equal(serialized.includes('corr-http-claim-audit'), false);

  const unknownSurface = await requestJson(`${baseUrl}/office/claim-audit?surface=tmux://secret`);
  assert.equal(unknownSurface.response.status, 200);
  assert.deepEqual(unknownSurface.body, { items: [] });
});

test('POST writes append records and projection endpoints query them', async (t) => {
  const { baseUrl, storeFile } = await createHarness(t);

  const heartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'coding',
      active_task: 'Implement HTTP handlers',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });

  assert.equal(heartbeat.response.status, 201);
  assert.equal(heartbeat.body.item.agent_id, 'app-engineering');
  assert.equal(heartbeat.body.item.current_location, 'desk-app-engineering');

  const event = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      event_id: 'evt_app_write',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Implement HTTP handlers',
      location: 'rest-zone',
      summary: 'Updated the HTTP server module',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'workspace_file',
      metadata: {
        file_path: '/tmp/server.js'
      }
    })
  });

  assert.equal(event.response.status, 201);
  assert.equal(event.body.item.event_type, 'agent_wrote_file');
  assert.equal(event.body.item.location, 'desk-app-engineering');

  const alert = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_peer_watch',
      ts: '2026-03-09T18:04:40.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      current_state: 'blocked',
      active_task: 'Investigate handler issue',
      location: 'desk-app-engineering',
      summary: 'Peer watch noticed missing validation',
      severity: 'orange',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(alert.response.status, 201);
  assert.equal(alert.body.item.location, 'review-zone');

  const handoff = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_handoff',
      ts: '2026-03-09T18:04:50.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_handoff_started',
      current_state: 'planning',
      active_task: 'Hand off API validation work',
      location: 'desk-app-engineering',
      summary: 'Lead initiated a handoff',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(handoff.response.status, 201);
  assert.equal(handoff.body.item.location, 'meeting-zone');

  const reboot = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_reboot',
      ts: '2026-03-09T18:05:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_reboot_requested',
      current_state: 'rebooting',
      active_task: 'Reset degraded context',
      location: 'desk-app-engineering',
      summary: 'Lead requested a reboot',
      severity: 'orange',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(reboot.response.status, 201);
  assert.equal(reboot.body.item.location, 'reboot-zone');

  const events = await requestJson(`${baseUrl}/events?agent_id=app-engineering&limit=2`);
  assert.equal(events.response.status, 200);
  assert.equal(events.body.items.length, 2);

  const agentEvents = await requestJson(`${baseUrl}/agents/app-engineering/events?limit=3`);
  assert.equal(agentEvents.response.status, 200);
  assert.equal(agentEvents.body.items.length, 3);

  const timeline = await requestJson(`${baseUrl}/timeline?window=15m`);
  assert.equal(timeline.response.status, 200);
  assert.ok(timeline.body.items.length >= 4);

  const alerts = await requestJson(`${baseUrl}/peer-watch/alerts?severity=orange`);
  assert.equal(alerts.response.status, 200);
  assert.equal(alerts.body.items.length, 1);
  assert.equal(alerts.body.items[0].status, 'open');

  const handoffs = await requestJson(`${baseUrl}/handoffs`);
  assert.equal(handoffs.response.status, 200);
  assert.equal(handoffs.body.items.length, 1);
  assert.equal(handoffs.body.items[0].phase, 'started');

  const reboots = await requestJson(`${baseUrl}/reboots`);
  assert.equal(reboots.response.status, 200);
  assert.equal(reboots.body.items.length, 1);
  assert.equal(reboots.body.items[0].phase, 'requested');

  const appEngineering = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(appEngineering.response.status, 200);
  assert.equal(appEngineering.body.item.current_state, 'rebooting');
  assert.equal(appEngineering.body.item.current_location, 'reboot-zone');
  assert.equal(appEngineering.body.item.last_event_id, 'evt_reboot');

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 5);
});

test('GET /timeline supports replay filters, evidence fields, and ascending limit slices', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Old replay artifact',
      location: 'desk-app-engineering',
      summary: 'Outside replay window',
      correlationId: 'corr-replay',
      evidenceRefs: ['/tmp/old-replay.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_1',
      ts: '2026-03-09T18:03:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Implement replay query',
      location: 'desk-app-engineering',
      summary: 'Wrote timeline replay query notes',
      correlationId: 'corr-replay',
      evidenceRefs: ['/tmp/replay-query.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_2',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix replay ordering',
      location: 'review-zone',
      summary: 'Lead escalated replay ordering issue',
      severity: 'orange',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/replay-alert.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_3',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review replay slice',
      location: 'review-zone',
      summary: 'Lead started replay slice review',
      severity: 'yellow',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/replay-review.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_4',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write unrelated artifact',
      location: 'desk-app-engineering',
      summary: 'Wrote unrelated artifact',
      correlationId: 'corr-other',
      evidenceRefs: ['/tmp/other-artifact.md']
    })
  );

  const agentTimeline = await requestJson(`${baseUrl}/timeline?window=30m&agent_id=app-engineering`);
  assert.equal(agentTimeline.response.status, 200);
  assert.deepEqual(
    agentTimeline.body.items.map((item) => item.event_id),
    ['evt_timeline_1', 'evt_timeline_2', 'evt_timeline_4']
  );

  const filtered = await requestJson(
    `${baseUrl}/timeline?window=30m&event_type=peer_watch_alert_raised&severity=orange&correlation_id=corr-replay`
  );
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.items, [
    {
      event_id: 'evt_timeline_2',
      ts: '2026-03-09T18:07:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'review-zone',
      summary: 'Lead escalated replay ordering issue',
      correlation_id: 'corr-replay',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/replay-alert.md'],
      source_kind: 'controller_event'
    }
  ]);

  const limited = await requestJson(`${baseUrl}/timeline?window=30m&correlation_id=corr-replay&limit=2`);
  assert.equal(limited.response.status, 200);
  assert.deepEqual(
    limited.body.items.map((item) => item.event_id),
    ['evt_timeline_2', 'evt_timeline_3']
  );
  assert.ok(Date.parse(limited.body.items[0].ts) < Date.parse(limited.body.items[1].ts));
});

test('GET /events and /timeline support additive exact event_id filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_exact_old',
      ts: '2026-03-09T17:55:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review exact replay filter',
      location: 'review-zone',
      summary: 'Older matching exact-filter event',
      severity: 'orange',
      correlationId: 'corr-exact-event',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/exact-old.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_exact_target',
      ts: '2026-03-09T18:20:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review exact replay filter',
      location: 'review-zone',
      summary: 'Target exact-filter event',
      severity: 'orange',
      correlationId: 'corr-exact-event',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/exact-target.md'],
      sourceKind: 'controller_event'
    })
  );

  const events = await requestJson(
    `${baseUrl}/events?event_id=evt_exact_target&agent_id=app-engineering&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&correlation_id=corr-exact-event`
  );
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_exact_target']
  );

  const timeline = await requestJson(
    `${baseUrl}/timeline?window=20m&event_id=evt_exact_target&agent_id=app-engineering&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&correlation_id=corr-exact-event`
  );
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_exact_target']
  );

  const windowedOut = await requestJson(`${baseUrl}/timeline?window=20m&event_id=evt_exact_old`);
  assert.equal(windowedOut.response.status, 200);
  assert.deepEqual(windowedOut.body.items, []);

  const mismatchedAgent = await requestJson(
    `${baseUrl}/events?event_id=evt_exact_target&agent_id=protocol-engineering`
  );
  assert.equal(mismatchedAgent.response.status, 200);
  assert.deepEqual(mismatchedAgent.body.items, []);
});

test('GET replay event endpoints support exact source_kind filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_workspace_old',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write provenance notes',
      location: 'desk-app-engineering',
      summary: 'Wrote workspace provenance notes',
      severity: 'yellow',
      correlationId: 'corr-source-agent',
      evidenceRefs: ['/tmp/source-workspace-old.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_controller_old',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review source-kind filter',
      location: 'review-zone',
      summary: 'Controller raised an older source-kind alert',
      severity: 'orange',
      correlationId: 'corr-source-agent',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/source-controller-old.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_controller_new',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review source-kind filter',
      location: 'review-zone',
      summary: 'Controller raised the newest source-kind alert',
      severity: 'orange',
      correlationId: 'corr-source-agent',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/source-controller-new.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_tmux_old',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_noted',
      currentState: 'researching',
      activeTask: 'Inspect earlier tmux observation',
      location: 'desk-growth-revenue',
      summary: 'Observed earlier replay state from tmux',
      severity: 'yellow',
      correlationId: 'corr-source-tmux',
      evidenceRefs: ['tmux://growth-revenue/0.0'],
      sourceKind: 'tmux_observation'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_tmux',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_noted',
      currentState: 'researching',
      activeTask: 'Inspect tmux observation',
      location: 'desk-growth-revenue',
      summary: 'Observed replay state from tmux',
      severity: 'yellow',
      correlationId: 'corr-source-tmux',
      evidenceRefs: ['tmux://growth-revenue/0.1'],
      sourceKind: 'tmux_observation'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_workspace_new',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write provenance notes',
      location: 'desk-app-engineering',
      summary: 'Wrote newer workspace provenance notes',
      severity: 'yellow',
      correlationId: 'corr-source-agent',
      evidenceRefs: ['/tmp/source-workspace-new.md'],
      sourceKind: 'workspace_file'
    })
  );

  const timeline = await requestJson(`${baseUrl}/timeline?window=30m&source_kind=tmux_observation`);
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_source_tmux_old', 'evt_source_tmux']
  );
  assert.ok(timeline.body.items.every((item) => item.source_kind === 'tmux_observation'));
  assert.ok(Date.parse(timeline.body.items[0].ts) < Date.parse(timeline.body.items[1].ts));

  const events = await requestJson(
    `${baseUrl}/events?event_type=peer_watch_alert_raised&source_kind=controller_event`
  );
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_source_controller_new', 'evt_source_controller_old']
  );
  assert.ok(events.body.items.every((item) => item.source_kind === 'controller_event'));

  const agentEvents = await requestJson(
    `${baseUrl}/agents/app-engineering/events?source_kind=workspace_file&event_type=agent_wrote_file&severity=yellow&correlation_id=corr-source-agent&limit=1`
  );
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(
    agentEvents.body.items.map((item) => item.event_id),
    ['evt_source_workspace_new']
  );
  assert.ok(agentEvents.body.items.every((item) => item.source_kind === 'workspace_file'));

  const unknownAgent = await requestJson(`${baseUrl}/agents/unknown-agent/events?source_kind=workspace_file`);
  assert.equal(unknownAgent.response.status, 404);
  assert.equal(unknownAgent.body.details, 'unknown agent');
});

test('GET replay event endpoints support exact evidence_ref filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });
  const exactRef = '/tmp/evidence-ref.md';
  const encodedExactRef = encodeURIComponent(exactRef);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_exact_old',
      ts: '2026-03-09T18:02:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write evidence replay notes',
      location: 'desk-app-engineering',
      summary: 'Older exact evidence ref match',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef, '/tmp/evidence-extra.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_substring',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write substring replay notes',
      location: 'desk-app-engineering',
      summary: 'Only contains the target as a substring',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [`${exactRef}.backup`],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_exact_new',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write exact replay notes',
      location: 'desk-app-engineering',
      summary: 'Newer exact evidence ref match',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_other_agent',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write protocol replay notes',
      location: 'desk-protocol-engineering',
      summary: 'Exact evidence ref match on another agent',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef],
      sourceKind: 'workspace_file'
    })
  );

  const events = await requestJson(`${baseUrl}/events?evidence_ref=${encodedExactRef}`);
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_evidence_other_agent', 'evt_evidence_exact_new', 'evt_evidence_exact_old']
  );
  assert.ok(events.body.items.every((item) => item.evidence_refs.includes(exactRef)));

  const composedEvents = await requestJson(
    `${baseUrl}/events?evidence_ref=${encodedExactRef}&agent_id=app-engineering&event_type=agent_wrote_file&severity=yellow&source_kind=workspace_file&correlation_id=corr-evidence-ref&limit=1`
  );
  assert.equal(composedEvents.response.status, 200);
  assert.deepEqual(
    composedEvents.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_new']
  );

  const blankEvidenceRef = await requestJson(`${baseUrl}/events?evidence_ref=&limit=2`);
  const missingEvidenceRef = await requestJson(`${baseUrl}/events?limit=2`);
  assert.equal(blankEvidenceRef.response.status, 200);
  assert.deepEqual(
    blankEvidenceRef.body.items.map((item) => item.event_id),
    missingEvidenceRef.body.items.map((item) => item.event_id)
  );

  const agentEvents = await requestJson(
    `${baseUrl}/agents/app-engineering/events?evidence_ref=${encodedExactRef}&event_type=agent_wrote_file&limit=5`
  );
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(
    agentEvents.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_new', 'evt_evidence_exact_old']
  );

  const unknownAgent = await requestJson(`${baseUrl}/agents/unknown-agent/events?evidence_ref=${encodedExactRef}`);
  assert.equal(unknownAgent.response.status, 404);
  assert.equal(unknownAgent.body.details, 'unknown agent');

  const timeline = await requestJson(
    `${baseUrl}/timeline?window=30m&evidence_ref=${encodedExactRef}&agent_id=app-engineering&event_type=agent_wrote_file&severity=yellow&source_kind=workspace_file&correlation_id=corr-evidence-ref&limit=2`
  );
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_old', 'evt_evidence_exact_new']
  );
  assert.ok(Date.parse(timeline.body.items[0].ts) < Date.parse(timeline.body.items[1].ts));
});

test('GET interaction endpoints expose derived read models and filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_started',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review interaction endpoint',
      summary: 'Lead started interaction review',
      severity: 'yellow',
      correlationId: 'review-456',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_completed',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review interaction endpoint',
      summary: 'Lead completed interaction review',
      severity: 'normal',
      correlationId: 'review-456',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_handoff_started',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off endpoint cleanup',
      summary: 'Lead started a handoff',
      severity: 'orange',
      correlationId: 'handoff-1',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/handoff.md']
    })
  );

  const interactions = await requestJson(
    `${baseUrl}/interactions?interaction_type=review&counterparty_agent_id=protocol-engineering&limit=1`
  );
  assert.equal(interactions.response.status, 200);
  assert.equal(interactions.body.items.length, 1);
  assert.equal(interactions.body.items[0].interaction_type, 'review');
  assert.equal(interactions.body.items[0].ended_at, '2026-03-09T18:12:00.000Z');
  assert.equal(interactions.body.items[0].source_kind, 'controller_event');
  assert.deepEqual(interactions.body.items[0].related_event_ids, [
    'evt_review_started',
    'evt_review_completed'
  ]);

  const byCompletedEvent = await requestJson(
    `${baseUrl}/interactions?event_id=evt_review_completed`
  );
  assert.equal(byCompletedEvent.response.status, 200);
  assert.deepEqual(
    byCompletedEvent.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const byEvidenceRef = await requestJson(
    `${baseUrl}/interactions?evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(byEvidenceRef.response.status, 200);
  assert.deepEqual(
    byEvidenceRef.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const agentExactEvidence = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?event_id=evt_review_started&evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(agentExactEvidence.response.status, 200);
  assert.equal(agentExactEvidence.body.agent_id, 'app-engineering');
  assert.deepEqual(
    agentExactEvidence.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const mismatchedExactEvidence = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?event_id=evt_handoff_started&evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(mismatchedExactEvidence.response.status, 200);
  assert.deepEqual(mismatchedExactEvidence.body.items, []);

  const windowed = await requestJson(`${baseUrl}/interactions?window=5m`);
  assert.equal(windowed.response.status, 200);
  assert.equal(windowed.body.items.length, 1);
  assert.equal(windowed.body.items[0].interaction_type, 'handoff');

  const agentInteractions = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?counterparty_agent_id=protocol-engineering&severity=yellow`
  );
  assert.equal(agentInteractions.response.status, 200);
  assert.equal(agentInteractions.body.agent_id, 'app-engineering');
  assert.equal(agentInteractions.body.items.length, 1);
  assert.equal(agentInteractions.body.items[0].correlation_id, 'review-456');
  assert.equal(agentInteractions.body.items[0].source_kind, 'controller_event');

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/interactions`);
  assert.equal(missingAgent.response.status, 404);
});

test('GET /agents/:id includes recent evidence surfaces while preserving the current snapshot', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendHeartbeat({
    agent_id: 'app-engineering',
    actor_id: 'app-engineering',
    received_at: '2026-03-09T18:19:00.000Z',
    current_state: 'coding',
    active_task: 'Harden agent detail query',
    current_location: 'desk-app-engineering',
    last_meaningful_output_at: '2026-03-09T18:18:00.000Z',
    last_file_write_at: '2026-03-09T18:18:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_alert_open',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate failing query',
      summary: 'Lead raised an open peer-watch alert',
      severity: 'orange',
      correlationId: 'corr-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/agent-detail-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_started_detail',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review enriched agent detail',
      summary: 'Lead started agent detail review',
      severity: 'yellow',
      correlationId: 'review-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-start-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_completed_detail',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review enriched agent detail',
      summary: 'Lead completed agent detail review',
      severity: 'normal',
      correlationId: 'review-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-end-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_handoff_detail',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off alert follow-up',
      summary: 'Lead started a handoff for agent detail work',
      severity: 'normal',
      correlationId: 'handoff-agent-detail',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/handoff-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_reboot_detail',
      ts: '2026-03-09T18:18:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset query context',
      summary: 'Lead requested a reboot for agent detail work',
      severity: 'orange',
      correlationId: 'reboot-agent-detail',
      evidenceRefs: ['/tmp/reboot-detail.md']
    })
  );

  const response = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.agent_id, 'app-engineering');
  assert.equal(response.body.item.last_event_id, 'evt_reboot_detail');
  assert.equal(response.body.item.latest_heartbeat.received_at, '2026-03-09T18:19:00.000Z');
  assert.equal(response.body.item.open_peer_watch_alerts.length, 1);
  assert.equal(response.body.item.open_peer_watch_alerts[0].alert_id, 'evt_alert_open');
  assert.equal(response.body.item.recent_events.length, 5);
  assert.equal(response.body.item.recent_events[0].event_id, 'evt_reboot_detail');
  assert.equal(response.body.item.recent_interactions.length, 3);
  assert.equal(response.body.item.recent_interactions[0].interaction_type, 'handoff');
  assert.equal(response.body.item.recent_incidents.length, 3);
  assert.equal(response.body.item.recent_incidents[0].incident_id, 'evt_reboot_detail');
  assert.equal(response.body.item.recent_handoffs.length, 1);
  assert.equal(response.body.item.recent_handoffs[0].handoff_id, 'evt_handoff_detail');
  assert.equal(response.body.item.recent_reboots.length, 1);
  assert.equal(response.body.item.recent_reboots[0].reboot_id, 'evt_reboot_detail');

  const limited = await requestJson(`${baseUrl}/agents/app-engineering?limit=2`);
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.item.recent_events.length, 2);
  assert.equal(limited.body.item.recent_interactions.length, 2);
  assert.equal(limited.body.item.recent_incidents.length, 2);
  assert.equal(limited.body.item.recent_incidents[0].incident_id, 'evt_reboot_detail');
});

test('GET /agents/:id/workflow aggregates detail with default 60m window and per-slice limits', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T19:00:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_old_alert',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate old workflow issue',
      summary: 'Old workflow incident outside the default window',
      severity: 'yellow',
      correlationId: 'corr-workflow-old',
      counterpartyAgentIds: ['market-intel'],
      evidenceRefs: ['/tmp/workflow-old-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_review_started',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review workflow aggregation',
      summary: 'Lead started workflow review',
      severity: 'yellow',
      correlationId: 'corr-workflow-review',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_review_completed',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review workflow aggregation',
      summary: 'Lead completed workflow review',
      correlationId: 'corr-workflow-review',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_peer_watch',
      ts: '2026-03-09T18:40:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix workflow incident',
      summary: 'Protocol engineering escalated workflow evidence',
      severity: 'orange',
      correlationId: 'corr-workflow-peer-watch',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-peer-watch.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_handoff_started',
      ts: '2026-03-09T18:45:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off workflow follow-up',
      summary: 'Lead started workflow handoff',
      severity: 'yellow',
      correlationId: 'corr-workflow-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/workflow-handoff-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_handoff_completed',
      ts: '2026-03-09T18:46:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off workflow follow-up',
      summary: 'Lead completed workflow handoff',
      correlationId: 'corr-workflow-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/workflow-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_reboot',
      ts: '2026-03-09T18:50:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset workflow context',
      summary: 'Lead requested a workflow reboot',
      severity: 'red',
      correlationId: 'corr-workflow-reboot',
      evidenceRefs: ['/tmp/workflow-reboot.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_write',
      ts: '2026-03-09T18:55:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write workflow notes',
      summary: 'Agent wrote workflow notes',
      correlationId: 'corr-workflow-write',
      evidenceRefs: ['/tmp/workflow-write.md']
    })
  );

  const defaultWindow = await requestJson(`${baseUrl}/agents/app-engineering/workflow?limit=10`);
  assert.equal(defaultWindow.response.status, 200);
  assert.equal(defaultWindow.body.agent_id, 'app-engineering');
  assert.equal(defaultWindow.body.detail.agent_id, 'app-engineering');
  assert.equal(defaultWindow.body.detail.recent_events.length, 8);
  assert.equal(defaultWindow.body.detail.recent_incidents.length, 5);
  assert.equal(defaultWindow.body.detail.recent_incidents.at(-1).incident_id, 'evt_workflow_old_alert');
  assert.equal(defaultWindow.body.detail.recent_interactions.length, 4);
  assert.equal(
    defaultWindow.body.detail.recent_interactions.at(-1).interaction_id,
    'interaction:evt_workflow_old_alert'
  );
  assert.deepEqual(defaultWindow.body.summary, {
    incident_count: 4,
    interaction_count: 3,
    event_count: 7,
    incident_kind_buckets: {
      reboot: 1,
      handoff: 2,
      peer_watch_alert: 1
    },
    interaction_type_buckets: {
      handoff: 1,
      peer_watch: 1,
      review: 1
    },
    event_type_buckets: {
      review_started: 1,
      review_completed: 1,
      peer_watch_alert_raised: 1,
      agent_handoff_started: 1,
      agent_handoff_completed: 1,
      agent_reboot_requested: 1,
      agent_wrote_file: 1
    },
    severity_buckets: {
      normal: 4,
      yellow: 5,
      orange: 3,
      red: 2
    },
    latest_activity_at: '2026-03-09T18:55:00.000Z'
  });
  assert.deepEqual(
    defaultWindow.body.incidents.map((item) => item.incident_id),
    [
      'evt_workflow_reboot',
      'evt_workflow_handoff_completed',
      'evt_workflow_handoff_started',
      'evt_workflow_peer_watch'
    ]
  );
  assert.deepEqual(
    defaultWindow.body.interactions.map((item) => item.interaction_id),
    [
      'interaction:evt_workflow_handoff_started',
      'interaction:evt_workflow_peer_watch',
      'interaction:evt_workflow_review_started'
    ]
  );
  assert.deepEqual(
    defaultWindow.body.timeline.map((item) => item.event_id),
    [
      'evt_workflow_review_started',
      'evt_workflow_review_completed',
      'evt_workflow_peer_watch',
      'evt_workflow_handoff_started',
      'evt_workflow_handoff_completed',
      'evt_workflow_reboot',
      'evt_workflow_write'
    ]
  );
  assert.deepEqual(defaultWindow.body.correlation_ids, [
    'corr-workflow-handoff',
    'corr-workflow-peer-watch',
    'corr-workflow-reboot',
    'corr-workflow-review',
    'corr-workflow-write'
  ]);
  assert.deepEqual(defaultWindow.body.counterparty_agent_ids, [
    'growth-revenue',
    'protocol-engineering'
  ]);
  assert.equal(defaultWindow.body.counterparty_agent_ids.includes('app-engineering'), false);
  assert.equal(defaultWindow.body.counterparty_agent_ids.includes('team-lead'), false);

  const limited = await requestJson(
    `${baseUrl}/agents/app-engineering/workflow?window=20m&limit=2`
  );
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.detail.recent_events.length, 2);
  assert.deepEqual(
    limited.body.detail.recent_events.map((item) => item.event_id),
    ['evt_workflow_write', 'evt_workflow_reboot']
  );
  assert.equal(limited.body.detail.recent_interactions.length, 2);
  assert.equal(limited.body.detail.recent_incidents.length, 2);
  assert.deepEqual(
    limited.body.incidents.map((item) => item.incident_id),
    ['evt_workflow_reboot', 'evt_workflow_handoff_completed']
  );
  assert.deepEqual(
    limited.body.interactions.map((item) => item.interaction_id),
    ['interaction:evt_workflow_handoff_started', 'interaction:evt_workflow_peer_watch']
  );
  assert.deepEqual(
    limited.body.timeline.map((item) => item.event_id),
    ['evt_workflow_reboot', 'evt_workflow_write']
  );
  assert.deepEqual(limited.body.summary, {
    incident_count: 2,
    interaction_count: 2,
    event_count: 2,
    incident_kind_buckets: {
      reboot: 1,
      handoff: 1
    },
    interaction_type_buckets: {
      handoff: 1,
      peer_watch: 1
    },
    event_type_buckets: {
      agent_reboot_requested: 1,
      agent_wrote_file: 1
    },
    severity_buckets: {
      normal: 2,
      yellow: 1,
      orange: 1,
      red: 2
    },
    latest_activity_at: '2026-03-09T18:55:00.000Z'
  });
  assert.deepEqual(limited.body.correlation_ids, [
    'corr-workflow-handoff',
    'corr-workflow-peer-watch',
    'corr-workflow-reboot',
    'corr-workflow-write'
  ]);
  assert.deepEqual(limited.body.counterparty_agent_ids, [
    'growth-revenue',
    'protocol-engineering'
  ]);
  assert.equal(limited.body.counterparty_agent_ids.includes('app-engineering'), false);
  assert.equal(limited.body.counterparty_agent_ids.includes('team-lead'), false);
});

test('GET /agents/:id/workflow returns 404 for unknown agents', async (t) => {
  const { baseUrl } = await createHarness(t);

  const response = await requestJson(`${baseUrl}/agents/missing-agent/workflow`);
  assert.equal(response.response.status, 404);
  assert.equal(response.body.error, 'not_found');
});

test('GET /agents/:id/evidence-spine returns bounded safe aggregate read-only', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET evidence spine must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const recordCountBeforeRead = store.records.length;

  const response = await requestJson(
    `${baseUrl}/agents/app-engineering/evidence-spine?source_kind=workspace_file&output_candidate=true&newest_first=true&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.agent_id, 'app-engineering');
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.evidence_summary.total_count, 1);
  assert.deepEqual(response.body.item.recent_evidence, [
    {
      observed_at: '2026-03-09T18:05:00.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      unmapped: false
    }
  ]);
  assert.equal(response.body.item.source_gaps.summary.total_count, 1);
  assert.equal(response.body.item.source_health.agent_items.length, 1);
  assert.equal(Object.hasOwn(response.body.item.source_health, 'runtime_source_evidence'), false);
  assert.equal(collectCount, 0);
  assert.equal(store.records.length, recordCountBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('/tmp/route-parity'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('runtime_source_evidence'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
});

test('GET /agents/:id/evidence-spine redacts runtime source details and filters before limit', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendCollectorReport(createEvidenceSpineRedactionCollectorReport());

  const response = await requestJson(
    `${baseUrl}/agents/app-engineering/evidence-spine?source_kind=hermes_profile&newest_first=true&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.agent_id, 'app-engineering');
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.evidence_summary.total_count, 1);
  assert.equal(response.body.item.evidence_summary.source_kind_buckets.hermes_profile, 1);
  assert.deepEqual(
    response.body.item.recent_evidence.map((record) => record.source_kind),
    ['hermes_profile']
  );
  assert.equal(response.body.item.source_health.summary.agent_count, 1);
  assert.equal(
    response.body.item.source_health.summary.source_kind_buckets.hermes_profile.observed,
    1
  );
  assert.equal(response.body.item.source_health.agent_items[0].evidence_count, 3);
  assert.equal(
    Object.hasOwn(response.body.item.source_health.agent_items[0], 'evidence_ref_count'),
    false
  );

  assertNoEvidenceSpineRuntimeLeak(response.body, { allowCollectorAnchors: true });
});

test('GET /agents/:id/evidence-spine supports status alias without leaking unknown filters', async (t) => {
  const store = await createDirectStore();

  await store.appendCollectorReport(createEvidenceSpineRedactionCollectorReport());

  const response = await requestJsonDirect({
    url: '/agents/app-engineering/evidence-spine?status=degraded&source_kind=workspace_file&evidence_role=agent_output&newest_first=true&limit=1&metadata=token=redaction-filter',
    store
  });
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.evidence_summary.total_count, 1);
  assert.deepEqual(
    response.body.item.recent_evidence.map((record) => record.source_status),
    ['degraded']
  );
  assert.equal(response.body.item.source_gaps.summary.total_count, 1);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('token=redaction-filter'), false);
  assertNoEvidenceSpineRuntimeLeak(response.body, { allowCollectorAnchors: true });
});

test('GET /agents/evidence-spine/summary returns compact seven-agent evidence summary read-only', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET evidence spine summary must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const recordCountBeforeRead = store.records.length;

  const response = await requestJson(
    `${baseUrl}/agents/evidence-spine/summary?output_candidate=false&newest_first=true&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(
    response.body.item.agents.map((agent) => agent.agent_id),
    [
      'team-lead',
      'market-intel',
      'product-pmf',
      'tokenomics',
      'protocol-engineering',
      'app-engineering',
      'growth-revenue'
    ]
  );
  assert.equal(response.body.item.agent_count, 7);
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.total_count, 4);
  assert.equal(response.body.item.mapped_count, 3);
  assert.equal(response.body.item.unmapped_count, 1);
  assert.equal(
    response.body.item.agents.reduce((total, agent) => total + agent.evidence_count, 0),
    3
  );
  assert.equal(response.body.item.unmapped_evidence_summary.total_count, 1);
  assert.equal(response.body.item.unmapped_evidence_summary.source_kind_buckets.tmux_observation, 1);
  assert.equal(response.body.item.unmapped_evidence_summary.latest_observed_at, '2026-03-09T18:05:50.000Z');
  assert.equal(collectCount, 0);
  assert.equal(store.records.length, recordCountBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('evidence_id'), false);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('/tmp/route-parity'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
});

test('GET /agents/evidence-spine/summary stays compact under runtime canaries and filters before limit', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendCollectorReport(createEvidenceSpineRedactionCollectorReport());

  const response = await requestJson(
    `${baseUrl}/agents/evidence-spine/summary?source_kind=kanban_fixture&newest_first=true&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.agent_count, 7);
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.total_count, 1);
  assert.equal(response.body.item.mapped_count, 1);
  assert.equal(response.body.item.unmapped_count, 0);

  const appSummary = response.body.item.agents.find(
    (agent) => agent.agent_id === 'app-engineering'
  );
  assert.ok(appSummary);
  assert.equal(appSummary.evidence_count, 1);
  assert.equal(appSummary.source_kind_buckets.kanban_fixture, 1);
  assert.equal(appSummary.latest_observed_at, '2026-03-09T18:07:25.000Z');

  assertNoEvidenceSpineRuntimeLeak(response.body);
});

test('GET /agents/evidence-spine/source-matrix returns source-matrix read route purity', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET source matrix must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const recordCountBeforeRead = store.records.length;

  const response = await requestJson(
    `${baseUrl}/agents/evidence-spine/source-matrix?source_kind=workspace_file&output_candidate=true&newest_first=true&limit=1`
  );

  assert.equal(response.response.status, 200);
  assert.deepEqual(
    response.body.item.agents.map((agent) => agent.agent_id),
    [
      'team-lead',
      'market-intel',
      'product-pmf',
      'tokenomics',
      'protocol-engineering',
      'app-engineering',
      'growth-revenue'
    ]
  );
  assert.equal(response.body.item.agent_count, 7);
  assert.equal(response.body.item.returned_limit, 1);
  assert.equal(response.body.item.total_count, 1);
  assert.equal(response.body.item.mapped_count, 1);
  assert.equal(response.body.item.unmapped_count, 0);

  const appMatrix = response.body.item.agents.find(
    (agent) => agent.agent_id === 'app-engineering'
  );
  assert.deepEqual(appMatrix.sources, [
    {
      source_kind: 'workspace_file',
      evidence_count: 1,
      source_status_buckets: {
        observed: 0,
        degraded: 1,
        missing: 0,
        error: 0
      },
      evidence_role_buckets: {
        workspace_presence: 0,
        inbound_task: 0,
        agent_output: 1,
        agent_plan: 0,
        runtime_activity: 0,
        runtime_presence: 0,
        runtime_unmapped: 0,
        task_reference: 0
      },
      output_candidate_buckets: {
        true: 1,
        false: 0
      },
      latest_observed_at: '2026-03-09T18:05:00.000Z',
      latest_collected_at: '2026-03-09T18:06:00.000Z'
    }
  ]);
  assert.equal(response.body.item.unmapped_evidence_summary.total_count, 0);
  assert.equal(collectCount, 0);
  assert.equal(store.records.length, recordCountBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  assertNoEvidenceSpineRuntimeLeak(response.body);
});

test('GET /agents/:id/evidence-spine returns 404 for unknown agents', async (t) => {
  const store = await createDirectStore();

  const response = await requestJsonDirect({
    url: `/agents/${encodeURIComponent('tmux://secret-session')}/evidence-spine`,
    store
  });
  assert.equal(response.response.status, 404);
  assert.equal(response.body.error, 'not_found');
  assert.equal(response.body.details, 'unknown_agent');
  assert.equal(JSON.stringify(response.body).includes('tmux://secret-session'), false);
});

test('GET public unknown agent, correlation, and fallback 404s do not echo unsafe params', async () => {
  const store = await createDirectStore();
  const unsafeUnknownIds = [
    '/tmp/public-404-no-echo/outbox.md',
    '/Users/cwp/private/public-404-no-echo.md',
    '/Volumes/HDD/private/public-404-no-echo.md',
    'tmux://public-404-no-echo/0.1',
    'hermes://profile/public-404-no-echo',
    'profile://public-404-no-echo',
    'session://public-404-no-echo',
    'file:///tmp/public-404-no-echo.md',
    'token=public-404-no-echo',
    'https://hooks.slack.com/services/public-404-no-echo',
    'webhook-public-404-no-echo',
    'secret-public-404-no-echo',
    'control-plane-public-404-no-echo'
  ];

  for (const unsafeUnknownId of unsafeUnknownIds) {
    const routes = [
      `/agents/${encodeURIComponent(unsafeUnknownId)}`,
      `/agents/${encodeURIComponent(unsafeUnknownId)}/events`,
      `/agents/${encodeURIComponent(unsafeUnknownId)}/interactions`,
      `/agents/${encodeURIComponent(unsafeUnknownId)}/incidents`,
      `/agents/${encodeURIComponent(unsafeUnknownId)}/workflow`,
      `/correlations/${encodeURIComponent(unsafeUnknownId)}`,
      `/${encodeURIComponent(unsafeUnknownId)}`
    ];

    for (const route of routes) {
      const response = await requestJsonDirect({ url: route, store });
      assertPublic404DoesNotExposeCanary(response, unsafeUnknownId);
    }
  }
});

test('GET /peer-watch/alerts supports evidence-oriented filters and fields', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_open_target',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix evidence query',
      summary: 'Protocol engineering escalated missing evidence',
      severity: 'orange',
      correlationId: 'corr-open-target',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/evidence-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_resolved_target',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_resolved',
      currentState: 'coding',
      activeTask: 'Fix evidence query',
      summary: 'Protocol engineering confirmed the evidence fix',
      severity: 'orange',
      correlationId: 'corr-open-target',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/evidence-resolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_other',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale market notes',
      summary: 'Growth revenue escalated stale evidence',
      severity: 'yellow',
      correlationId: 'corr-other',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/evidence-other.md']
    })
  );

  const filtered = await requestJson(
    `${baseUrl}/peer-watch/alerts?status=open&target_agent_id=market-intel&watcher_agent_id=growth-revenue&observer_agent_id=team-lead&correlation_id=corr-other&severity=yellow&limit=1`
  );
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].alert_id, 'evt_peer_watch_other');
  assert.equal(filtered.body.items[0].target_agent_id, 'market-intel');
  assert.equal(filtered.body.items[0].observer_agent_id, 'team-lead');
  assert.deepEqual(filtered.body.items[0].watcher_agent_ids, ['growth-revenue']);
  assert.equal(filtered.body.items[0].evidence_count, 1);
  assert.equal(filtered.body.items[0].status, 'open');
  assert.equal(filtered.body.items[0].correlation_id, 'corr-other');

  const backwardsCompatible = await requestJson(
    `${baseUrl}/peer-watch/alerts?agent_id=app-engineering&status=resolved`
  );
  assert.equal(backwardsCompatible.response.status, 200);
  assert.equal(backwardsCompatible.body.items.length, 1);
  assert.equal(backwardsCompatible.body.items[0].alert_id, 'evt_peer_watch_resolved_target');
  assert.equal(backwardsCompatible.body.items[0].agent_id, 'app-engineering');

  const currentlyOpen = await requestJson(
    `${baseUrl}/peer-watch/alerts?agent_id=app-engineering&status=open`
  );
  assert.equal(currentlyOpen.response.status, 200);
  assert.deepEqual(currentlyOpen.body.items, []);
});

test('GET /incidents exposes a descending normalized incident feed with read-only filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale notes',
      summary: 'Old incident outside the feed window',
      severity: 'yellow',
      correlationId: 'corr-old-incident',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/incident-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_unresolved',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Track unresolved incident',
      summary: 'Protocol engineering left a second incident open',
      severity: 'orange',
      correlationId: 'corr-incident-open',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-unresolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_open',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix incident query',
      summary: 'Protocol engineering raised an active incident',
      severity: 'orange',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_resolved',
      ts: '2026-03-09T18:09:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_resolved',
      currentState: 'coding',
      activeTask: 'Fix incident query',
      summary: 'Protocol engineering cleared the active incident',
      severity: 'orange',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-resolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_handoff_started',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off the incident follow-up',
      summary: 'Lead started an incident handoff',
      severity: 'yellow',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/incident-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off the incident follow-up',
      summary: 'Lead completed the incident handoff',
      severity: 'normal',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/incident-handoff-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_reboot_requested',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset stale incident context',
      summary: 'Lead requested a reboot for the incident follow-up',
      severity: 'red',
      correlationId: 'corr-incident-reboot',
      evidenceRefs: ['/tmp/incident-reboot.md']
    })
  );

  const feed = await requestJson(`${baseUrl}/incidents?limit=4`);
  assert.equal(feed.response.status, 200);
  assert.deepEqual(
    feed.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_handoff_completed',
      'evt_incident_handoff_started',
      'evt_incident_alert_resolved'
    ]
  );
  assert.deepEqual(feed.body.items[0], {
    incident_id: 'evt_incident_reboot_requested',
    kind: 'reboot',
    ts: '2026-03-09T18:18:00.000Z',
    agent_id: 'market-intel',
    actor_id: 'team-lead',
    status: 'requested',
    severity: 'red',
    summary: 'Lead requested a reboot for the incident follow-up',
    correlation_id: 'corr-incident-reboot',
    evidence_refs: ['/tmp/incident-reboot.md'],
    counterparty_agent_ids: [],
    source_kind: 'controller_event'
  });

  const handoffOnly = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=app-engineering&severity=yellow&status=started&correlation_id=corr-incident-feed&limit=2`
  );
  assert.equal(handoffOnly.response.status, 200);
  assert.deepEqual(handoffOnly.body.items, [
    {
      incident_id: 'evt_incident_handoff_started',
      kind: 'handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'started',
      severity: 'yellow',
      summary: 'Lead started an incident handoff',
      correlation_id: 'corr-incident-feed',
      evidence_refs: ['/tmp/incident-handoff-started.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ]);

  const recentWindow = await requestJson(`${baseUrl}/incidents?window=10m`);
  assert.equal(recentWindow.response.status, 200);
  assert.deepEqual(
    recentWindow.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_handoff_completed',
      'evt_incident_handoff_started'
    ]
  );

  const openPeerWatch = await requestJson(
    `${baseUrl}/incidents?kind=peer_watch_alert&status=open&agent_id=app-engineering&severity=orange&correlation_id=corr-incident-open`
  );
  assert.equal(openPeerWatch.response.status, 200);
  assert.deepEqual(openPeerWatch.body.items, [
    {
      incident_id: 'evt_incident_alert_unresolved',
      kind: 'peer_watch_alert',
      ts: '2026-03-09T18:07:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Protocol engineering left a second incident open',
      correlation_id: 'corr-incident-open',
      evidence_refs: ['/tmp/incident-alert-unresolved.md'],
      counterparty_agent_ids: ['protocol-engineering'],
      source_kind: 'controller_event'
    }
  ]);

  const openActiveIncidents = await requestJson(
    `${baseUrl}/incidents?status=open&window=20m`
  );
  assert.equal(openActiveIncidents.response.status, 200);
  assert.deepEqual(
    openActiveIncidents.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_alert_unresolved'
    ]
  );

  const completedIncidents = await requestJson(
    `${baseUrl}/incidents?status=completed&correlation_id=corr-incident-feed`
  );
  assert.equal(completedIncidents.response.status, 200);
  assert.deepEqual(
    completedIncidents.body.items.map((item) => item.incident_id),
    ['evt_incident_handoff_completed']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_reboot_one',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset first blank-correlation reboot',
      summary: 'Lead requested the first blank-correlation reboot',
      severity: 'yellow',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-reboot-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_reboot_two',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset second blank-correlation reboot',
      summary: 'Lead requested the second blank-correlation reboot',
      severity: 'orange',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-reboot-two.md']
    })
  );

  const concurrentBlankReboots = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=product-pmf&status=open&window=20m`
  );
  assert.equal(concurrentBlankReboots.response.status, 200);
  assert.deepEqual(
    concurrentBlankReboots.body.items.map((item) => item.incident_id),
    ['evt_incident_blank_reboot_two', 'evt_incident_blank_reboot_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlated_reboot_one',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset first correlated reboot',
      summary: 'Lead requested the first correlated reboot',
      severity: 'yellow',
      correlationId: 'corr-blank-completion-one',
      evidenceRefs: ['/tmp/correlated-reboot-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlated_reboot_two',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset second correlated reboot',
      summary: 'Lead requested the second correlated reboot',
      severity: 'orange',
      correlationId: 'corr-blank-completion-two',
      evidenceRefs: ['/tmp/correlated-reboot-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_correlation_reboot_completed',
      ts: '2026-03-09T18:19:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Ignore ambiguous blank-correlation completion',
      summary: 'Lead completed an ambiguous blank-correlation reboot',
      severity: 'normal',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-correlation-reboot-completed.md']
    })
  );

  const blankCorrelationCompletionReboots = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=market-intel&status=open&correlation_id=corr-blank-completion-two&window=20m`
  );
  assert.equal(blankCorrelationCompletionReboots.response.status, 200);
  assert.deepEqual(
    blankCorrelationCompletionReboots.body.items.map((item) => item.incident_id),
    ['evt_incident_correlated_reboot_two']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_one',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start first ambiguous handoff',
      summary: 'Lead started the first ambiguous handoff',
      severity: 'yellow',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/ambiguous-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_two',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start second ambiguous handoff',
      summary: 'Lead started the second ambiguous handoff',
      severity: 'orange',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/ambiguous-handoff-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_completed',
      ts: '2026-03-09T18:19:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore ambiguous handoff completion',
      summary: 'Lead completed an ambiguous handoff lifecycle',
      severity: 'normal',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/ambiguous-handoff-completed.md']
    })
  );

  const ambiguousHandoffCompletion = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-ambiguous-handoff&window=20m`
  );
  assert.equal(ambiguousHandoffCompletion.response.status, 200);
  assert.deepEqual(
    ambiguousHandoffCompletion.body.items.map((item) => item.incident_id),
    ['evt_incident_ambiguous_handoff_two', 'evt_incident_ambiguous_handoff_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_one',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start first blank-correlation ambiguous handoff',
      summary: 'Lead started the first blank-correlation ambiguous handoff',
      severity: 'yellow',
      correlationId: 'corr-ambiguous-blank-correlation-one',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_two',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start second blank-correlation ambiguous handoff',
      summary: 'Lead started the second blank-correlation ambiguous handoff',
      severity: 'orange',
      correlationId: 'corr-ambiguous-blank-correlation-two',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_completed',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore blank-correlation ambiguous completion',
      summary: 'Lead completed a blank-correlation ambiguous handoff lifecycle',
      severity: 'normal',
      correlationId: '',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-completed.md']
    })
  );

  const ambiguousBlankCorrelationCompletion = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&window=20m`
  );
  assert.equal(ambiguousBlankCorrelationCompletion.response.status, 200);
  assert.deepEqual(
    ambiguousBlankCorrelationCompletion.body.items.map((item) => item.incident_id),
    [
      'evt_incident_ambiguous_handoff_two',
      'evt_incident_ambiguous_handoff_one',
      'evt_incident_ambiguous_blank_correlation_handoff_two',
      'evt_incident_ambiguous_blank_correlation_handoff_one'
    ]
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_requested_one',
      ts: '2026-03-09T18:16:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Retry reboot request for the same lifecycle',
      summary: 'Lead requested a duplicate reboot lifecycle once',
      severity: 'red',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-request-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_requested_two',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Retry reboot request for the same lifecycle again',
      summary: 'Lead requested a duplicate reboot lifecycle twice',
      severity: 'red',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-request-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_completed',
      ts: '2026-03-09T18:17:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Complete the duplicate reboot lifecycle',
      summary: 'Lead completed the duplicate reboot lifecycle',
      severity: 'normal',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-completed.md']
    })
  );

  const duplicateRebootLifecycle = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=app-engineering&status=open&correlation_id=corr-duplicate-reboot-lifecycle&window=20m`
  );
  assert.equal(duplicateRebootLifecycle.response.status, 200);
  assert.deepEqual(duplicateRebootLifecycle.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_retried_handoff_started_one',
      ts: '2026-03-09T18:17:40.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Retry a handoff before counterparty metadata is complete',
      summary: 'Lead started a handoff before counterparty metadata was complete',
      severity: 'yellow',
      correlationId: 'corr-retried-handoff-open',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/retried-handoff-started-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_retried_handoff_started_two',
      ts: '2026-03-09T18:17:50.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Retry a handoff after counterparty metadata is known',
      summary: 'Lead retried a handoff with richer counterparty metadata',
      severity: 'yellow',
      correlationId: 'corr-retried-handoff-open',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/retried-handoff-started-two.md']
    })
  );

  const retriedOpenHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-retried-handoff-open&window=20m`
  );
  assert.equal(retriedOpenHandoff.response.status, 200);
  assert.deepEqual(
    retriedOpenHandoff.body.items.map((item) => item.incident_id),
    ['evt_incident_retried_handoff_started_two']
  );
  assert.deepEqual(retriedOpenHandoff.body.items[0].counterparty_agent_ids, ['growth-revenue']);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_parallel_subset_handoff_one',
      ts: '2026-03-09T18:17:52.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep the first parallel handoff open',
      summary: 'Lead started a parallel handoff with a subset counterparty set',
      severity: 'yellow',
      correlationId: 'corr-parallel-open-subset-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/parallel-subset-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_parallel_subset_handoff_two',
      ts: '2026-03-09T18:17:53.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep the second parallel handoff open',
      summary: 'Lead started a parallel handoff with a superset counterparty set',
      severity: 'orange',
      correlationId: 'corr-parallel-open-subset-handoff',
      counterpartyAgentIds: ['growth-revenue', 'protocol-engineering'],
      evidenceRefs: ['/tmp/parallel-subset-handoff-two.md']
    })
  );

  const parallelSubsetHandoffs = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-parallel-open-subset-handoff&window=20m`
  );
  assert.equal(parallelSubsetHandoffs.response.status, 200);
  assert.deepEqual(
    parallelSubsetHandoffs.body.items.map((item) => item.incident_id),
    ['evt_incident_parallel_subset_handoff_two', 'evt_incident_parallel_subset_handoff_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_subset_counterparty_handoff_started',
      ts: '2026-03-09T18:17:55.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start a multi-party handoff before completion metadata shrinks',
      summary: 'Lead started a multi-party handoff',
      severity: 'orange',
      correlationId: 'corr-subset-counterparty-handoff',
      counterpartyAgentIds: ['app-engineering', 'growth-revenue'],
      evidenceRefs: ['/tmp/subset-counterparty-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_subset_counterparty_handoff_completed',
      ts: '2026-03-09T18:18:05.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete a multi-party handoff with partial metadata',
      summary: 'Lead completed a multi-party handoff after metadata shrank',
      severity: 'normal',
      correlationId: 'corr-subset-counterparty-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/subset-counterparty-handoff-completed.md']
    })
  );

  const subsetCounterpartyHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-subset-counterparty-handoff&window=20m`
  );
  assert.equal(subsetCounterpartyHandoff.response.status, 200);
  assert.deepEqual(subsetCounterpartyHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_partial_counterparty_handoff',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start handoff before counterparty metadata is complete',
      summary: 'Lead started a handoff before counterparty metadata was complete',
      severity: 'yellow',
      correlationId: 'corr-partial-counterparty-handoff',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/partial-counterparty-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_partial_counterparty_handoff_completed',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff after counterparty metadata is known',
      summary: 'Lead completed a handoff after counterparty metadata was known',
      severity: 'normal',
      correlationId: 'corr-partial-counterparty-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/partial-counterparty-handoff-completed.md']
    })
  );

  const partialCounterpartyHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-partial-counterparty-handoff&window=20m`
  );
  assert.equal(partialCounterpartyHandoff.response.status, 200);
  assert.deepEqual(partialCounterpartyHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlation_drift_handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start handoff before correlation metadata is corrected',
      summary: 'Lead started a handoff before correlation metadata was corrected',
      severity: 'yellow',
      correlationId: 'corr-drift-start-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/correlation-drift-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlation_drift_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff after correlation metadata is corrected',
      summary: 'Lead completed a handoff after correlation metadata was corrected',
      severity: 'normal',
      correlationId: '',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/correlation-drift-handoff-completed.md']
    })
  );

  const correlationDriftHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-drift-start-handoff&window=20m`
  );
  assert.equal(correlationDriftHandoff.response.status, 200);
  assert.deepEqual(correlationDriftHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_old',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Keep an older reboot lifecycle open outside the request window',
      summary: 'Lead requested an older reboot lifecycle outside the open window',
      severity: 'yellow',
      correlationId: 'corr-window-ambiguous-reboot-old',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_target',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Keep the in-window reboot lifecycle open',
      summary: 'Lead requested an in-window reboot lifecycle',
      severity: 'orange',
      correlationId: 'corr-window-ambiguous-reboot-target',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-target.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_completed',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Ignore a blank-correlation reboot completion that is ambiguous across window boundaries',
      summary: 'Lead completed an ambiguous blank-correlation reboot',
      severity: 'normal',
      correlationId: '',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-completed.md']
    })
  );

  const windowedOpenReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=growth-revenue&status=open&correlation_id=corr-window-ambiguous-reboot-target&window=20m`
  );
  assert.equal(windowedOpenReboot.response.status, 200);
  assert.deepEqual(
    windowedOpenReboot.body.items.map((item) => item.incident_id),
    ['evt_incident_window_ambiguous_reboot_target']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_future_completion_handoff',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep handoff open before future completion',
      summary: 'Lead started a handoff that completes in the future',
      severity: 'orange',
      correlationId: 'corr-future-completion-handoff',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/future-completion-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_future_completion_handoff_completed',
      ts: '2026-03-09T18:25:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff in the future',
      summary: 'Lead completed a handoff after the request now time',
      severity: 'normal',
      correlationId: 'corr-future-completion-handoff',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/future-completion-handoff-completed.md']
    })
  );

  const futureCompletionHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=growth-revenue&status=open&correlation_id=corr-future-completion-handoff`
  );
  assert.equal(futureCompletionHandoff.response.status, 200);
  assert.deepEqual(
    futureCompletionHandoff.body.items.map((item) => item.incident_id),
    ['evt_incident_future_completion_handoff']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'z_incident_same_ts_reboot_requested',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset same timestamp lifecycle',
      summary: 'Lead requested a same timestamp reboot',
      severity: 'red',
      correlationId: 'corr-same-ts-reboot',
      evidenceRefs: ['/tmp/same-ts-reboot-requested.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'a_incident_same_ts_reboot_completed',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Reset same timestamp lifecycle',
      summary: 'Lead completed a same timestamp reboot',
      severity: 'normal',
      correlationId: 'corr-same-ts-reboot',
      evidenceRefs: ['/tmp/same-ts-reboot-completed.md']
    })
  );

  const sameTimestampReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=protocol-engineering&status=open&correlation_id=corr-same-ts-reboot&window=20m`
  );
  assert.equal(sameTimestampReboot.response.status, 200);
  assert.deepEqual(sameTimestampReboot.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_same_ts_completed_before_requested_completed',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Complete same timestamp lifecycle before request append',
      summary: 'Lead completed a same timestamp reboot before request append',
      severity: 'normal',
      correlationId: 'corr-same-ts-reboot-reversed',
      evidenceRefs: ['/tmp/same-ts-reboot-reversed-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_same_ts_completed_before_requested_requested',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Request same timestamp lifecycle after completion append',
      summary: 'Lead requested a same timestamp reboot after completion append',
      severity: 'red',
      correlationId: 'corr-same-ts-reboot-reversed',
      evidenceRefs: ['/tmp/same-ts-reboot-reversed-requested.md']
    })
  );

  const sameTimestampReversedReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=protocol-engineering&status=open&correlation_id=corr-same-ts-reboot-reversed&window=20m`
  );
  assert.equal(sameTimestampReversedReboot.response.status, 200);
  assert.deepEqual(sameTimestampReversedReboot.body.items, []);
});

test('GET /agents/:id/incidents reuses incident feed semantics with an implicit agent filter', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale notes',
      summary: 'Old agent incident outside the route window',
      severity: 'yellow',
      correlationId: 'corr-agent-incident-old',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-incident-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_alert',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix agent incident query',
      summary: 'Lead raised an agent incident',
      severity: 'orange',
      correlationId: 'corr-agent-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/agent-incident-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off agent incident follow-up',
      summary: 'Lead started an agent incident handoff',
      severity: 'yellow',
      correlationId: 'corr-agent-incident-feed',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-incident-handoff.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_unmatched_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore unrelated completion',
      summary: 'Lead completed an unrelated handoff lifecycle',
      severity: 'normal',
      correlationId: 'corr-agent-unmatched-complete',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-unmatched-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_reboot',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset agent incident context',
      summary: 'Lead requested an agent incident reboot',
      severity: 'red',
      correlationId: 'corr-agent-open-reboot',
      evidenceRefs: ['/tmp/agent-incident-reboot.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_reboot_completed',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Reset agent incident context',
      summary: 'Lead completed the agent incident reboot',
      severity: 'normal',
      correlationId: 'corr-agent-open-reboot',
      evidenceRefs: ['/tmp/agent-incident-reboot-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_other_agent_incident',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset stale incident context',
      summary: 'Lead requested a reboot for another agent incident',
      severity: 'red',
      correlationId: 'corr-agent-incident-feed',
      evidenceRefs: ['/tmp/other-agent-incident.md']
    })
  );

  const response = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?kind=handoff&severity=yellow&status=started&correlation_id=corr-agent-incident-feed&window=10m&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.agent_id, 'app-engineering');
  assert.deepEqual(response.body.items, [
    {
      incident_id: 'evt_agent_incident_handoff',
      kind: 'handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'started',
      severity: 'yellow',
      summary: 'Lead started an agent incident handoff',
      correlation_id: 'corr-agent-incident-feed',
      evidence_refs: ['/tmp/agent-incident-handoff.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ]);

  const implicitAgentFilter = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?correlation_id=corr-agent-incident-feed&window=20m&limit=5`
  );
  assert.equal(implicitAgentFilter.response.status, 200);
  assert.deepEqual(
    implicitAgentFilter.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_handoff', 'evt_agent_incident_alert']
  );

  const openActiveIncidents = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=open&window=20m`
  );
  assert.equal(openActiveIncidents.response.status, 200);
  assert.deepEqual(
    openActiveIncidents.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_handoff', 'evt_agent_incident_alert']
  );

  const completedAgentReboot = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=completed&correlation_id=corr-agent-open-reboot&window=20m`
  );
  assert.equal(completedAgentReboot.response.status, 200);
  assert.deepEqual(
    completedAgentReboot.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_reboot_completed']
  );

  const openRedAgentIncidents = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=open&severity=red&window=20m`
  );
  assert.equal(openRedAgentIncidents.response.status, 200);
  assert.deepEqual(openRedAgentIncidents.body.items, []);

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/incidents`);
  assert.equal(missingAgent.response.status, 404);
});

test('GET /memory/artifacts materializes actor and counterparty evidence plus collector observations that extend event-backed artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_counterparty',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review the artifact coverage',
      summary: 'Lead started review with app-engineering as counterparty',
      severity: 'yellow',
      correlationId: 'corr-memory',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/memory-counterparty.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_existing_artifact',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'idle',
      activeTask: 'Keep shared artifact in view',
      summary: 'Existing event already referenced the shared artifact',
      severity: 'normal',
      correlationId: 'corr-memory-shared',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_latest_artifact',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Refresh shared artifact anchor',
      summary: 'Newer event updated the shared artifact anchor',
      severity: 'normal',
      correlationId: 'corr-memory-shared-latest',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
      summary: {
        agent_count: 1,
        heartbeat_count: 1,
        tmux_observed_count: 1,
        workspace_observed_count: 3,
        reboot_recommended_count: 0
      },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/collector-only.md', 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [
          {
            path: '/tmp/collector-only.md',
            file_name: 'collector-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          },
          {
            path: '/tmp/passive-only.md',
            file_name: 'passive-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:15:00.000Z'
          },
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:16:30.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['protocol-engineering', 'team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Implement HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '2026-03-09T18:17:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/collector-only.md', 'tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  const counterpartyResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory&window=20m&limit=10`
  );
  assert.equal(counterpartyResponse.response.status, 200);
  assert.deepEqual(counterpartyResponse.body, {
    generated_at: '2026-03-09T18:20:00.000Z',
    items: [
      {
        artifact_ref: '/tmp/memory-counterparty.md',
        artifact_kind: 'evidence_ref',
        file_name: 'memory-counterparty.md',
        first_seen_at: '2026-03-09T18:06:00.000Z',
        last_seen_at: '2026-03-09T18:06:00.000Z',
        mention_count: 1,
        agent_ids: ['app-engineering', 'growth-revenue', 'team-lead'],
        correlation_ids: ['corr-memory'],
        source_kinds: ['controller_event'],
        latest_summary: 'Lead started review with app-engineering as counterparty',
        latest_event_type: 'review_started',
        latest_event_id: 'evt_memory_counterparty',
        replay_checkpoint: {
          event_id: 'evt_memory_counterparty',
          event_type: 'review_started',
          summary: 'Lead started review with app-engineering as counterparty',
          last_seen_at: '2026-03-09T18:06:00.000Z'
        },
        collector_last_modified_at: null
      }
    ]
  });

  const collectorOnlyResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(collectorOnlyResponse.response.status, 200);
  assert.deepEqual(collectorOnlyResponse.body.items.slice(0, 2), [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Implement HTTP handlers',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:18:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change reviewing -> coding',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change reviewing -> coding',
        last_seen_at: '2026-03-09T18:18:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:18:30.000Z'
    },
    {
      artifact_ref: '/tmp/collector-only.md',
      artifact_kind: 'workspace_file',
      file_name: 'collector-only.md',
      first_seen_at: '2026-03-09T18:17:00.000Z',
      last_seen_at: '2026-03-09T18:17:00.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: 'Collector observed workspace write to collector-only.md',
      latest_event_type: 'agent_wrote_file',
      latest_event_id: 'evt_collector_app-engineering_file_write_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_file_write_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_wrote_file',
        summary: 'Collector observed workspace write to collector-only.md',
        last_seen_at: '2026-03-09T18:17:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:17:00.000Z'
    }
  ]);

  const passiveOnlyArtifact = collectorOnlyResponse.body.items.find((item) => item.artifact_ref === '/tmp/passive-only.md');
  assert.deepEqual(passiveOnlyArtifact, {
    artifact_ref: '/tmp/passive-only.md',
    artifact_kind: 'workspace_file',
    file_name: 'passive-only.md',
    first_seen_at: '2026-03-09T18:15:00.000Z',
    last_seen_at: '2026-03-09T18:15:00.000Z',
    mention_count: 1,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
    source_kinds: ['workspace_file'],
    latest_summary: null,
    latest_event_type: null,
    collector_last_modified_at: '2026-03-09T18:15:00.000Z'
  });
  assert.equal(Object.prototype.hasOwnProperty.call(passiveOnlyArtifact, 'latest_event_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(passiveOnlyArtifact, 'replay_checkpoint'), false);

  const sharedArtifact = collectorOnlyResponse.body.items.find((item) => item.artifact_ref === '/tmp/shared.md');
  assert.deepEqual(sharedArtifact, {
    artifact_ref: '/tmp/shared.md',
    artifact_kind: 'workspace_file',
    file_name: 'shared.md',
    first_seen_at: '2026-03-09T18:04:00.000Z',
    last_seen_at: '2026-03-09T18:16:30.000Z',
    mention_count: 3,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: [
      'collector-snapshot:2026-03-09T18:18:00.000Z',
      'corr-memory-shared',
      'corr-memory-shared-latest'
    ],
    source_kinds: ['controller_event', 'workspace_file'],
    latest_summary: 'Newer event updated the shared artifact anchor',
    latest_event_type: 'review_completed',
    latest_event_id: 'evt_memory_latest_artifact',
    replay_checkpoint: {
      event_id: 'evt_memory_latest_artifact',
      event_type: 'review_completed',
      summary: 'Newer event updated the shared artifact anchor',
      last_seen_at: '2026-03-09T18:08:00.000Z'
    },
    collector_last_modified_at: '2026-03-09T18:16:30.000Z'
  });

  const exactArtifactResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&artifact_ref=${encodeURIComponent('/tmp/shared.md')}&window=20m&limit=10`
  );
  assert.equal(exactArtifactResponse.response.status, 200);
  assert.deepEqual(exactArtifactResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:04:00.000Z',
      last_seen_at: '2026-03-09T18:16:30.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: [
        'collector-snapshot:2026-03-09T18:18:00.000Z',
        'corr-memory-shared',
        'corr-memory-shared-latest'
      ],
      source_kinds: ['controller_event', 'workspace_file'],
      latest_summary: 'Newer event updated the shared artifact anchor',
      latest_event_type: 'review_completed',
      latest_event_id: 'evt_memory_latest_artifact',
      replay_checkpoint: {
        event_id: 'evt_memory_latest_artifact',
        event_type: 'review_completed',
        summary: 'Newer event updated the shared artifact anchor',
        last_seen_at: '2026-03-09T18:08:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:16:30.000Z'
    }
  ]);

  const collectorWindowedResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=1m&limit=10`);
  assert.equal(collectorWindowedResponse.response.status, 200);
  assert.deepEqual(collectorWindowedResponse.body.items, []);
});

test('GET /memory/artifacts narrows evidence facets without leaking unrelated collector-only artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_facet_match',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review facet artifact coverage',
      summary: 'Facet event referenced the shared workspace artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-facet',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/facet-shared.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_facet_wrong_type',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Finish facet artifact coverage',
      summary: 'Completed review should not match the started facet',
      severity: 'yellow',
      correlationId: 'corr-memory-facet',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/facet-completed.md']
    })
  );

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/facet-collector-only.md'],
        workspace_observations: [
          {
            path: '/tmp/facet-shared.md',
            file_name: 'facet-shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:16:30.000Z'
          },
          {
            path: '/tmp/facet-collector-only.md',
            file_name: 'facet-collector-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['protocol-engineering', 'team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'reviewing',
          active_task: 'Review facet artifact coverage',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '2026-03-09T18:17:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/facet-collector-only.md']
        }
      }
    ]
  });

  const response = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&event_type=review_started&severity=yellow&artifact_kind=workspace_file&window=20m&limit=10`
  );

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: '/tmp/facet-shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'facet-shared.md',
      first_seen_at: '2026-03-09T18:04:00.000Z',
      last_seen_at: '2026-03-09T18:16:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z', 'corr-memory-facet'],
      source_kinds: ['controller_event', 'workspace_file'],
      latest_summary: 'Facet event referenced the shared workspace artifact',
      latest_event_type: 'review_started',
      latest_event_id: 'evt_memory_facet_match',
      replay_checkpoint: {
        event_id: 'evt_memory_facet_match',
        event_type: 'review_started',
        summary: 'Facet event referenced the shared workspace artifact',
        last_seen_at: '2026-03-09T18:04:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:16:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts filters source_kind by exact provenance membership before limit', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_shared_controller',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review source kind parity',
      summary: 'Controller event referenced the shared artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-shared.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_workspace_only',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write source kind parity notes',
      summary: 'Workspace event referenced a workspace-only artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-workspace-only.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_shared_workspace',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Update source kind parity notes',
      summary: 'Workspace event updated the shared artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-shared.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_controller_newer',
      ts: '2026-03-09T18:09:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review newer controller-only artifact',
      summary: 'Newer controller event should not satisfy workspace_file',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-controller-only.md'],
      sourceKind: 'controller_event'
    })
  );

  const workspaceLimited = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=workspace_file&limit=1`
  );
  assert.equal(workspaceLimited.response.status, 200);
  assert.deepEqual(workspaceLimited.body.items.map((item) => item.artifact_ref), [
    '/tmp/source-kind-shared.md'
  ]);
  assert.deepEqual(workspaceLimited.body.items[0].source_kinds, ['controller_event', 'workspace_file']);

  const controllerResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=controller_event&limit=10`
  );
  assert.equal(controllerResponse.response.status, 200);
  assert.deepEqual(controllerResponse.body.items.map((item) => item.artifact_ref), [
    '/tmp/source-kind-controller-only.md',
    '/tmp/source-kind-shared.md'
  ]);

  const artifactRefMismatch = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&artifact_ref=${encodeURIComponent('/tmp/source-kind-controller-only.md')}&source_kind=workspace_file&limit=10`
  );
  assert.equal(artifactRefMismatch.response.status, 200);
  assert.deepEqual(artifactRefMismatch.body.items, []);

  const unknownSourceKind = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=missing_source_kind&limit=10`
  );
  assert.equal(unknownSourceKind.response.status, 200);
  assert.deepEqual(unknownSourceKind.body.items, []);

  const unfiltered = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&limit=10`
  );
  const blankSourceKind = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=&limit=10`
  );
  assert.equal(blankSourceKind.response.status, 200);
  assert.deepEqual(blankSourceKind.body, unfiltered.body);
});

test('GET /memory/artifacts keeps collector-only observations canonical and agent-scoped when no derived activity event exists', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  const appState = store.getAgent('app-engineering').current_state;
  const protocolState = store.getAgent('protocol-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 2,
      tmux_observed_count: 0,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'protocol-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: appState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      },
      {
        agent_id: 'protocol-engineering',
        workspace_root: '/tmp/protocol-engineering',
        session_ref: '5-web3-protocol-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'app-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'protocol-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: protocolState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-protocol-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      }
    ]
  });

  const appResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  const protocolResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=protocol-engineering&window=20m&limit=10`);
  assert.equal(appResponse.response.status, 200);
  assert.equal(protocolResponse.response.status, 200);
  assert.deepEqual(appResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:17:00.000Z',
      last_seen_at: '2026-03-09T18:17:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:00.000Z'
    }
  ]);
  assert.deepEqual(protocolResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:17:30.000Z',
      last_seen_at: '2026-03-09T18:17:30.000Z',
      mention_count: 1,
      agent_ids: ['protocol-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts does not leak collector_last_modified_at from filtered-out collector observations onto event-backed artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_event_only_for_app',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review shared evidence',
      summary: 'Lead reviewed shared evidence with app engineering',
      severity: 'yellow',
      correlationId: 'corr-memory-filtered',
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  const protocolState = store.getAgent('protocol-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'protocol-engineering',
        workspace_root: '/tmp/protocol-engineering',
        session_ref: '5-web3-protocol-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'app-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'protocol-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: protocolState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-protocol-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      }
    ]
  });

  const response = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-filtered&window=20m&limit=10`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'evidence_ref',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:10:00.000Z',
      last_seen_at: '2026-03-09T18:10:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-memory-filtered'],
      source_kinds: ['controller_event'],
      latest_summary: 'Lead reviewed shared evidence with app engineering',
      latest_event_type: 'review_started',
      latest_event_id: 'evt_memory_event_only_for_app',
      replay_checkpoint: {
        event_id: 'evt_memory_event_only_for_app',
        event_type: 'review_started',
        summary: 'Lead reviewed shared evidence with app engineering',
        last_seen_at: '2026-03-09T18:10:00.000Z'
      },
      collector_last_modified_at: null
    }
  ]);
});

test('GET /memory/artifacts keeps stable tmux refs when later collector snapshots lose pane coordinates', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Implement HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:19:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: 'null',
            pane_index: 'null',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:19:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:19:00.000Z',
          current_state: 'reviewing',
          active_task: 'Review HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:19:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Implement HTTP handlers',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:19:30.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: [
        'collector-snapshot:2026-03-09T18:18:00.000Z',
        'collector-snapshot:2026-03-09T18:19:00.000Z'
      ],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change coding -> reviewing',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_19_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_19_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change coding -> reviewing',
        last_seen_at: '2026-03-09T18:19:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:19:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts exposes multiple tmux panes as distinct artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Pane One',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          },
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '2',
            pane_id: '%12',
            pane_title: 'Pane Two',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Inspect multiple panes',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:18:30.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items.slice(0, 2), [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Pane One',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:18:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change idle -> coding',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change idle -> coding',
        last_seen_at: '2026-03-09T18:18:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:18:30.000Z'
    },
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.2',
      artifact_kind: 'tmux_observation',
      file_name: 'Pane Two',
      first_seen_at: '2026-03-09T18:17:30.000Z',
      last_seen_at: '2026-03-09T18:17:30.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:30.000Z'
    }
  ]);
});


test('GET /memory/artifacts binds collector state-change evidence to the active tmux pane instead of the first ref', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Pane One',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:17:30.000Z'
          },
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '2',
            pane_id: '%12',
            pane_title: 'Pane Two',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Inspect multiple panes',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:18:30.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  const activePane = response.body.items.find((item) => item.artifact_ref === 'tmux://5-web3-app-engineering/0.2');
  assert.deepEqual(activePane, {
    artifact_ref: 'tmux://5-web3-app-engineering/0.2',
    artifact_kind: 'tmux_observation',
    file_name: 'Pane Two',
    first_seen_at: '2026-03-09T18:18:00.000Z',
    last_seen_at: '2026-03-09T18:18:30.000Z',
    mention_count: 2,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
    source_kinds: ['tmux_observation'],
    latest_summary: 'Collector observed state change idle -> coding',
    latest_event_type: 'agent_state_changed',
    latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
    replay_checkpoint: {
      event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      event_type: 'agent_state_changed',
      summary: 'Collector observed state change idle -> coding',
      last_seen_at: '2026-03-09T18:18:00.000Z'
    },
    collector_last_modified_at: '2026-03-09T18:18:30.000Z'
  });
});

test('GET /memory/artifacts ignores workspace_root collector observations', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  const appState = store.getAgent('app-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: [],
        workspace_observations: [
          {
            path: '/tmp/app-engineering',
            file_name: 'app-engineering',
            kind: 'workspace_root',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: appState,
          active_task: 'Inspect workspace root',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: []
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, []);
});

test('GET /correlations/:correlation_id aggregates incident, interaction, and replay evidence', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_old',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Old correlation artifact',
      summary: 'Outside the requested correlation window',
      correlationId: 'corr-drilldown',
      evidenceRefs: ['/tmp/corr-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_review_started',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review the drill-down evidence',
      location: 'review-zone',
      summary: 'Lead started the drill-down review',
      severity: 'yellow',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_peer_watch_open',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix the missing evidence trail',
      location: 'review-zone',
      summary: 'Protocol engineering flagged missing evidence',
      severity: 'orange',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-alert-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_review_completed',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review the drill-down evidence',
      location: 'review-zone',
      summary: 'Lead completed the drill-down review',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-review-end.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_handoff_started',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off evidence follow-up',
      summary: 'Lead started the evidence handoff',
      severity: 'yellow',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/corr-handoff-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_handoff_completed',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off evidence follow-up',
      summary: 'Lead completed the evidence handoff',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/corr-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_reboot_requested',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset the evidence replay context',
      location: 'reboot-zone',
      summary: 'Lead requested a reboot after the evidence review',
      severity: 'red',
      correlationId: 'corr-drilldown',
      evidenceRefs: ['/tmp/corr-reboot.md']
    })
  );

  const response = await requestJson(
    `${baseUrl}/correlations/corr-drilldown?window=15m&limit=2`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body, {
    correlation_id: 'corr-drilldown',
    participant_agent_ids: [
      'app-engineering',
      'growth-revenue',
      'protocol-engineering',
      'team-lead'
    ],
    evidence_refs: [
      '/tmp/corr-alert-open.md',
      '/tmp/corr-handoff-complete.md',
      '/tmp/corr-handoff-start.md',
      '/tmp/corr-reboot.md',
      '/tmp/corr-review-end.md',
      '/tmp/corr-review-start.md'
    ],
    first_ts: '2026-03-09T18:06:00.000Z',
    last_ts: '2026-03-09T18:12:00.000Z',
    incident_count: 4,
    interaction_count: 3,
    event_count: 6,
    closure_ledger: {
      state: 'open',
      basis: 'filtered_correlation_slice',
      open_count: 2,
      active_count: 1,
      closed_count: 1,
      entry_count: 4,
      last_transition_ts: '2026-03-09T18:12:00.000Z',
      entries: [
        {
          entry_id: 'incident:evt_corr_reboot_requested',
          state: 'open',
          kind: 'reboot',
          status: 'requested',
          ts: '2026-03-09T18:12:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          summary: 'Lead requested a reboot after the evidence review',
          correlation_id: 'corr-drilldown',
          evidence_refs: ['/tmp/corr-reboot.md'],
          source_kind: 'controller_event',
          incident_id: 'evt_corr_reboot_requested'
        },
        {
          entry_id: 'incident:evt_corr_handoff_completed',
          state: 'closed',
          kind: 'handoff',
          status: 'completed',
          ts: '2026-03-09T18:11:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          summary: 'Lead completed the evidence handoff',
          correlation_id: 'corr-drilldown',
          evidence_refs: ['/tmp/corr-handoff-complete.md'],
          source_kind: 'controller_event',
          incident_id: 'evt_corr_handoff_completed'
        }
      ]
    },
    incidents: [
      {
        incident_id: 'evt_corr_reboot_requested',
        kind: 'reboot',
        ts: '2026-03-09T18:12:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        status: 'requested',
        severity: 'red',
        summary: 'Lead requested a reboot after the evidence review',
        correlation_id: 'corr-drilldown',
        evidence_refs: ['/tmp/corr-reboot.md'],
        counterparty_agent_ids: [],
        source_kind: 'controller_event'
      },
      {
        incident_id: 'evt_corr_handoff_completed',
        kind: 'handoff',
        ts: '2026-03-09T18:11:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        status: 'completed',
        severity: 'normal',
        summary: 'Lead completed the evidence handoff',
        correlation_id: 'corr-drilldown',
        evidence_refs: ['/tmp/corr-handoff-complete.md'],
        counterparty_agent_ids: ['growth-revenue'],
        source_kind: 'controller_event'
      }
    ],
    interactions: [
      {
        interaction_id: 'interaction:evt_corr_handoff_started',
        interaction_type: 'handoff',
        correlation_id: 'corr-drilldown',
        started_at: '2026-03-09T18:10:00.000Z',
        ended_at: '2026-03-09T18:11:00.000Z',
        participant_agent_ids: ['app-engineering', 'growth-revenue', 'team-lead'],
        trigger_event_id: 'evt_corr_handoff_started',
        before_state: 'planning',
        after_state: 'planning',
        severity: 'yellow',
        evidence_refs: ['/tmp/corr-handoff-start.md', '/tmp/corr-handoff-complete.md'],
        source_kind: 'controller_event',
        summary: 'Lead completed the evidence handoff',
        related_event_ids: ['evt_corr_handoff_started', 'evt_corr_handoff_completed']
      },
      {
        interaction_id: 'interaction:evt_corr_review_started',
        interaction_type: 'review',
        correlation_id: 'corr-drilldown',
        started_at: '2026-03-09T18:06:00.000Z',
        ended_at: '2026-03-09T18:08:00.000Z',
        participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
        trigger_event_id: 'evt_corr_review_started',
        before_state: 'reviewing',
        after_state: 'reviewing',
        severity: 'yellow',
        evidence_refs: ['/tmp/corr-review-start.md', '/tmp/corr-review-end.md'],
        source_kind: 'controller_event',
        summary: 'Lead completed the drill-down review',
        related_event_ids: ['evt_corr_review_started', 'evt_corr_review_completed']
      }
    ],
    timeline: [
      {
        event_id: 'evt_corr_handoff_completed',
        ts: '2026-03-09T18:11:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        event_type: 'agent_handoff_completed',
        severity: 'normal',
        current_state: 'planning',
        location: 'meeting-zone',
        summary: 'Lead completed the evidence handoff',
        correlation_id: 'corr-drilldown',
        counterparty_agent_ids: ['growth-revenue'],
        evidence_refs: ['/tmp/corr-handoff-complete.md'],
        source_kind: 'controller_event'
      },
      {
        event_id: 'evt_corr_reboot_requested',
        ts: '2026-03-09T18:12:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        event_type: 'agent_reboot_requested',
        severity: 'red',
        current_state: 'rebooting',
        location: 'reboot-zone',
        summary: 'Lead requested a reboot after the evidence review',
        correlation_id: 'corr-drilldown',
        counterparty_agent_ids: [],
        evidence_refs: ['/tmp/corr-reboot.md'],
        source_kind: 'controller_event'
      }
    ]
  });

  const missing = await requestJson(`${baseUrl}/correlations/missing-correlation`);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error, 'not_found');
});



test('GET /correlations/:correlation_id keeps full interaction counts when slices are limited or omitted', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T19:30:00.000Z'
  });
  const baseTs = Date.parse('2026-03-09T18:00:00.000Z');

  for (let index = 0; index < 55; index += 1) {
    const startedAt = new Date(baseTs + index * 60_000).toISOString();
    const completedAt = new Date(baseTs + index * 60_000 + 5_000).toISOString();

    await store.appendEvent(
      createEvent({
        eventId: `evt_corr_many_review_started_${index}`,
        ts: startedAt,
        agentId: 'app-engineering',
        actorId: 'team-lead',
        eventType: 'review_started',
        currentState: 'reviewing',
        activeTask: `Review correlation batch ${index}`,
        location: 'review-zone',
        summary: `Lead started review batch ${index}`,
        severity: 'yellow',
        correlationId: 'corr-many',
        counterpartyAgentIds: ['protocol-engineering'],
        evidenceRefs: [`/tmp/corr-many-review-start-${index}.md`]
      })
    );

    await store.appendEvent(
      createEvent({
        eventId: `evt_corr_many_review_completed_${index}`,
        ts: completedAt,
        agentId: 'app-engineering',
        actorId: 'team-lead',
        eventType: 'review_completed',
        currentState: 'reviewing',
        activeTask: `Review correlation batch ${index}`,
        location: 'review-zone',
        summary: `Lead completed review batch ${index}`,
        severity: 'yellow',
        correlationId: 'corr-many',
        counterpartyAgentIds: ['protocol-engineering'],
        evidenceRefs: [`/tmp/corr-many-review-complete-${index}.md`]
      })
    );
  }

  const unlimited = await requestJson(`${baseUrl}/correlations/corr-many`);
  assert.equal(unlimited.response.status, 200);
  assert.equal(unlimited.body.interaction_count, 55);
  assert.equal(unlimited.body.interactions.length, 55);

  const limited = await requestJson(`${baseUrl}/correlations/corr-many?limit=10`);
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.interaction_count, 55);
  assert.equal(limited.body.interactions.length, 10);
});

test('write endpoints reject missing headers, invalid payloads, and actor-boundary violations', async (t) => {
  const store = await createDirectStore();

  const invalidJson = await requestJsonDirect({
    url: '/events',
    store,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: '{"/tmp/private/token=invalid-json"'
  });

  assert.equal(invalidJson.response.status, 400);
  assert.equal(invalidJson.body.error, 'invalid_json');
  assert.equal(invalidJson.body.details.includes('/tmp/private'), false);
  assert.equal(invalidJson.body.details.includes('token='), false);

  const missingActor = await requestJsonDirect({
    url: '/events',
    store,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(missingActor.response.status, 400);
  assert.match(missingActor.body.error, /missing_actor_id/);

  const forbidden = await requestJsonDirect({
    url: '/events',
    store,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'market-intel'
    },
    body: JSON.stringify({
      event_id: 'evt_bad_actor',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'product-pmf',
      agent_role: 'product-pmf',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write code',
      summary: 'Market intel should not emit product events',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'workspace_file',
      metadata: {}
    })
  });

  assert.equal(forbidden.response.status, 422);
  assert.match(forbidden.body.error, /validation_failed/);

  const invalidHeartbeat = await requestJsonDirect({
    url: '/heartbeats',
    store,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'flying',
      active_task: 'Impossible state',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });

  assert.equal(invalidHeartbeat.response.status, 422);
  assert.match(invalidHeartbeat.body.error, /validation_failed/);
});

test('write endpoints reject oversized bodies before append', async () => {
  const oversizedCanaries = [
    '/tmp/private/request-body.json',
    'tmux://private-session/0.0',
    'hermes://profile/private-runtime',
    'session_ref=private-session',
    'profile_id=private-profile',
    'token=collector-secret',
    'https://hooks.example.invalid/private',
    '{"raw_payload":true}',
    'control-plane'
  ];
  const oversizedBody = JSON.stringify({
    canary: oversizedCanaries.join(' '),
    filler: 'x'.repeat(MAX_WRITE_JSON_BODY_BYTES)
  });
  const cases = [
    {
      url: '/events',
      headers: {
        'content-type': 'application/json',
        'x-actor-id': 'team-lead'
      }
    },
    {
      url: '/heartbeats',
      headers: {
        'content-type': 'application/json',
        'x-actor-id': 'app-engineering'
      }
    },
    {
      url: '/collectors/controller-snapshot',
      headers: {
        'content-type': 'application/json',
        'x-actor-id': 'team-lead'
      }
    }
  ];

  for (const testCase of cases) {
    let collectCalled = false;
    const store = await createDirectStore();
    const beforeCounts = getAppendCounts(store);
    const response = await requestJsonDirect({
      url: testCase.url,
      store,
      method: 'POST',
      headers: testCase.headers,
      body: oversizedBody,
      controllerSnapshotCollector: {
        async collectSnapshot() {
          collectCalled = true;
          return createRouteParityCollectorReport();
        }
      }
    });

    assert.equal(response.response.status, 413);
    assert.deepEqual(response.body, {
      error: 'request_body_too_large',
      details: 'request_body_too_large'
    });
    assertNoPartialCollectorAppend(store, beforeCounts);
    assert.equal(collectCalled, false);

    const serialized = JSON.stringify(response.body);
    for (const canary of oversizedCanaries) {
      assert.equal(serialized.includes(canary), false, `${testCase.url} leaked ${canary}`);
    }
  }
});

test('oversized malformed JSON is rejected before invalid_json parsing', async () => {
  const store = await createDirectStore();
  const oversizedMalformedBody = `{"filler":"${'x'.repeat(MAX_WRITE_JSON_BODY_BYTES)}`;

  const response = await requestJsonDirect({
    url: '/events',
    store,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: oversizedMalformedBody
  });

  assert.equal(response.response.status, 413);
  assert.deepEqual(response.body, {
    error: 'request_body_too_large',
    details: 'request_body_too_large'
  });
  assertNoPartialCollectorAppend(store, {
    event_count: 0,
    heartbeat_count: 0,
    evidence_record_count: 0,
    collector_snapshot_count: 0
  });
});

test('POST /events allows team-lead task dispatch without advancing meaningful-output freshness', async (t) => {
  const { baseUrl } = await createHarness(t);

  const baselineHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'coding',
      active_task: 'Maintain websocket reconnection path',
      last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
      last_file_write_at: '2026-03-09T17:45:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });
  assert.equal(baselineHeartbeat.response.status, 201);

  const dispatch = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_dispatch_task',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_received_task',
      current_state: 'planning',
      active_task: 'Investigate controller queue drift',
      summary: 'Controller dispatched a new cross-agent task',
      severity: 'normal',
      correlation_id: 'corr-task-dispatch',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(dispatch.response.status, 201);
  assert.equal(dispatch.body.item.actor_id, 'team-lead');
  assert.equal(dispatch.body.item.event_type, 'agent_received_task');

  const agent = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(agent.response.status, 200);
  assert.equal(agent.body.item.active_task, 'Investigate controller queue drift');
  assert.equal(agent.body.item.current_state, 'planning');
  assert.equal(agent.body.item.last_meaningful_output_at, '2026-03-09T17:45:00.000Z');
  assert.equal(agent.body.item.recent_events[0].event_id, 'evt_dispatch_task');
  assert.equal(agent.body.item.recent_events[0].actor_id, 'team-lead');

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);

  const appEngineering = overview.body.agents.find((item) => item.agent_id === 'app-engineering');
  assert.equal(appEngineering.active_task, 'Investigate controller queue drift');
  assert.equal(appEngineering.last_meaningful_output_at, '2026-03-09T17:45:00.000Z');
  assert.equal(appEngineering.derived_staleness.severity, 'yellow');
  assert.equal(appEngineering.effective_severity, 'yellow');
});

test('GET /office/overview derives yellow and orange staleness without fabricating red', async (t) => {
  const { baseUrl } = await createHarness(t);

  const marketIntelHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'market-intel'
    },
    body: JSON.stringify({
      agent_id: 'market-intel',
      current_state: 'researching',
      active_task: 'Scan competitors',
      last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
      last_file_write_at: '2026-03-09T17:45:00.000Z',
      current_blocker: '',
      confidence_level: 'medium',
      reboot_recommended: false
    })
  });
  assert.equal(marketIntelHeartbeat.response.status, 201);

  const productHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'product-pmf'
    },
    body: JSON.stringify({
      agent_id: 'product-pmf',
      current_state: 'planning',
      active_task: 'Draft PMF memo',
      last_meaningful_output_at: '2026-03-09T17:35:00.000Z',
      last_file_write_at: '2026-03-09T17:35:00.000Z',
      current_blocker: '',
      confidence_level: 'medium',
      reboot_recommended: false
    })
  });
  assert.equal(productHeartbeat.response.status, 201);

  const rebootHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'growth-revenue'
    },
    body: JSON.stringify({
      agent_id: 'growth-revenue',
      current_state: 'coding',
      active_task: 'Repair outbound funnel notes',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'low',
      reboot_recommended: true
    })
  });
  assert.equal(rebootHeartbeat.response.status, 201);

  const redAlert = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_alert_red',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      current_state: 'blocked',
      active_task: 'Stop broken handler rollout',
      summary: 'Peer watch found a severe regression',
      severity: 'red',
      correlation_id: 'phase1-overview',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'controller_event',
      metadata: {}
    })
  });
  assert.equal(redAlert.response.status, 201);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.summary.blocked_count, 1);
  assert.equal(overview.body.summary.reboot_recommended_count, 1);
  assert.deepEqual(overview.body.summary.severity_buckets, {
    normal: 3,
    yellow: 1,
    orange: 2,
    red: 1
  });

  const marketIntel = overview.body.agents.find((agent) => agent.agent_id === 'market-intel');
  assert.equal(marketIntel.reported_severity, 'normal');
  assert.equal(marketIntel.derived_staleness.severity, 'yellow');
  assert.equal(marketIntel.effective_severity, 'yellow');

  const productPmf = overview.body.agents.find((agent) => agent.agent_id === 'product-pmf');
  assert.equal(productPmf.reported_severity, 'normal');
  assert.equal(productPmf.derived_staleness.severity, 'orange');
  assert.equal(productPmf.effective_severity, 'orange');

  const growthRevenue = overview.body.agents.find((agent) => agent.agent_id === 'growth-revenue');
  assert.equal(growthRevenue.reported_severity, 'orange');
  assert.equal(growthRevenue.derived_staleness.severity, 'normal');
  assert.equal(growthRevenue.effective_severity, 'orange');

  const appEngineering = overview.body.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appEngineering.reported_severity, 'red');
  assert.equal(appEngineering.effective_severity, 'red');
  assert.equal(appEngineering.derived_staleness.severity, 'normal');
});

test('collector snapshot endpoints stay read-only on GET and require team-lead on POST', async (t) => {
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
        summary: {
          agent_count: 1,
          heartbeat_count: 1,
          tmux_observed_count: 1,
          workspace_observed_count: 1,
          reboot_recommended_count: 0
        },
        items: [
          {
            agent_id: 'app-engineering',
            evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
            workspace_observations: [],
            tmux_observations: [],
            supervision: {
              watch_target: 'growth-revenue',
              watched_by: ['protocol-engineering', 'team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              received_at: collectedAt,
              current_state: 'coding',
              active_task: 'Implement HTTP handlers',
              last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
              last_file_write_at: '2026-03-09T18:04:00.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          }
        ]
      };
    }
  };

  const { baseUrl, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const initial = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.item, null);

  const missingActor = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST'
  });
  assert.equal(missingActor.response.status, 400);
  assert.equal(missingActor.body.error, 'missing_actor_id');

  const forbidden = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'app-engineering'
    }
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.body.error, 'forbidden_actor');

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collected.body.item.summary.heartbeat_count, 1);

  const latest = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(latest.response.status, 200);
  assert.equal(latest.body.item.collected_at, '2026-03-09T18:05:00.000Z');

  const appEngineering = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(appEngineering.response.status, 200);
  assert.equal(appEngineering.body.item.current_state, 'coding');
  assert.equal(appEngineering.body.item.last_heartbeat_at, '2026-03-09T18:05:00.000Z');

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  const appEngineeringOverview = overview.body.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appEngineeringOverview.current_state, 'coding');

  const activityEvents = await requestJson(`${baseUrl}/events?agent_id=app-engineering&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.deepEqual(
    activityEvents.body.items.map((event) => event.event_type),
    ['agent_state_changed', 'agent_wrote_file']
  );

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 4);
  assert.equal(JSON.parse(lines[0]).kind, 'event');
  assert.equal(JSON.parse(lines[1]).kind, 'event');
  assert.equal(JSON.parse(lines[2]).kind, 'heartbeat');
  const snapshotRecord = JSON.parse(lines[3]);
  assert.equal(snapshotRecord.kind, 'collector_snapshot');
  assert.equal(snapshotRecord.payload.collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(snapshotRecord.payload.items[0].heartbeat.current_state, 'coding');
});

test('collector snapshot persists opt-in task evidence without heartbeat advancement', async (t) => {
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readTaskEvidenceCandidates: async () => ({
      candidates: [
        {
          task_ref: 'TASK.400',
          source_kind: 'kanban_fixture',
          observed_at: '2026-05-20T01:00:00.000Z',
          correlation_id: 'corr.task.400',
          agent_id: 'app-engineering'
        }
      ],
      rejected: []
    })
  });
  const store = await createDirectStore();
  const now = () => '2026-05-20T02:00:00.000Z';

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    now,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collected.body.item.summary.heartbeat_count, 0);
  assert.equal(collected.body.item.items[0].heartbeat.last_meaningful_output_at, null);
  assert.deepEqual(collected.body.item.evidence_coverage.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0,
    task_evidence: 1
  });

  const evidence = await requestJsonDirect({
    url: '/evidence-records?source_kind=kanban_fixture',
    store,
    controllerSnapshotCollector,
    now
  });
  assert.equal(evidence.response.status, 200);
  assert.deepEqual(
    evidence.body.items.map((item) => ({
      agent_id: item.agent_id,
      source_kind: item.source_kind,
      evidence_ref: item.evidence_ref,
      evidence_role: item.evidence_role,
      output_candidate: item.output_candidate,
      correlation_id: item.correlation_id
    })),
    [
      {
        agent_id: 'app-engineering',
        source_kind: 'kanban_fixture',
        evidence_ref: 'task://kanban_fixture/TASK.400',
        evidence_role: 'task_reference',
        output_candidate: false,
        correlation_id: 'corr.task.400'
      }
    ]
  );

  const sourceGaps = await requestJsonDirect({
    url: '/runtime/source-gaps?source_kind=kanban_fixture',
    store,
    controllerSnapshotCollector,
    now
  });
  const sourceGapSummary = await requestJsonDirect({
    url: '/runtime/source-gaps/summary?source_kind=kanban_fixture',
    store,
    controllerSnapshotCollector,
    now
  });
  const sourceGapAgentSummary = await requestJsonDirect({
    url: '/runtime/source-gaps/agent-summary?source_kind=kanban_fixture',
    store,
    controllerSnapshotCollector,
    now
  });
  assert.equal(sourceGaps.response.status, 200);
  assert.deepEqual(sourceGaps.body.items, []);
  assert.equal(sourceGapSummary.response.status, 200);
  assert.equal(sourceGapSummary.body.item.total_count, 0);
  assert.equal(sourceGapAgentSummary.response.status, 200);
  assert.deepEqual(sourceGapAgentSummary.body.item, {
    total_count: 0,
    total_groups: 0,
    returned_limit: 50,
    groups: []
  });
});

test('collector snapshot persists opt-in Hermes gaps without heartbeat advancement', async () => {
  const appAgent = SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering');
  const fact = (sourceKind, ids, status, sourceIndex, ordinal, line = null) => ({
    source_kind: sourceKind,
    ...ids,
    status,
    degraded_reasons: [status === 'missing' ? 'Hermes source not observed' : 'Hermes source read failed'],
    source_provenance: {
      source_format: line ? 'jsonl' : 'json_array',
      source_index: sourceIndex,
      ...(line ? { line } : {}),
      source_input_ordinal: ordinal,
      source_file_ordinal: 1
    }
  });
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [appAgent],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: async () => [
      fact('hermes_profile', { agent_id: 'app-engineering', profile_id: 'app-runtime-missing' }, 'missing', 0, 1),
      fact('hermes_session', { session_ref: appAgent.session_ref }, 'error', 1, 2, 2),
      fact('hermes_profile', { profile_id: 'orphan-runtime-missing' }, 'missing', 2, 3),
      fact('hermes_session', { session_ref: 'orphan-runtime-error' }, 'error', 3, 4, 4)
    ]
  });
  const store = await createDirectStore();
  const now = () => '2026-03-09T18:10:00.000Z';
  await store.appendHeartbeat({
    agent_id: 'app-engineering',
    actor_id: 'app-engineering',
    received_at: '2026-03-09T18:01:00.000Z',
    current_state: 'coding',
    active_task: 'Implement output boundary',
    last_meaningful_output_at: '2026-03-09T18:00:30.000Z',
    last_file_write_at: '2026-03-09T18:00:20.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });
  const beforeCounts = store.getCounts();
  const beforeWorkflow = store.getAgentWorkflow('app-engineering', {
    now: now()
  });

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    now,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collected.body.item.summary.heartbeat_count, 0);
  assert.deepEqual(store.getCounts(), beforeCounts);
  assert.equal(store.getAgent('runtime_unmapped'), null);
  assert.equal(store.getAgent('app-engineering').active_task, 'Implement output boundary');
  assert.equal(
    store.getAgent('app-engineering').last_meaningful_output_at,
    '2026-03-09T18:00:30.000Z'
  );
  const afterWorkflow = store.getAgentWorkflow('app-engineering', {
    now: now()
  });
  assert.deepEqual(afterWorkflow.summary, beforeWorkflow.summary);
  assert.equal(afterWorkflow.detail.active_task, beforeWorkflow.detail.active_task);
  assert.equal(
    afterWorkflow.detail.last_meaningful_output_at,
    beforeWorkflow.detail.last_meaningful_output_at
  );

  const sourceHealth = await requestJsonDirect({
    url: '/collectors/controller-snapshot/source-health?source_kind=hermes_profile&status=missing&limit=10',
    store,
    controllerSnapshotCollector,
    now
  });
  assert.equal(sourceHealth.response.status, 200);
  assert.equal(
    sourceHealth.body.item.summary.source_kind_buckets.hermes_profile.missing,
    1
  );
  assert.equal(
    sourceHealth.body.item.agent_items[0].source_health.hermes_profile.status,
    'missing'
  );

  const sourceGaps = await requestJsonDirect({
    url: '/runtime/source-gaps?source_kind=hermes_session&output_candidate=false&limit=10',
    store,
    controllerSnapshotCollector,
    now
  });
  assert.equal(sourceGaps.response.status, 200);
  assert.deepEqual(
    sourceGaps.body.items.map((item) => ({
      agent_id: item.agent_id,
      evidence_role: item.evidence_role,
      source_status: item.source_status,
      output_candidate: item.output_candidate,
      unmapped: item.unmapped
    })),
    [
      {
        agent_id: 'app-engineering',
        evidence_role: 'runtime_presence',
        source_status: 'error',
        output_candidate: false,
        unmapped: false
      },
      {
        agent_id: null,
        evidence_role: 'runtime_unmapped',
        source_status: 'error',
        output_candidate: false,
        unmapped: true
      }
    ]
  );

  const proof = await requestJsonDirect({
    url: '/evidence-records/input-proof-summary?source_kind=hermes_session&output_candidate=false&limit=10',
    store,
    controllerSnapshotCollector,
    now
  });
  assert.equal(proof.response.status, 200);
  assert.equal(proof.body.item.total_count, 2);
  assert.equal(proof.body.item.proof_count, 2);
  assert.deepEqual(proof.body.item.source_input_ordinal_buckets, {
    '2': 1,
    '4': 1
  });

  const serializedPublicProof = JSON.stringify({
    sourceHealth: sourceHealth.body,
    sourceGaps: sourceGaps.body,
    proof: proof.body
  });
  for (const unsafeFragment of [
    'hermes://',
    'app-runtime-missing',
    'orphan-runtime-missing',
    'orphan-runtime-error',
    appAgent.session_ref,
    '/tmp'
  ]) {
    assert.equal(serializedPublicProof.includes(unsafeFragment), false, unsafeFragment);
  }
});

test('collector snapshot persists task evidence PATHS directory input with abstract provenance only', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-task-evidence-paths-'));
  const sourcesDir = path.join(root, 'task-source-dir-canary');
  const sourceFile = path.join(sourcesDir, 'expanded-source-path-canary.jsonl');
  const storeFile = path.join(root, 'prototype-store.jsonl');
  await mkdir(sourcesDir);
  await writeFile(
    sourceFile,
    `${JSON.stringify({
      task_ref: 'TASK.402',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:02:00.000Z',
      correlation_id: 'corr.task.402',
      agent_id: 'app-engineering'
    })}\n`
  );

  const taskEvidenceReader = taskEvidencePathsReaderFrom({ inputPaths: [sourcesDir] });
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readTaskEvidenceCandidates: () => taskEvidenceReader.readEvidenceCandidates()
  });
  const store = await createPrototypeStore({ filePath: storeFile });

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);

  const evidence = await requestJsonDirect({
    url: '/evidence-records?source_kind=kanban_fixture',
    store,
    controllerSnapshotCollector
  });
  assert.equal(evidence.response.status, 200);
  assert.deepEqual(evidence.body.items.map((item) => item.metadata.source_provenance), [
    {
      source_format: 'jsonl',
      source_index: 0,
      line: 1,
      source_input_ordinal: 1,
      source_file_ordinal: 1
    }
  ]);

  const responseText = JSON.stringify([collected.body, evidence.body]);
  const storeText = await readFile(storeFile, 'utf8');
  for (const leakedPath of [root, sourcesDir, sourceFile, path.basename(sourceFile)]) {
    assert.equal(responseText.includes(leakedPath), false, `response leaked ${leakedPath}`);
    assert.equal(storeText.includes(leakedPath), false, `store leaked ${leakedPath}`);
  }
});

test('collector snapshot rejects unsafe task evidence file paths before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-task-evidence-'));
  const taskEvidenceFile = path.join(root, 'task-evidence.jsonl');
  await writeFile(
    taskEvidenceFile,
    `${JSON.stringify({
      task_ref: 'TASK-401',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task-401',
      agent_id: 'app-engineering',
      path: '/tmp/private/token=task-secret'
    })}\n`
  );

  const taskEvidenceReader = taskEvidenceFileReaderFrom({ filePath: taskEvidenceFile });
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readTaskEvidenceCandidates: () => taskEvidenceReader.readEvidenceCandidates()
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Invalid task evidence input: 1 rejected task evidence record/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes('/tmp/private'), false);
  assert.equal(collected.body.details.includes('token='), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot returns invalid_runtime_evidence_input for too large task runtime input before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-task-evidence-cap-'));
  const validFile = path.join(root, '01-valid.jsonl');
  const oversizedFile = path.join(root, '02-oversized.jsonl');
  await writeFile(
    validFile,
    `${JSON.stringify({
      task_ref: 'TASK-411',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task-411',
      agent_id: 'app-engineering'
    })}\n`
  );
  await writeFile(oversizedFile, `${' '.repeat(1024 * 1024 + 1)}raw payload snippet should never escape`);

  const taskEvidenceReader = taskEvidencePathsReaderFrom({ inputPaths: [validFile, oversizedFile] });
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readTaskEvidenceCandidates: () => taskEvidenceReader.readEvidenceCandidates()
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Invalid task evidence input: 1 rejected task evidence record/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(path.basename(oversizedFile)), false);
  assert.equal(collected.body.details.includes('raw payload snippet'), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot error redaction hides unexpected internal failures before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-collector-error-'));
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      throw new Error(
        [
          'runtime exploded',
          '/Users/alice/private/runtime.json',
          'file:///tmp/private/runtime.json',
          'tmux://private-session/0.0',
          'hermes://profile/private-runtime',
          'session_ref=private-session',
          'profile_id=private-profile',
          'token=collector-secret',
          '{"raw_payload":true}'
        ].join(' ')
      );
    }
  };
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 500);
  assert.equal(collected.body.error, 'internal_error');
  assert.equal(collected.body.details, 'internal_error');
  assertNoPartialCollectorAppend(store, beforeCounts);
  assert.equal(JSON.stringify(collected.body).includes('/Users/alice'), false);
  assert.equal(JSON.stringify(collected.body).includes('file://'), false);
  assert.equal(JSON.stringify(collected.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(collected.body).includes('hermes://'), false);
  assert.equal(JSON.stringify(collected.body).includes('private-session'), false);
  assert.equal(JSON.stringify(collected.body).includes('private-profile'), false);
  assert.equal(JSON.stringify(collected.body).includes('token='), false);
  assert.equal(JSON.stringify(collected.body).includes('raw_payload'), false);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot rejects invalid Hermes runtime inputs before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const sourcesDir = path.join(root, 'runtime-sources');
  const validFile = path.join(sourcesDir, '01-valid.jsonl');
  const invalidFile = path.join(sourcesDir, '02-invalid.json');
  await mkdir(sourcesDir);
  await writeFile(
    validFile,
    `${JSON.stringify({
      source_kind: 'hermes_session',
      session_ref: '5-web3-app-engineering'
    })}\n`
  );
  await writeFile(
    invalidFile,
    JSON.stringify([
      {
        source_kind: 'hermes_profile',
        profile_id: 'app-profile',
        status: 'unknown'
      }
    ])
  );

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesReader({ inputPaths: [sourcesDir] })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime source input 2/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(sourcesDir), false);
  assert.equal(collected.body.details.includes(invalidFile), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot returns invalid_runtime_evidence_input for too many Hermes runtime records before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-cap-'));
  const runtimeFile = path.join(root, 'too-many-runtime-facts.json');
  await writeFile(
    runtimeFile,
    JSON.stringify(
      Array.from({ length: 1001 }, (_, index) => ({
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: `profile-${index + 1}`,
        evidence_ref: `hermes://profile/profile-${index + 1}`
      }))
    )
  );

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesReader({ inputPaths: [runtimeFile] })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime source input 1 has too many records/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(path.basename(runtimeFile)), false);
  assert.equal(collected.body.details.includes('hermes://'), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot labels missing Hermes runtime input before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const missingFile = path.join(root, 'missing-runtime-facts.jsonl');

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesReader({ inputPaths: [missingFile] })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime source input 1/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(missingFile), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot legacy Hermes runtime file read failure is labeled before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const missingFile = path.join(root, 'missing-runtime-facts.jsonl');

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesFileReader({ filePath: missingFile })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime sources file/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(missingFile), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot malformed Hermes runtime input is redacted before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const malformedFile = path.join(root, 'malformed-runtime-facts.jsonl');
  await writeFile(malformedFile, `${root}\n`);

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesReader({ inputPaths: [malformedFile] })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime source input 1/);
  assert.match(collected.body.details, /invalid JSON syntax/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(malformedFile), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('collector snapshot rejects unsafe Hermes runtime canaries before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const unsafeFile = path.join(root, 'unsafe-runtime-facts.jsonl');
  const canaries = [
    '/Users/alice/private',
    '/Volumes/HDD/private/runtime.json',
    '/tmp/private/token=runtime-secret',
    'tmux://private-session/0.0',
    'https://example.invalid/runtime-secret',
    'http://127.0.0.1:65535/runtime-secret',
    'file:///tmp/private/runtime-secret.json'
  ];
  await writeFile(
    unsafeFile,
    `${JSON.stringify({
      source_kind: 'hermes_profile',
      agent_id: 'app-engineering',
      profile_id: 'app-profile',
      evidence_ref: 'hermes://profile/app-profile',
      degraded_reasons: ['session heartbeat stale'],
      metadata: {
        note: canaries[4],
        file_hint: canaries[6],
        runtime_ref: 'hermes://profile/private-runtime'
      }
    })}\n`
  );

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesReader({ inputPaths: [unsafeFile] })
  });
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const beforeCounts = getAppendCounts(store);

  const collected = await requestJsonDirect({
    url: '/collectors/controller-snapshot',
    store,
    controllerSnapshotCollector,
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 422);
  assert.equal(collected.body.error, 'invalid_runtime_evidence_input');
  assert.match(collected.body.details, /Hermes runtime source input 1/);
  assert.match(collected.body.details, /unsafe field metadata/);
  assert.equal(collected.body.details.includes(root), false);
  assert.equal(collected.body.details.includes(unsafeFile), false);
  assert.equal(canaries.some((canary) => collected.body.details.includes(canary)), false);
  assert.equal(collected.body.details.includes('private-runtime'), false);
  assertNoPartialCollectorAppend(store, beforeCounts);
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('GET /collectors/controller-snapshot/evidence-coverage projects latest coverage read-only with filters', async (t) => {
  const selectedAgents = ['app-engineering', 'protocol-engineering', 'growth-revenue'].map((agentId) =>
    SEED_AGENTS.find((agent) => agent.agent_id === agentId)
  );
  const appAgent = selectedAgents[0];
  const protocolAgent = selectedAgents[1];
  const appTodoRef = path.join(appAgent.workspace_root, 'todo.md');
  const statsByPath = new Map([
    [appTodoRef, { mtime: '2026-03-09T18:04:00.000Z' }],
    [protocolAgent.workspace_root, { mtime: '2026-03-09T18:03:00.000Z' }]
  ]);
  let collectCount = 0;

  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      collectCount += 1;

      return collectControllerSnapshot({
        actorId,
        collectedAt,
        agents: selectedAgents,
        readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
        listTmuxPanes: async () => [
          {
            session_name: appAgent.session_ref,
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement evidence coverage API',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:04:30.000Z'
          }
        ]
      });
    }
  };

  const { baseUrl, store } = await createHarness(t, { controllerSnapshotCollector });

  const missing = await requestJson(`${baseUrl}/collectors/controller-snapshot/evidence-coverage`);
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body, { item: null });
  assert.equal(collectCount, 0);

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collectCount, 1);
  const collectedApp = collected.body.item.items.find((item) => item.agent_id === 'app-engineering');
  assert.equal(collectedApp.source_health.tmux_session.expected_session_ref, appAgent.session_ref);
  assert.equal(collectedApp.source_health.tmux_session.status, 'observed');
  assert.equal(collectedApp.source_health.workspace_files.missing_count, 2);
  const collectedGrowth = collected.body.item.items.find((item) => item.agent_id === 'growth-revenue');
  assert.equal(collectedGrowth.source_health.tmux_session.status, 'missing');
  assert.deepEqual(collected.body.item.runtime_source_evidence, {
    unmapped_tmux_sessions: []
  });

  const latestBeforeRead = store.getLatestCollectorReport();
  const coverage = await requestJson(`${baseUrl}/collectors/controller-snapshot/evidence-coverage`);
  assert.equal(coverage.response.status, 200);
  assert.deepEqual(coverage.body.item, {
    collected_at: '2026-03-09T18:05:00.000Z',
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
    actor_id: 'team-lead',
    ...collected.body.item.evidence_coverage
  });
  assert.equal(Object.hasOwn(coverage.body.item, 'items'), false);
  assert.equal(collectCount, 1);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);

  const appOnly = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?agent_id=app-engineering`
  );
  assert.deepEqual(appOnly.body.item.agent_items.map((item) => item.agent_id), ['app-engineering']);
  assert.equal(appOnly.body.item.evidence_ref_count, 2);
  assert.equal(appOnly.body.item.covered_agent_count, 1);
  assert.deepEqual(appOnly.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 1
  });
  assert.deepEqual(appOnly.body.item.low_confidence_agent_ids, []);

  const workspaceFile = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_file`
  );
  assert.deepEqual(workspaceFile.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);
  assert.deepEqual(workspaceFile.body.item.agent_items[0].source_kinds, [
    'tmux_observation',
    'workspace_file'
  ]);
  assert.deepEqual(workspaceFile.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 1
  });

  const unknownAgent = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?agent_id=unknown-agent`
  );
  assert.deepEqual(unknownAgent.body.item, {
    collected_at: '2026-03-09T18:05:00.000Z',
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
    actor_id: 'team-lead',
    evidence_ref_count: 0,
    covered_agent_count: 0,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 0,
      workspace_root: 0,
      tmux_observation: 0
    },
    agent_items: []
  });

  const workspaceRoot = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_root`
  );
  assert.deepEqual(workspaceRoot.body.item.agent_items.map((item) => item.agent_id), [
    'protocol-engineering'
  ]);
  assert.equal(workspaceRoot.body.item.evidence_ref_count, 1);
  assert.deepEqual(workspaceRoot.body.item.low_confidence_agent_ids, ['protocol-engineering']);

  const eventSourceKind = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=controller_event`
  );
  assert.deepEqual(eventSourceKind.body.item.agent_items, []);
  assert.deepEqual(eventSourceKind.body.item.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0
  });

  const lowConfidence = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?confidence_level=low`
  );
  assert.deepEqual(lowConfidence.body.item.agent_items.map((item) => item.agent_id), [
    'growth-revenue'
  ]);
  assert.equal(lowConfidence.body.item.covered_agent_count, 0);
  assert.deepEqual(lowConfidence.body.item.low_confidence_agent_ids, ['growth-revenue']);

  const blankFiltersWithLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=&confidence_level=&limit=2`
  );
  assert.deepEqual(blankFiltersWithLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering'
  ]);
  assert.deepEqual(blankFiltersWithLimit.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 1,
    tmux_observation: 1
  });

  const negativeLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?limit=-1`
  );
  assert.deepEqual(negativeLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering',
    'growth-revenue'
  ]);

  const nonNumericLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?limit=not-a-number`
  );
  assert.deepEqual(nonNumericLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering',
    'growth-revenue'
  ]);
});

test('GET /collectors/controller-snapshot/source-health projects latest source health read-only with filters', async (t) => {
  const selectedAgents = ['app-engineering', 'growth-revenue'].map((agentId) =>
    SEED_AGENTS.find((agent) => agent.agent_id === agentId)
  );
  const appAgent = selectedAgents[0];
  const statsByPath = new Map([
    [appAgent.workspace_root, { mtime: '2026-03-09T18:03:30.000Z' }],
    [path.join(appAgent.workspace_root, 'outbox.md'), { mtime: '2026-03-09T18:04:00.000Z' }]
  ]);
  let collectCount = 0;

  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      collectCount += 1;

      return collectControllerSnapshot({
        actorId,
        collectedAt,
        agents: selectedAgents,
        readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
        listTmuxPanes: async () => [
          {
            session_name: appAgent.session_ref,
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement source health API',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:04:30.000Z'
          },
          {
            session_name: 'unmapped-session',
            window_index: '0',
            pane_index: '0',
            pane_id: '%99',
            pane_title: 'unmapped',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:02:00.000Z'
          }
        ]
      });
    }
  };

  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const missing = await requestJson(`${baseUrl}/collectors/controller-snapshot/source-health`);
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body, { item: null });
  assert.equal(collectCount, 0);

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collectCount, 1);
  const recordsAfterPost = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const recordCountAfterPost = recordsAfterPost.length;

  const latestBeforeRead = store.getLatestCollectorReport();
  const sourceHealth = await requestJson(`${baseUrl}/collectors/controller-snapshot/source-health`);
  assert.equal(sourceHealth.response.status, 200);
  assert.equal(sourceHealth.body.item.collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(sourceHealth.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:05:00.000Z');
  assert.equal(sourceHealth.body.item.actor_id, 'team-lead');
  assert.deepEqual(sourceHealth.body.item.runtime_source_evidence.unmapped_tmux_sessions, [
    {
      status: 'observed',
      observed_count: 1,
      last_observed_at: '2026-03-09T18:02:00.000Z'
    }
  ]);
  assert.deepEqual(sourceHealth.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.workspace_root.status, 'observed');
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.workspace_files.status, 'degraded');
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.tmux_session.status, 'observed');
  assert.equal(
    sourceHealth.body.item.agent_items[0].collector_snapshot_id,
    'collector-snapshot:2026-03-09T18:05:00.000Z'
  );
  assert.equal(sourceHealth.body.item.agent_items[0].evidence_ref_count, 3);
  assert.equal(sourceHealth.body.item.agent_items[0].latest_evidence_at, '2026-03-09T18:04:30.000Z');
  assert.equal(JSON.stringify(sourceHealth.body).includes('/tmp/source-health'), false);
  assert.equal(JSON.stringify(sourceHealth.body).includes('tmux://'), false);
  assert.equal(Object.hasOwn(sourceHealth.body.item, 'items'), false);
  assert.equal(collectCount, 1);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);

  const missingTmux = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?source_kind=tmux_observation&status=missing`
  );
  assert.equal(missingTmux.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:05:00.000Z');
  assert.deepEqual(missingTmux.body.item.agent_items.map((item) => item.agent_id), [
    'growth-revenue'
  ]);
  assert.deepEqual(Object.keys(missingTmux.body.item.agent_items[0].source_health), [
    'tmux_session'
  ]);
  assert.deepEqual(missingTmux.body.item.summary.status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 1,
    error: 0
  });

  const aliasAndLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?source_kind=workspace_file&limit=1`
  );
  assert.deepEqual(aliasAndLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);
  assert.deepEqual(Object.keys(aliasAndLimit.body.item.agent_items[0].source_health), [
    'workspace_files'
  ]);

  const blankFilters = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?agent_id=&source_kind=&status=&limit=-1`
  );
  assert.deepEqual(blankFilters.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);

  const records = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.length, recordCountAfterPost);
  assert.equal(records.filter((record) => record.kind === 'event').length, 2);
  assert.equal(records.filter((record) => record.kind === 'heartbeat').length, 1);
  assert.ok(records.some((record) => record.kind === 'evidence_record'));
  assert.equal(records.filter((record) => record.kind === 'collector_snapshot').length, 1);
  assert.equal(records[records.length - 1].kind, 'collector_snapshot');
});

test('GET /collectors/controller-snapshot/summary returns latest safe summary read-only', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET summary must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-summary-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const missing = await requestJsonDirect({
    url: '/collectors/controller-snapshot/summary',
    store,
    controllerSnapshotCollector
  });
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body.item, {
    has_snapshot: false,
    collected_at: null,
    agent_count: 0,
    heartbeat_count: 0,
    tmux_observed_count: 0,
    workspace_observed_count: 0,
    reboot_recommended_count: 0,
    evidence_ref_count: 0,
    covered_agent_count: 0,
    low_confidence_agent_count: 0,
    source_kind_buckets: {
      workspace_file: 0,
      workspace_root: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      task_evidence: 0
    },
    source_health_buckets: {
      source_kind_buckets: {
        workspace_root: 0,
        workspace_files: 0,
        tmux_session: 0,
        hermes_profile: 0,
        hermes_session: 0
      },
      status_buckets: {
        observed: 0,
        degraded: 0,
        missing: 0,
        error: 0
      }
    },
    runtime_source_evidence: {
      unmapped_tmux_session_count: 0,
      unmapped_hermes_source_count: 0,
      unmapped_task_evidence_count: 0,
      latest_observed_at: null
    }
  });
  assert.equal(collectCount, 0);

  const report = createRouteParityCollectorReport();
  report.evidence_coverage.source_kind_buckets.hermes_profile = 1;
  report.evidence_coverage.source_kind_buckets.hermes_session = 1;
  report.evidence_coverage.source_kind_buckets.task_evidence = 1;
  await store.appendCollectorReport(report);
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const countsBeforeRead = store.getCounts();
  const latestBeforeRead = store.getLatestCollectorReport();

  const summary = await requestJsonDirect({
    url: '/collectors/controller-snapshot/summary',
    store,
    controllerSnapshotCollector
  });
  assert.equal(summary.response.status, 200);
  assert.deepEqual(summary.body.item, {
    has_snapshot: true,
    collected_at: '2026-03-09T18:06:00.000Z',
    agent_count: 2,
    heartbeat_count: 1,
    tmux_observed_count: 1,
    workspace_observed_count: 2,
    reboot_recommended_count: 0,
    evidence_ref_count: 3,
    covered_agent_count: 1,
    low_confidence_agent_count: 1,
    source_kind_buckets: {
      workspace_file: 2,
      workspace_root: 0,
      tmux_observation: 1,
      hermes_profile: 1,
      hermes_session: 1,
      task_evidence: 1
    },
    source_health_buckets: {
      source_kind_buckets: {
        workspace_root: 2,
        workspace_files: 2,
        tmux_session: 1,
        hermes_profile: 0,
        hermes_session: 0
      },
      status_buckets: {
        observed: 2,
        degraded: 1,
        missing: 2,
        error: 0
      }
    },
    runtime_source_evidence: {
      unmapped_tmux_session_count: 1,
      unmapped_hermes_source_count: 0,
      unmapped_task_evidence_count: 0,
      latest_observed_at: '2026-03-09T18:05:50.000Z'
    }
  });
  const serialized = JSON.stringify(summary.body);
  assert.equal(serialized.includes('/tmp/route-parity'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('5-web3-app-engineering'), false);
  assert.equal(serialized.includes('unmapped-route-parity'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(Object.hasOwn(summary.body.item, 'items'), false);
  assert.equal(Object.hasOwn(summary.body.item, 'actor_id'), false);
  assert.equal(collectCount, 0);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const unsafeCollectedAt = '/tmp/route-parity/malformed-collected-at-token-sk-live';
  const unsafeObservedAt = 'tmux://unsafe-route-parity/0.0?token=secret-token-like';
  const unsafeReport = createRouteParityCollectorReport();
  unsafeReport.collected_at = unsafeCollectedAt;
  unsafeReport.runtime_source_evidence = {
    unmapped_tmux_sessions: [
      {
        session_name: 'unsafe-route-parity-token-like',
        pane_refs: [unsafeObservedAt],
        observed_count: 1,
        status: 'observed',
        last_observed_at: 'March 9, 2026 18:05:50 UTC',
        observed_at: unsafeObservedAt,
        degraded_reasons: []
      }
    ],
    unmapped_hermes_sources: [
      {
        source_kind: 'hermes_profile',
        evidence_ref: '/tmp/route-parity/profile-secret-token-like.json',
        observed_at: '/tmp/route-parity/not-a-timestamp-secret-token-like',
        status: 'observed'
      }
    ],
    unmapped_task_evidence: []
  };
  await store.appendCollectorReport(unsafeReport);

  const unsafeSummary = await requestJsonDirect({
    url: '/collectors/controller-snapshot/summary',
    store,
    controllerSnapshotCollector
  });
  assert.equal(unsafeSummary.response.status, 200);
  assert.equal(unsafeSummary.body.item.collected_at, null);
  assert.equal(
    unsafeSummary.body.item.runtime_source_evidence.latest_observed_at,
    '2026-03-09T18:05:50.000Z'
  );
  assert.equal(unsafeSummary.text.includes(unsafeCollectedAt), false);
  assert.equal(unsafeSummary.text.includes(unsafeObservedAt), false);
  assert.equal(unsafeSummary.text.includes('secret-token-like'), false);
  assert.equal(unsafeSummary.text.includes('/tmp/route-parity'), false);
  assert.equal(collectCount, 0);
});

test('GET /collectors/controller-snapshot/summary projects requested snapshot id safely', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET summary must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-summary-id-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createRouteParityCollectorReport();
  const secondReport = createRouteParityCollectorReport();
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.summary.workspace_observed_count = 0;
  secondReport.evidence_coverage.evidence_ref_count = 1;
  secondReport.evidence_coverage.low_confidence_agent_ids = [];
  secondReport.items[0].workspace_observations = [];
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const countsBeforeRead = store.getCounts();

  const historical = await requestJsonDirect({
    url:
      '/collectors/controller-snapshot/summary?collector_snapshot_id=' +
      encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z'),
    store,
    controllerSnapshotCollector
  });
  assert.equal(historical.response.status, 200);
  assert.equal(historical.body.item.has_snapshot, true);
  assert.equal(historical.body.item.collected_at, '2026-03-09T18:06:00.000Z');
  assert.equal(historical.body.item.workspace_observed_count, 2);
  assert.equal(historical.body.item.evidence_ref_count, 3);
  assert.equal(JSON.stringify(historical.body).includes('collector_snapshot_id'), false);

  const latest = await requestJsonDirect({
    url: '/collectors/controller-snapshot/summary',
    store,
    controllerSnapshotCollector
  });
  assert.equal(latest.response.status, 200);
  assert.equal(latest.body.item.collected_at, '2026-03-09T18:07:00.000Z');
  assert.equal(latest.body.item.workspace_observed_count, 0);
  assert.equal(latest.body.item.evidence_ref_count, 1);

  const unknown = await requestJsonDirect({
    url: '/collectors/controller-snapshot/summary?collector_snapshot_id=collector-snapshot%3Aunknown',
    store,
    controllerSnapshotCollector
  });
  assert.equal(unknown.response.status, 200);
  assert.deepEqual(unknown.body.item, {
    has_snapshot: false,
    collected_at: null,
    agent_count: 0,
    heartbeat_count: 0,
    tmux_observed_count: 0,
    workspace_observed_count: 0,
    reboot_recommended_count: 0,
    evidence_ref_count: 0,
    covered_agent_count: 0,
    low_confidence_agent_count: 0,
    source_kind_buckets: {
      workspace_file: 0,
      workspace_root: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      task_evidence: 0
    },
    source_health_buckets: {
      source_kind_buckets: {
        workspace_root: 0,
        workspace_files: 0,
        tmux_session: 0,
        hermes_profile: 0,
        hermes_session: 0
      },
      status_buckets: {
        observed: 0,
        degraded: 0,
        missing: 0,
        error: 0
      }
    },
    runtime_source_evidence: {
      unmapped_tmux_session_count: 0,
      unmapped_hermes_source_count: 0,
      unmapped_task_evidence_count: 0,
      latest_observed_at: null
    }
  });
  assert.equal(unknown.text.includes('collector-snapshot:unknown'), false);
  assert.equal(collectCount, 0);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /collectors/controller-snapshot/append-proof returns latest collector append proof read-only', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET append proof must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-append-proof-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createRouteParityCollectorReport();
  const secondReport = createRouteParityCollectorReport();
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].workspace_observations = [];
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const countsBeforeRead = store.getCounts();

  const latest = await requestJsonDirect({
    url: '/collectors/controller-snapshot/append-proof',
    store,
    controllerSnapshotCollector
  });
  assert.equal(latest.response.status, 200);
  assert.deepEqual(latest.body.item, {
    has_snapshot: true,
    snapshot_append_index: 16,
    evidence_record_count: 4,
    first_evidence_append_index: 12,
    last_evidence_append_index: 15,
    ordering_status: 'ordered',
    source_kind_buckets: {
      workspace_root: 2,
      workspace_file: 0,
      tmux_observation: 2,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 2,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 1,
      runtime_presence: 0,
      runtime_unmapped: 1,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 3,
      degraded: 0,
      missing: 1,
      error: 0
    },
    output_candidate_buckets: { true: 1, false: 3 },
    mapped_buckets: { mapped: 3, unmapped: 1 }
  });
  assert.equal(JSON.stringify(latest.body).includes('collector-snapshot:'), false);
  assert.equal(JSON.stringify(latest.body).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(latest.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(latest.body).includes('degraded_reasons'), false);

  const historical = await requestJsonDirect({
    url:
      '/collectors/controller-snapshot/append-proof?collector_snapshot_id=' +
      encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z'),
    store,
    controllerSnapshotCollector
  });
  assert.equal(historical.response.status, 200);
  assert.equal(historical.body.item.snapshot_append_index, 10);
  assert.equal(historical.body.item.evidence_record_count, 6);
  assert.equal(historical.body.item.first_evidence_append_index, 4);
  assert.equal(historical.body.item.last_evidence_append_index, 9);

  const unknown = await requestJsonDirect({
    url:
      '/collectors/controller-snapshot/append-proof?collector_snapshot_id=' +
      encodeURIComponent('/tmp/route-parity-token-sk-live'),
    store,
    controllerSnapshotCollector
  });
  assert.equal(unknown.response.status, 200);
  assert.equal(unknown.body.item.has_snapshot, false);
  assert.equal(unknown.body.item.ordering_status, 'missing_snapshot');
  assert.equal(unknown.text.includes('/tmp/route-parity-token-sk-live'), false);
  assert.equal(collectCount, 0);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /collectors/controller-snapshot/diff projects compact read-only snapshot deltas', async (t) => {
  const { baseUrl, store, storeFile } = await createHarness(t);
  const firstReport = createRouteParityCollectorReport();
  const secondBase = createRouteParityCollectorReport();
  const secondReport = {
    ...secondBase,
    collected_at: '2026-03-09T18:11:00.000Z',
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        ...(secondBase.runtime_source_evidence.unmapped_tmux_sessions || []),
        {
          session_name: 'route-runtime-delta-secret',
          pane_refs: ['tmux://route-runtime-delta-secret/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:10:50.000Z',
          degraded_reasons: ['route-runtime-delta-reason']
        }
      ],
      unmapped_hermes_sources: [
        {
          source_kind: 'hermes_session',
          evidence_ref: 'hermes://route-runtime-delta-secret',
          profile_id: 'route-runtime-delta-profile-secret',
          session_ref: 'route-runtime-delta-session-secret',
          observed_at: '2026-03-09T18:10:45.000Z',
          status: 'observed',
          degraded_reasons: ['route-runtime-delta-reason'],
          metadata: {
            token: 'route-runtime-delta-token'
          }
        }
      ],
      unmapped_task_evidence: [
        {
          task_ref: 'TASK-ROUTE-DELTA',
          source_kind: 'kanban_fixture',
          status: 'observed',
          observed_at: '2026-03-09T18:10:55.000Z',
          correlation_id: 'corr-route-runtime-delta'
        }
      ]
    },
    items: secondBase.items.map((item) =>
      item.agent_id === 'app-engineering'
        ? {
          ...item,
          source_health: {
            ...item.source_health,
            workspace_files: {
              ...item.source_health.workspace_files,
              status: 'observed',
              missing_count: 0,
              degraded_reasons: []
            }
          }
        }
        : item
    )
  };

  const missing = await requestJson(`${baseUrl}/collectors/controller-snapshot/diff`);
  assert.equal(missing.response.status, 200);
  assert.equal(missing.body.item, null);

  await store.appendCollectorReport(firstReport);
  const oneSided = await requestJson(`${baseUrl}/collectors/controller-snapshot/diff`);
  assert.equal(oneSided.response.status, 200);
  assert.equal(oneSided.body.item, null);

  await store.appendCollectorReport(secondReport);
  const beforeRead = await readFile(storeFile, 'utf8');
  const beforeCounts = store.getCounts();

  const diff = await requestJson(`${baseUrl}/collectors/controller-snapshot/diff?limit=10`);
  assert.equal(diff.response.status, 200);
  assert.equal(diff.body.item.from_collector_snapshot_id, 'collector-snapshot:2026-03-09T18:06:00.000Z');
  assert.equal(diff.body.item.to_collector_snapshot_id, 'collector-snapshot:2026-03-09T18:11:00.000Z');
  assert.deepEqual(diff.body.item.runtime_source_evidence_delta, {
    unmapped_tmux_session_count_delta: 1,
    unmapped_hermes_source_count_delta: 1,
    unmapped_task_evidence_count_delta: 1
  });
  assert.deepEqual(diff.body.item.agent_changes, [
    {
      agent_id: 'app-engineering',
      change_type: 'changed',
      heartbeat_changed: false,
      source_health_status_changes: {
        workspace_files: {
          from: 'degraded',
          to: 'observed'
        }
      }
    }
  ]);
  assert.equal(JSON.stringify(diff.body).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(diff.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(diff.body).includes('evidence_refs'), false);
  assert.equal(JSON.stringify(diff.body).includes('metadata'), false);
  assert.equal(JSON.stringify(diff.body).includes('runtime-delta-secret'), false);
  assert.equal(JSON.stringify(diff.body).includes('degraded_reasons'), false);
  assert.equal(JSON.stringify(diff.body).includes('token'), false);
  assert.deepEqual(store.getCounts(), beforeCounts);
  assert.equal(await readFile(storeFile, 'utf8'), beforeRead);
});

test('GET /collectors/controller-snapshot/source-health projects requested historical snapshot', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET source-health must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });
  const firstReport = createRouteParityCollectorReport();
  const secondReport = structuredClone(firstReport);
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const latestBeforeRead = store.getLatestCollectorReport();

  const historical = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?collector_snapshot_id=${encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z')}&agent_id=app-engineering&source_kind=workspace_file&status=degraded&limit=1`
  );
  assert.equal(historical.response.status, 200);
  assert.equal(historical.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:06:00.000Z');
  assert.deepEqual(historical.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);
  assert.equal(historical.body.item.agent_items[0].source_health.workspace_files.status, 'degraded');

  const unknown = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?collector_snapshot_id=${encodeURIComponent('collector-snapshot:unknown')}`
  );
  assert.equal(unknown.response.status, 200);
  assert.deepEqual(unknown.body, { item: null });

  const latest = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?source_kind=workspace_file&status=observed&limit=1`
  );
  assert.equal(latest.response.status, 200);
  assert.equal(latest.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:07:00.000Z');
  assert.deepEqual(latest.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);

  assert.equal(collectCount, 0);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /runtime/source-gaps returns compact gap and unmapped evidence read-only', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /runtime/source-gaps must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const missing = await requestJson(`${baseUrl}/runtime/source-gaps`);
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body, { items: [] });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [
          '/tmp/source-gaps/app',
          '/tmp/source-gaps/app/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/source-gaps/app/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:05:00.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_current_command: 'nvim',
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/source-gaps/app',
            last_observed_at: '2026-03-09T18:04:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            last_observed_at: '2026-03-09T18:05:00.000Z',
            degraded_reasons: ['missing workspace files: inbox.md']
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        }
      }
    ]
  });
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const latestBeforeRead = store.getLatestCollectorReport();

  const response = await requestJson(`${baseUrl}/runtime/source-gaps?newest_first=true&limit=10`);
  const summary = await requestJson(`${baseUrl}/runtime/source-gaps/summary?newest_first=true&limit=1`);
  const agentSummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/agent-summary?newest_first=true&limit=1`
  );
  const trend = await requestJson(`${baseUrl}/runtime/source-gaps/trend?newest_first=true&limit=1`);
  const lifecycle = await requestJson(
    `${baseUrl}/runtime/source-gaps/lifecycle?newest_first=true&limit=1`
  );
  const transitionSummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/transition-summary?newest_first=true&limit=1`
  );
  const observedLifecycle = await requestJson(
    `${baseUrl}/runtime/source-gaps/lifecycle?lifecycle_state=observed_unmapped&newest_first=true&limit=1`
  );
  const observedTransitionSummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/transition-summary?lifecycle_state=observed_unmapped&newest_first=true&limit=1`
  );
  const unknownLifecycle = await requestJson(
    `${baseUrl}/runtime/source-gaps/lifecycle?lifecycle_state=token%3Dsource-gap-secret&newest_first=true&limit=1`
  );
  const unknownTransitionSummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/transition-summary?source_kind=token%3Dsource-gap-secret&lifecycle_state=token%3Dsource-gap-secret&newest_first=true&limit=1`
  );
  const emptyFilterQuery = new URLSearchParams({
    agent_id: 'missing-source-gap-agent',
    source_kind: 'tmux://source-gap-empty-source/0.0',
    source_status: 'token=source-gap-empty-status',
    observed_since: '2026-03-09T19:00:00.000Z',
    collected_since: '2026-03-09T19:00:00.000Z',
    newest_first: 'true',
    limit: '2'
  });
  const emptyList = await requestJson(`${baseUrl}/runtime/source-gaps?${emptyFilterQuery}`);
  const emptySummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/summary?${emptyFilterQuery}`
  );
  const emptyAgentSummary = await requestJson(
    `${baseUrl}/runtime/source-gaps/agent-summary?${emptyFilterQuery}`
  );
  const emptyTrend = await requestJson(`${baseUrl}/runtime/source-gaps/trend?${emptyFilterQuery}`);
  emptyFilterQuery.set('lifecycle_state', 'token=source-gap-empty-lifecycle');
  const emptyLifecycle = await requestJson(
    `${baseUrl}/runtime/source-gaps/lifecycle?${emptyFilterQuery}`
  );

  assert.equal(response.response.status, 200);
  assert.deepEqual(
    response.body.items.map((item) => ({
      agent_id: item.agent_id,
      source_kind: item.source_kind,
      evidence_role: item.evidence_role,
      source_status: item.source_status,
      output_candidate: item.output_candidate,
      unmapped: item.unmapped
    })),
    [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        output_candidate: false,
        unmapped: true
      },
      {
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'degraded',
        output_candidate: true,
        unmapped: false
      }
    ]
  );
  assert.equal(response.body.items.some((item) => Object.hasOwn(item, 'evidence_id')), false);
  assert.equal(response.body.items.some((item) => Object.hasOwn(item, 'evidence_ref')), false);
  assert.equal(response.body.items.some((item) => Object.hasOwn(item, 'metadata')), false);
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.item.total_count, 2);
  assert.equal(summary.body.item.returned_limit, 1);
  assert.equal(summary.body.item.mapped_count, 1);
  assert.equal(summary.body.item.unmapped_count, 1);
  assert.deepEqual(summary.body.item.output_candidate_buckets, { true: 1, false: 1 });
  assert.equal(summary.body.item.source_kind_buckets.workspace_file, 1);
  assert.equal(summary.body.item.source_kind_buckets.tmux_observation, 1);
  assert.equal(summary.body.item.evidence_role_buckets.agent_output, 1);
  assert.equal(summary.body.item.evidence_role_buckets.runtime_unmapped, 1);
  assert.equal(summary.body.item.source_status_buckets.degraded, 1);
  assert.equal(summary.body.item.source_status_buckets.observed, 1);
  assert.deepEqual(summary.body.item.collector_snapshot_id_buckets, {
    'collector-snapshot:2026-03-09T18:06:00.000Z': 2
  });
  assert.equal(summary.body.item.first_observed_at, '2026-03-09T18:05:00.000Z');
  assert.equal(summary.body.item.last_observed_at, '2026-03-09T18:05:50.000Z');
  assert.equal(summary.body.item.first_collected_at, '2026-03-09T18:06:00.000Z');
  assert.equal(summary.body.item.last_collected_at, '2026-03-09T18:06:00.000Z');
  assert.equal(Object.hasOwn(summary.body.item, 'items'), false);
  assert.equal(Object.hasOwn(summary.body.item, 'evidence_id'), false);
  assert.equal(Object.hasOwn(summary.body.item, 'evidence_ref'), false);
  assert.equal(Object.hasOwn(summary.body.item, 'metadata'), false);
  assert.equal(agentSummary.response.status, 200);
  assert.deepEqual(agentSummary.body.item, {
    total_count: 2,
    total_groups: 2,
    returned_limit: 1,
    groups: [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        record_count: 1,
        mapped_count: 0,
        unmapped_count: 1,
        output_candidate_buckets: { true: 0, false: 1 },
        evidence_role_buckets: { runtime_unmapped: 1 },
        source_status_buckets: { observed: 1 },
        first_observed_at: '2026-03-09T18:05:50.000Z',
        last_observed_at: '2026-03-09T18:05:50.000Z',
        first_collected_at: '2026-03-09T18:06:00.000Z',
        last_collected_at: '2026-03-09T18:06:00.000Z'
      }
    ]
  });
  assert.equal(JSON.stringify(agentSummary.body).includes('/tmp/source-gaps'), false);
  assert.equal(JSON.stringify(agentSummary.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(agentSummary.body).includes('evidence_id'), false);
  assert.equal(JSON.stringify(agentSummary.body).includes('evidence_ref'), false);
  assert.equal(JSON.stringify(agentSummary.body).includes('metadata'), false);
  assert.equal(trend.response.status, 200);
  assert.deepEqual(trend.body.item, {
    bucket: 'hour',
    total_count: 2,
    total_buckets: 1,
    returned_limit: 1,
    buckets: [
      {
        bucket_start: '2026-03-09T18:00:00.000Z',
        total_count: 2,
        mapped_count: 1,
        unmapped_count: 1,
        output_candidate_buckets: { true: 1, false: 1 },
        source_kind_buckets: { tmux_observation: 1, workspace_file: 1 },
        evidence_role_buckets: { agent_output: 1, runtime_unmapped: 1 },
        source_status_buckets: { degraded: 1, observed: 1 }
      }
    ]
  });
  assert.equal(JSON.stringify(trend.body).includes('/tmp/source-gaps'), false);
  assert.equal(JSON.stringify(trend.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(trend.body).includes('evidence_id'), false);
  assert.equal(JSON.stringify(trend.body).includes('evidence_ref'), false);
  assert.equal(JSON.stringify(trend.body).includes('metadata'), false);
  assert.equal(JSON.stringify(trend.body).includes('degraded_reasons'), false);
  assert.equal(lifecycle.response.status, 200);
  assert.deepEqual(lifecycle.body.item, {
    total_count: 2,
    total_groups: 2,
    returned_limit: 1,
    groups: [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        record_count: 1,
        current_status: 'observed',
        lifecycle_state: 'observed_unmapped',
        first_observed_at: '2026-03-09T18:05:50.000Z',
        last_observed_at: '2026-03-09T18:05:50.000Z',
        first_collected_at: '2026-03-09T18:06:00.000Z',
        last_collected_at: '2026-03-09T18:06:00.000Z',
        snapshot_count: 1,
        source_status_buckets: { observed: 1 }
      }
    ]
  });
  assert.equal(JSON.stringify(lifecycle.body).includes('/tmp/source-gaps'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('evidence_id'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('evidence_ref'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('collector_snapshot_id'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('metadata'), false);
  assert.equal(JSON.stringify(lifecycle.body).includes('degraded_reasons'), false);
  assert.equal(transitionSummary.response.status, 200);
  assert.deepEqual(transitionSummary.body.item, {
    total_records: 2,
    total_groups: 2,
    returned_limit: 1,
    lifecycle_state_buckets: {
      opened: { group_count: 1, record_count: 1 },
      continuing: { group_count: 0, record_count: 0 },
      resolved: { group_count: 0, record_count: 0 },
      observed_unmapped: { group_count: 1, record_count: 1 }
    },
    source_kind_buckets: {
      workspace_root: { group_count: 0, record_count: 0 },
      workspace_file: { group_count: 1, record_count: 1 },
      tmux_observation: { group_count: 1, record_count: 1 },
      hermes_profile: { group_count: 0, record_count: 0 },
      hermes_session: { group_count: 0, record_count: 0 }
    },
    source_status_buckets: {
      observed: { group_count: 1, record_count: 1 },
      degraded: { group_count: 1, record_count: 1 },
      missing: { group_count: 0, record_count: 0 },
      error: { group_count: 0, record_count: 0 }
    },
    mapped_state_buckets: {
      mapped: { group_count: 1, record_count: 1 },
      unmapped: { group_count: 1, record_count: 1 }
    },
    latest_observed_at: '2026-03-09T18:05:50.000Z',
    latest_collected_at: '2026-03-09T18:06:00.000Z'
  });
  assert.equal(JSON.stringify(transitionSummary.body).includes('/tmp/source-gaps'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('agent_id'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('evidence_id'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('evidence_ref'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('collector_snapshot_id'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('metadata'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('degraded_reasons'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('current_status'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('snapshot_count'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('task_reference'), false);
  assert.equal(JSON.stringify(transitionSummary.body).includes('task_fixture'), false);
  assert.equal(observedLifecycle.response.status, 200);
  assert.deepEqual(observedLifecycle.body.item, {
    total_count: 1,
    total_groups: 1,
    returned_limit: 1,
    groups: lifecycle.body.item.groups
  });
  assert.equal(observedTransitionSummary.response.status, 200);
  assert.deepEqual(observedTransitionSummary.body.item.lifecycle_state_buckets, {
    opened: { group_count: 0, record_count: 0 },
    continuing: { group_count: 0, record_count: 0 },
    resolved: { group_count: 0, record_count: 0 },
    observed_unmapped: { group_count: 1, record_count: 1 }
  });
  assert.equal(observedTransitionSummary.body.item.total_records, 1);
  assert.equal(observedTransitionSummary.body.item.total_groups, 1);
  assert.equal(unknownLifecycle.response.status, 200);
  assert.deepEqual(unknownLifecycle.body.item, {
    total_count: 0,
    total_groups: 0,
    returned_limit: 1,
    groups: []
  });
  assert.equal(unknownTransitionSummary.response.status, 200);
  assert.equal(unknownTransitionSummary.body.item.total_records, 0);
  assert.equal(unknownTransitionSummary.body.item.total_groups, 0);
  assert.equal(unknownTransitionSummary.body.item.latest_observed_at, null);
  assert.equal(unknownTransitionSummary.body.item.latest_collected_at, null);
  assert.equal(JSON.stringify(unknownLifecycle.body).includes('source-gap-secret'), false);
  assert.equal(JSON.stringify(unknownTransitionSummary.body).includes('source-gap-secret'), false);
  assert.equal(emptyList.response.status, 200);
  assert.deepEqual(emptyList.body, { items: [] });
  assert.equal(emptySummary.response.status, 200);
  assert.deepEqual(emptySummary.body.item, {
    total_count: 0,
    returned_limit: 2,
    mapped_count: 0,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 0,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 0,
      degraded: 0,
      missing: 0,
      error: 0
    },
    collector_snapshot_id_buckets: {},
    first_observed_at: null,
    last_observed_at: null,
    first_collected_at: null,
    last_collected_at: null
  });
  assert.equal(emptyAgentSummary.response.status, 200);
  assert.deepEqual(emptyAgentSummary.body.item, {
    total_count: 0,
    total_groups: 0,
    returned_limit: 2,
    groups: []
  });
  assert.equal(emptyTrend.response.status, 200);
  assert.deepEqual(emptyTrend.body.item, {
    bucket: 'hour',
    total_count: 0,
    total_buckets: 0,
    returned_limit: 2,
    buckets: []
  });
  assert.equal(emptyLifecycle.response.status, 200);
  assert.deepEqual(emptyLifecycle.body.item, {
    total_count: 0,
    total_groups: 0,
    returned_limit: 2,
    groups: []
  });
  const emptySerialized = JSON.stringify({
    list: emptyList.body,
    summary: emptySummary.body,
    agent_summary: emptyAgentSummary.body,
    trend: emptyTrend.body,
    lifecycle: emptyLifecycle.body
  });
  for (const canary of [
    '/tmp/source-gaps',
    'tmux://5-web3-app-engineering/0.1',
    'missing-source-gap-agent',
    'tmux://source-gap-empty-source/0.0',
    'token=source-gap-empty-status',
    'token=source-gap-empty-lifecycle'
  ]) {
    assert.equal(emptySerialized.includes(canary), false, `leaked canary: ${canary}`);
  }
  assert.equal(collectCount, 0);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /collectors/controller-snapshot/history returns bounded read-only summaries', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET history must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });
  const firstReport = createRouteParityCollectorReport();
  const secondReport = structuredClone(firstReport);
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];
  secondReport.summary.workspace_observed_count = 3;

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const latestBeforeRead = store.getLatestCollectorReport();

  const response = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/history?agent_id=app-engineering&source_kind=workspace_file&status=observed&collected_since=${encodeURIComponent('2026-03-09T18:07:00.000Z')}&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.total_count, 1);
  assert.equal(response.body.item.returned_limit, 1);
  assert.deepEqual(response.body.item.items.map((item) => item.collector_snapshot_id), [
    'collector-snapshot:2026-03-09T18:07:00.000Z'
  ]);
  assert.equal(Object.hasOwn(response.body.item.items[0], 'items'), false);
  assert.equal(Object.hasOwn(response.body.item.items[0], 'runtime_source_evidence'), false);
  assert.equal(collectCount, 0);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /evidence-records/schema read route purity does not inspect evidence records', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /evidence-records/schema must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-schema-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  store.listEvidenceRecords = () => {
    throw new Error('schema route must not list evidence records');
  };
  store.getEvidenceRecord = () => {
    throw new Error('schema route must not resolve schema as an evidence id');
  };

  const response = await requestJsonDirect({
    url: '/evidence-records/schema?limit=1&mapped=true',
    store,
    controllerSnapshotCollector
  });
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.item.limit, {
    default: 50,
    max: 200
  });
  assert.equal(response.body.item.source_kinds.includes('workspace_file'), true);
  assert.equal(response.body.item.evidence_roles.includes('runtime_unmapped'), true);
  assert.equal(JSON.stringify(response.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(response.body).includes('/tmp/'), false);
  assert.equal(collectCount, 0);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /storage/schema exposes static catalog without reading storage rows', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /storage/schema must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-storage-schema-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  store.getStorageReplayManifest = () => {
    throw new Error('schema route must not inspect replay manifest rows');
  };
  store.getStorageIndexHealth = () => {
    throw new Error('schema route must not inspect storage indexes');
  };

  const response = await requestJsonDirect({
    url: '/storage/schema?ignored=/tmp/storage-secret&token=<script>',
    store,
    controllerSnapshotCollector
  });
  assert.equal(response.response.status, 200);
  assert.deepEqual(
    response.body.item.routes.map((route) => route.name),
    ['replay_manifest', 'index_health']
  );
  assert.deepEqual(response.body.item.response_fields.replay_manifest, [
    'record_count',
    'record_kind_buckets',
    'evidence_summary',
    'canonical_record_hash'
  ]);
  assert.deepEqual(response.body.item.backends, ['jsonl', 'sqlite']);
  assert.deepEqual(response.body.item.statuses, ['ok', 'degraded']);
  assert.equal(response.body.item.sidecar_statuses.includes('stale'), true);
  assert.equal(response.body.item.evidence_query_probe_statuses.includes('complete'), true);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('/tmp/storage-secret'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('collector-snapshot:'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
  assert.equal(serialized.includes('payload'), false);
  assert.equal(serialized.includes('token'), false);
  assert.equal(collectCount, 0);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /agents/evidence-spine/schema read route purity does not inspect spine rows', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /agents/evidence-spine/schema must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-agents-spine-schema-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  store.getAgentEvidenceSpineSummary = () => {
    throw new Error('schema route must not summarize agents evidence spine rows');
  };
  store.getAgentEvidenceSourceStatusMatrix = () => {
    throw new Error('schema route must not read source-matrix rows');
  };
  store.getAgentEvidenceSpine = () => {
    throw new Error('schema route must not resolve schema as an agent id');
  };
  store.listEvidenceRecords = () => {
    throw new Error('schema route must not list evidence records');
  };

  const response = await requestJsonDirect({
    url: '/agents/evidence-spine/schema?limit=1&token=/tmp/spine-secret&status=<script>',
    store,
    controllerSnapshotCollector
  });
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.item.limit, {
    default: 50,
    max: 200
  });
  assert.deepEqual(response.body.item.surfaces, ['summary', 'source-matrix', 'per-agent']);
  assert.deepEqual(
    response.body.item.response_fields.map((field) => field.name),
    [
      'agent_count',
      'returned_limit',
      'total_count',
      'mapped_count',
      'unmapped_count',
      'agents',
      'unmapped_evidence_summary',
      'sources'
    ]
  );
  assert.deepEqual(response.body.item.count_semantics, [
    'counts are computed after supported filters',
    'limit bounds returned rows only',
    'empty matches keep stable zero buckets'
  ]);
  assert.equal(response.body.item.source_kinds.includes('workspace_file'), true);
  assert.equal(response.body.item.evidence_roles.includes('runtime_unmapped'), true);
  assert.equal(response.body.item.source_statuses.includes('observed'), true);
  assert.equal(response.body.item.supported_filters.includes('evidence_ref'), false);
  assert.equal(response.body.item.supported_filters.includes('evidence_id'), false);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('/tmp/'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('Hermes'), false);
  assert.equal(serialized.includes('session://'), false);
  assert.equal(serialized.includes('webhook'), false);
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('collector-snapshot:'), false);
  assert.equal(collectCount, 0);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /collectors/controller-snapshot/schema exposes static catalog without reading snapshots', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /collectors/controller-snapshot/schema must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-controller-snapshot-schema-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  store.getLatestCollectorReport = () => {
    throw new Error('schema route must not read latest snapshot');
  };
  store.getLatestCollectorSnapshotSummary = () => {
    throw new Error('schema route must not read summary projection');
  };
  store.getLatestCollectorEvidenceCoverage = () => {
    throw new Error('schema route must not read coverage projection');
  };
  store.getLatestCollectorSourceHealth = () => {
    throw new Error('schema route must not read source-health projection');
  };
  store.getCollectorSnapshotHistorySummary = () => {
    throw new Error('schema route must not read snapshot history');
  };
  store.getCollectorSnapshotDiff = () => {
    throw new Error('schema route must not diff snapshots');
  };

  const response = await requestJsonDirect({
    url: '/collectors/controller-snapshot/schema?collector_snapshot_id=/tmp/secret&token=<script>',
    store,
    controllerSnapshotCollector
  });
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.item.limit, {
    default: 50,
    max: 200
  });
  assert.deepEqual(
    response.body.item.routes.map((route) => route.name),
    ['latest', 'summary', 'append_proof', 'evidence_coverage', 'source_health', 'history', 'diff']
  );
  assert.deepEqual(response.body.item.source_kinds, [
    'workspace_root',
    'workspace_file',
    'workspace_files',
    'tmux_observation',
    'tmux_session',
    'hermes_profile',
    'hermes_session',
    'task_evidence',
    'kanban_fixture',
    'linear_fixture',
    'slack_fixture',
    'task_fixture',
  ]);
  assert.equal(response.body.item.source_statuses.includes('missing'), true);
  assert.equal(response.body.item.confidence_levels.includes('low'), true);
  assert.deepEqual(response.body.item.snapshot_fields.latest, [
    'collected_at',
    'actor_id',
    'summary',
    'items',
    'shared_artifacts',
    'evidence_coverage',
    'runtime_source_evidence'
  ]);
  assert.deepEqual(response.body.item.snapshot_fields.summary, [
    'has_snapshot',
    'collected_at',
    'agent_count',
    'heartbeat_count',
    'tmux_observed_count',
    'workspace_observed_count',
    'reboot_recommended_count',
    'evidence_ref_count',
    'covered_agent_count',
    'low_confidence_agent_count',
    'source_kind_buckets',
    'source_health_buckets',
    'runtime_source_evidence'
  ]);
  assert.deepEqual(response.body.item.snapshot_fields.append_proof, [
    'has_snapshot',
    'snapshot_append_index',
    'evidence_record_count',
    'first_evidence_append_index',
    'last_evidence_append_index',
    'ordering_status',
    'source_kind_buckets',
    'evidence_role_buckets',
    'source_status_buckets',
    'output_candidate_buckets',
    'mapped_buckets'
  ]);
  assert.deepEqual(response.body.item.snapshot_fields.history, [
    'total_count',
    'returned_limit',
    'source_kind_buckets',
    'status_buckets',
    'items'
  ]);
  assert.equal(JSON.stringify(response.body).includes('/tmp/'), false);
  assert.equal(JSON.stringify(response.body).includes('<script>'), false);
  assert.equal(JSON.stringify(response.body).includes('collector-snapshot:'), false);
  assert.equal(JSON.stringify(response.body).includes('degraded_reasons'), false);
  for (const forbidden of ['tmux://', 'hermes://', 'session://', 'profile://', 'webhook', 'payload', 'token']) {
    assert.equal(JSON.stringify(response.body).toLowerCase().includes(forbidden), false, forbidden);
  }
  assert.equal(collectCount, 0);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /runtime/source-gaps/lifecycle passes lifecycle_state as a read-only filter', async () => {
  let receivedFilters = null;
  const store = {
    getRuntimeSourceGapLifecycle(filters) {
      receivedFilters = filters;
      return {
        total_count: 0,
        total_groups: 0,
        returned_limit: 1,
        groups: []
      };
    }
  };

  const response = await requestJsonDirect({
    url: '/runtime/source-gaps/lifecycle?lifecycle_state=resolved&newest_first=true&limit=1',
    store
  });

  assert.equal(response.response.status, 200);
  assert.equal(receivedFilters.lifecycle_state, 'resolved');
  assert.equal(receivedFilters.newest_first, 'true');
  assert.equal(receivedFilters.limit, '1');
  assert.deepEqual(response.body.item, {
    total_count: 0,
    total_groups: 0,
    returned_limit: 1,
    groups: []
  });
});

test('GET /runtime/source-gaps/transition-summary passes lifecycle filters read-only', async () => {
  let receivedFilters = null;
  const store = {
    getRuntimeSourceGapTransitionSummary(filters) {
      receivedFilters = filters;
      return {
        total_records: 0,
        total_groups: 0,
        returned_limit: 1,
        lifecycle_state_buckets: {},
        source_kind_buckets: {},
        source_status_buckets: {},
        mapped_state_buckets: {},
        latest_observed_at: null,
        latest_collected_at: null
      };
    }
  };

  const response = await requestJsonDirect({
    url: '/runtime/source-gaps/transition-summary?lifecycle_state=resolved&newest_first=true&limit=1',
    store
  });

  assert.equal(response.response.status, 200);
  assert.equal(receivedFilters.lifecycle_state, 'resolved');
  assert.equal(receivedFilters.newest_first, 'true');
  assert.equal(receivedFilters.limit, '1');
  assert.deepEqual(response.body.item, {
    total_records: 0,
    total_groups: 0,
    returned_limit: 1,
    lifecycle_state_buckets: {},
    source_kind_buckets: {},
    source_status_buckets: {},
    mapped_state_buckets: {},
    latest_observed_at: null,
    latest_collected_at: null
  });
});

test('GET /runtime/source-gaps/schema exposes static catalog without reading source-gap rows', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /runtime/source-gaps/schema must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-source-gap-schema-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  store.listRuntimeSourceGaps = () => {
    throw new Error('schema route must not list source-gap rows');
  };
  store.getRuntimeSourceGapsSummary = () => {
    throw new Error('schema route must not summarize source-gap rows');
  };
  store.getRuntimeSourceGapAgentSummary = () => {
    throw new Error('schema route must not group source-gap rows');
  };
  store.getRuntimeSourceGapLifecycle = () => {
    throw new Error('schema route must not read source-gap lifecycle rows');
  };
  store.getRuntimeSourceGapTrend = () => {
    throw new Error('schema route must not read source-gap trend rows');
  };
  store.getEvidenceRecord = () => {
    throw new Error('schema route must not resolve schema as an evidence id');
  };

  const response = await requestJsonDirect({
    url: '/runtime/source-gaps/schema?limit=1&bucket=<script>&token=/tmp/source-gap-secret',
    store,
    controllerSnapshotCollector
  });
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.item.limit, {
    default: 50,
    max: 200
  });
  assert.deepEqual(response.body.item.trend_buckets, ['hour', 'day']);
  assert.deepEqual(response.body.item.lifecycle_states, [
    'opened',
    'continuing',
    'resolved',
    'observed_unmapped'
  ]);
  assert.equal(response.body.item.source_kinds.includes('workspace_file'), true);
  assert.equal(response.body.item.evidence_roles.includes('runtime_unmapped'), true);
  assert.equal(response.body.item.source_statuses.includes('observed'), true);
  assert.equal(response.body.item.source_gap_statuses.includes('missing'), true);
  assert.equal(JSON.stringify(response.body).includes('/tmp/'), false);
  assert.equal(JSON.stringify(response.body).includes('<script>'), false);
  assert.equal(JSON.stringify(response.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(response.body).includes('collector-snapshot:'), false);
  assert.equal(collectCount, 0);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET static schema and aggregate routes are not swallowed by dynamic detail fallbacks', async () => {
  const calls = [];
  const responseFor = (method) => {
    calls.push(method);
    return { route: method, total_count: 0, returned_limit: 0, items: [], groups: [] };
  };
  const dynamicFallback = (method) => () => {
    throw new Error(`${method} must not handle static schema or aggregate routes`);
  };
  const store = {
    getEvidenceRecordsSchema: () => responseFor('getEvidenceRecordsSchema'),
    getEvidenceRecordFacets: () => responseFor('getEvidenceRecordFacets'),
    getEvidenceRecordsSummary: () => responseFor('getEvidenceRecordsSummary'),
    getEvidenceInputProofSummary: () => responseFor('getEvidenceInputProofSummary'),
    getEvidenceRefRollup: () => responseFor('getEvidenceRefRollup'),
    getEvidenceRecord: dynamicFallback('getEvidenceRecord'),
    getEvidenceProvenanceBundle: dynamicFallback('getEvidenceProvenanceBundle'),
    getEvidenceSourceContext: dynamicFallback('getEvidenceSourceContext'),
    getEvidenceReplayWindow: dynamicFallback('getEvidenceReplayWindow'),
    getRuntimeSourceGapsSchema: () => responseFor('getRuntimeSourceGapsSchema'),
    listRuntimeSourceGaps: dynamicFallback('listRuntimeSourceGaps'),
    getRuntimeSourceGapsSummary: () => responseFor('getRuntimeSourceGapsSummary'),
    getRuntimeSourceGapAgentSummary: () => responseFor('getRuntimeSourceGapAgentSummary'),
    getRuntimeSourceGapLifecycle: () => responseFor('getRuntimeSourceGapLifecycle'),
    getRuntimeSourceGapTrend: () => responseFor('getRuntimeSourceGapTrend'),
    getAgentsEvidenceSpineSchema: () => responseFor('getAgentsEvidenceSpineSchema'),
    getAgentEvidenceSpineSummary: () => responseFor('getAgentEvidenceSpineSummary'),
    getAgentEvidenceSourceStatusMatrix: () => responseFor('getAgentEvidenceSourceStatusMatrix'),
    getAgentEvidenceSpine: dynamicFallback('getAgentEvidenceSpine'),
    getControllerSnapshotSchema: () => responseFor('getControllerSnapshotSchema'),
    getLatestCollectorReport: dynamicFallback('getLatestCollectorReport'),
    getLatestCollectorSnapshotSummary: () => responseFor('getLatestCollectorSnapshotSummary'),
    getLatestCollectorEvidenceCoverage: () => responseFor('getLatestCollectorEvidenceCoverage'),
    getLatestCollectorSourceHealth: () => responseFor('getLatestCollectorSourceHealth'),
    getCollectorSnapshotHistorySummary: () => responseFor('getCollectorSnapshotHistorySummary'),
    getCollectorSnapshotDiff: () => responseFor('getCollectorSnapshotDiff')
  };
  const controllerSnapshotCollector = {
    collectSnapshot: dynamicFallback('collectSnapshot')
  };
  const hostileQuery = new URLSearchParams({
    evidence_id: 'route-order-evidence-id',
    evidence_ref: '/tmp/route-order-ref',
    path: '/tmp/route-order-path',
    payload: '{"token":"route-order-token"}',
    metadata: '{"secret":"route-order-secret"}'
  }).toString();
  const cases = [
    ['/evidence-records/schema', 'getEvidenceRecordsSchema'],
    ['/evidence-records/facets', 'getEvidenceRecordFacets'],
    ['/evidence-records/summary', 'getEvidenceRecordsSummary'],
    ['/evidence-records/input-proof-summary', 'getEvidenceInputProofSummary'],
    ['/evidence-records/ref-rollup', 'getEvidenceRefRollup'],
    ['/runtime/source-gaps/schema', 'getRuntimeSourceGapsSchema'],
    ['/runtime/source-gaps/summary', 'getRuntimeSourceGapsSummary'],
    ['/runtime/source-gaps/agent-summary', 'getRuntimeSourceGapAgentSummary'],
    ['/runtime/source-gaps/lifecycle', 'getRuntimeSourceGapLifecycle'],
    ['/runtime/source-gaps/trend', 'getRuntimeSourceGapTrend'],
    ['/agents/evidence-spine/schema', 'getAgentsEvidenceSpineSchema'],
    ['/agents/evidence-spine/summary', 'getAgentEvidenceSpineSummary'],
    ['/agents/evidence-spine/source-matrix', 'getAgentEvidenceSourceStatusMatrix'],
    ['/collectors/controller-snapshot/schema', 'getControllerSnapshotSchema'],
    ['/collectors/controller-snapshot/summary', 'getLatestCollectorSnapshotSummary'],
    ['/collectors/controller-snapshot/evidence-coverage', 'getLatestCollectorEvidenceCoverage'],
    ['/collectors/controller-snapshot/source-health', 'getLatestCollectorSourceHealth'],
    ['/collectors/controller-snapshot/history', 'getCollectorSnapshotHistorySummary'],
    ['/collectors/controller-snapshot/diff', 'getCollectorSnapshotDiff']
  ];

  for (const [route, expectedMethod] of cases) {
    calls.length = 0;
    const separator = route.includes('?') ? '&' : '?';
    const response = await requestJsonDirect({
      url: `${route}${separator}${hostileQuery}`,
      store,
      controllerSnapshotCollector
    });

    assert.equal(response.response.status, 200, route);
    assert.deepEqual(calls, [expectedMethod], route);
    assert.equal(response.body.item.route, expectedMethod, route);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of [
      'route-order-evidence-id',
      '/tmp/route-order',
      'route-order-token',
      'route-order-secret'
    ]) {
      assert.equal(serialized.includes(forbidden), false, route);
    }
  }
});

test('GET schema and summary routes ignore runtime inputs without appending or echoing action canaries', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET schema and summary routes must not collect runtime inputs');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-readonly-no-append-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createRouteParityCollectorReport());

  const query = new URLSearchParams({
    hermes_runtime_sources_file: '/tmp/readonly-no-append-proof/runtime.jsonl',
    hermes_runtime_source: 'hermes://profile/readonly-no-append-proof',
    task_evidence_paths: '/tmp/readonly-no-append-proof/runtime.jsonl',
    token: 'token=readonly-no-append-proof',
    webhook: 'webhook-readonly-no-append-proof',
    action: 'control-plane dispatch claim assign complete'
  }).toString();
  const unknownSnapshot = encodeURIComponent(
    'collector-snapshot:/tmp/readonly-no-append-proof/runtime.jsonl'
  );
  const routes = [
    `/evidence-records/schema?${query}`,
    `/agents/evidence-spine/schema?${query}`,
    `/collectors/controller-snapshot/schema?collector_snapshot_id=${unknownSnapshot}&${query}`,
    `/runtime/source-gaps/schema?${query}`,
    `/agents/evidence-spine/summary?source_kind=workspace_file&limit=1&${query}`,
    `/runtime/source-gaps/summary?source_kind=workspace_file&limit=1&${query}`,
    `/collectors/controller-snapshot/summary?collector_snapshot_id=${unknownSnapshot}&${query}`
  ];
  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    file: await readFile(storeFile, 'utf8')
  };

  for (const route of routes) {
    const response = await requestJsonDirect({
      url: route,
      store,
      controllerSnapshotCollector
    });
    assert.equal(response.response.status, 200, route);
    assertNoReadOnlyRuntimeInputLeak(response.body, route);
    assert.equal(store.records.length, before.recordCount, route);
    assert.deepEqual(store.getCounts(), before.counts, route);
    assert.equal(await readFile(storeFile, 'utf8'), before.file, route);
  }

  assert.equal(collectCount, 0);
});

test('GET evidence-record detail and provenance unknown ids do not echo unsafe ids', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-evidence-404-'));
  const store = await createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
  const unsafeUnknownIds = [
    '/tmp/evidence-404-no-echo/outbox.md',
    '/Users/cwp/private/evidence-404-no-echo.md',
    'tmux://evidence-404-no-echo/0.1',
    'hermes://session/evidence-404-no-echo',
    'hermes://profile/evidence-404-no-echo',
    'session-evidence-404-no-echo',
    'profile-evidence-404-no-echo',
    'token=evidence-404-no-echo',
    'https://hooks.slack.com/services/evidence-404-no-echo',
    'https://example.test/webhook/evidence-404-no-echo'
  ];

  for (const unsafeUnknownId of unsafeUnknownIds) {
    const routes = [
      `/evidence-records/${encodeURIComponent(unsafeUnknownId)}`,
      `/evidence-records/${encodeURIComponent(unsafeUnknownId)}/provenance-bundle`
    ];
    for (const route of routes) {
      const response = await requestJsonDirect({ url: route, store });

      assert.equal(response.response.status, 404);
      assert.deepEqual(response.body, {
        error: 'not_found',
        details: 'unknown evidence record'
      });
      assert.equal(
        response.text.includes(unsafeUnknownId),
        false,
        `${route} echoed ${unsafeUnknownId}`
      );
      assert.equal(JSON.stringify(response.body).includes(unsafeUnknownId), false);
    }
  }
});

test('GET /evidence-records/projection-audit returns count-only safety counters read-only', async () => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /evidence-records/projection-audit must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-projection-audit-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const unsafeSourceKind = '/tmp/projection-audit-route/source-kind-token';
  const unsafeSourceStatus = 'token=projection-audit-route-status';
  const unsafeEvidenceRole = 'tmux://projection-audit-route-role/0.0';
  const unsafeObservedAt = '/tmp/projection-audit-route/observed-token';
  const unsafeCollectedAt = 'https://hooks.slack.com/services/projection-audit-route-time';
  const unsafeEvidenceRef = '/tmp/projection-audit-route/evidence.md';
  const unsafeInputProof = 'https://hooks.slack.com/services/projection-audit-route-proof';

  await writeFile(
    storeFile,
    [
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_projection_audit_route_safe',
          observed_at: '2026-03-09T18:05:00.000Z',
          collected_at: '2026-03-09T18:06:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_ref: '/tmp/projection-audit-route/safe.md',
          evidence_role: 'agent_output',
          source_status: 'observed',
          output_candidate: true,
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
          correlation_id: 'corr-projection-audit-route-safe',
          degraded_reasons: [],
          metadata: {
            source_provenance: {
              source_format: 'json_array',
              source_index: 0,
              source_input_ordinal: 1,
              source_file_ordinal: 1
            }
          }
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_projection_audit_route_unsafe',
          observed_at: unsafeObservedAt,
          collected_at: unsafeCollectedAt,
          agent_id: null,
          source_kind: unsafeSourceKind,
          evidence_ref: unsafeEvidenceRef,
          evidence_role: unsafeEvidenceRole,
          source_status: unsafeSourceStatus,
          output_candidate: false,
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'corr-projection-audit-route-unsafe',
          degraded_reasons: [unsafeSourceStatus],
          metadata: {
            source_provenance: {
              source_format: unsafeInputProof,
              source_index: 0
            },
            payload: 'token=projection-audit-route-payload'
          }
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_projection_audit_route_missing_proof',
          observed_at: '2026-03-09T18:08:00.000Z',
          collected_at: '2026-03-09T18:09:00.000Z',
          agent_id: null,
          source_kind: 'tmux_observation',
          evidence_ref: 'tmux://projection-audit-route/0.0',
          evidence_role: 'runtime_unmapped',
          source_status: 'observed',
          output_candidate: false,
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:09:00.000Z',
          correlation_id: 'corr-projection-audit-route-missing-proof',
          degraded_reasons: [],
          metadata: {}
        }
      }
    ].map((record) => JSON.stringify(record)).join('\n') + '\n',
    'utf8'
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    file: await readFile(storeFile, 'utf8')
  };
  store.getEvidenceRecord = () => {
    throw new Error('projection-audit route must not resolve projection-audit as evidence id');
  };

  const response = await requestJsonDirect({
    url: `/evidence-records/projection-audit?evidence_ref=${encodeURIComponent('/tmp/projection-audit-route/safe.md')}&limit=1`,
    store,
    controllerSnapshotCollector
  });

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body, {
    item: {
      total_count: 3,
      returned_limit: 1,
      input_proof_count: 1,
      missing_input_proof_count: 2,
      unknown_source_kind_count: 1,
      unknown_evidence_role_count: 1,
      unknown_source_status_count: 1,
      invalid_observed_at_count: 1,
      invalid_collected_at_count: 1
    }
  });
  assert.deepEqual(
    {
      recordCount: store.records.length,
      counts: store.getCounts(),
      file: await readFile(storeFile, 'utf8')
    },
    before
  );
  assert.equal(collectCount, 0);

  const serialized = JSON.stringify(response.body);
  for (const canary of [
    unsafeSourceKind,
    unsafeSourceStatus,
    unsafeEvidenceRole,
    unsafeObservedAt,
    unsafeCollectedAt,
    unsafeEvidenceRef,
    unsafeInputProof,
    'ev_projection_audit_route_unsafe',
    'token=projection-audit-route-payload',
    'tmux://projection-audit-route',
    'evidence_ref',
    'metadata',
    'degraded_reasons',
    'payload'
  ]) {
    assert.equal(serialized.includes(canary), false, canary);
  }
});

test('GET /evidence-records append cursor filters compose with exact filters and stay read-only', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /evidence-records append cursor must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const countsBeforeRead = store.getCounts();

  const appendOrdered = await requestJson(
    `${baseUrl}/evidence-records?source_kind=workspace_file&limit=10`
  );
  assert.equal(appendOrdered.response.status, 200);
  assert.equal(appendOrdered.body.items.length >= 2, true);

  const afterAppendIndex = appendOrdered.body.items[0].append_index;
  const newestWorkspace = await requestJson(
    `${baseUrl}/evidence-records?source_kind=workspace_file&newest_first=true&limit=10`
  );
  const expectedAfterCursor = newestWorkspace.body.items
    .filter((record) => record.append_index > afterAppendIndex)
    .slice(0, 1)
    .map((record) => record.append_index);

  const afterCursor = await requestJson(
    `${baseUrl}/evidence-records?source_kind=workspace_file&after_append_index=${afterAppendIndex}&newest_first=true&limit=1`
  );
  assert.equal(afterCursor.response.status, 200);
  assert.deepEqual(
    afterCursor.body.items.map((record) => record.append_index),
    expectedAfterCursor
  );
  assert.equal(afterCursor.body.items.every((record) => record.source_kind === 'workspace_file'), true);

  const beforeAppendIndex = appendOrdered.body.items.at(-1).append_index;
  const expectedBeforeCursor = appendOrdered.body.items
    .filter((record) => record.append_index < beforeAppendIndex)
    .map((record) => record.append_index);
  const beforeCursor = await requestJson(
    `${baseUrl}/evidence-records?source_kind=workspace_file&before_append_index=${beforeAppendIndex}&limit=10`
  );
  assert.equal(beforeCursor.response.status, 200);
  assert.deepEqual(
    beforeCursor.body.items.map((record) => record.append_index),
    expectedBeforeCursor
  );

  const cursorCanary = `${afterAppendIndex}.0-token=cursor-secret`;
  const invalidCursor = await requestJson(
    `${baseUrl}/evidence-records?source_kind=workspace_file&after_append_index=${encodeURIComponent(cursorCanary)}&limit=10`
  );
  assert.equal(invalidCursor.response.status, 200);
  assert.deepEqual(
    invalidCursor.body.items.map((record) => record.append_index),
    appendOrdered.body.items.map((record) => record.append_index)
  );
  assert.equal(JSON.stringify(invalidCursor.body).includes(cursorCanary), false);

  assert.equal(collectCount, 0);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET /evidence-records lists stored evidence records read-only with exact filters', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /evidence-records must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 0,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [
          '/tmp/evidence-query/app',
          '/tmp/evidence-query/app/inbox.md',
          '/tmp/evidence-query/app/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/evidence-query/app/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:04:00.000Z'
          },
          {
            path: '/tmp/evidence-query/app/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:05:00.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_current_command: 'nvim',
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/evidence-query/app',
            last_observed_at: '2026-03-09T18:03:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'observed',
            last_observed_at: '2026-03-09T18:05:00.000Z',
            degraded_reasons: []
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        }
      },
      {
        agent_id: 'protocol-engineering',
        evidence_refs: ['/tmp/evidence-query/protocol/todo.md'],
        workspace_source_records: [
          {
            path: '/tmp/evidence-query/protocol/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            status: 'missing',
            last_observed_at: null,
            error: null
          }
        ],
        workspace_observations: [
          {
            path: '/tmp/evidence-query/protocol/todo.md',
            file_name: 'todo.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:02:00.000Z'
          }
        ],
        tmux_observations: [],
        source_health: {
          workspace_files: {
            status: 'degraded',
            last_observed_at: '2026-03-09T18:02:00.000Z',
            degraded_reasons: ['missing workspace files: inbox.md, outbox.md']
          }
        }
      }
    ]
  });

  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const latestBeforeRead = store.getLatestCollectorReport();
  const countsBeforeRead = store.getCounts();

  const response = await requestJson(
    `${baseUrl}/evidence-records?agent_id=app-engineering&source_kind=workspace_file&evidence_role=agent_output&output_candidate=true&limit=10`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);
  assert.equal(response.body.items[0].agent_id, 'app-engineering');
  assert.equal(response.body.items[0].source_kind, 'workspace_file');
  assert.equal(response.body.items[0].evidence_role, 'agent_output');
  assert.equal(response.body.items[0].output_candidate, true);
  assert.equal(Number.isSafeInteger(response.body.items[0].append_index), true);

  const evidenceId = response.body.items[0].evidence_id;
  const exactEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=${encodeURIComponent(evidenceId)}&agent_id=app-engineering&source_kind=workspace_file&newest_first=true&limit=1`
  );
  assert.equal(exactEvidenceId.response.status, 200);
  assert.deepEqual(exactEvidenceId.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const detail = await requestJson(`${baseUrl}/evidence-records/${encodeURIComponent(evidenceId)}`);
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body, { item: response.body.items[0] });
  assert.equal(detail.body.item.append_index, response.body.items[0].append_index);

  const provenanceBundle = await requestJson(
    `${baseUrl}/evidence-records/${encodeURIComponent(evidenceId)}/provenance-bundle`
  );
  assert.equal(provenanceBundle.response.status, 200);
  assert.deepEqual(provenanceBundle.body, {
    item: {
      evidence_id: evidenceId,
      source_summary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_output',
        output_candidate: true,
        mapped: true,
        time: {
          observed_at: '2026-03-09T18:05:00.000Z',
          collected_at: '2026-03-09T18:06:00.000Z'
        }
      },
      record: {
        observed_at: '2026-03-09T18:05:00.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'observed',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        unmapped: false
      },
      anchors: {
        snapshot: {
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
          route:
            '/collectors/controller-snapshot/source-health?collector_snapshot_id=collector-snapshot%3A2026-03-09T18%3A06%3A00.000Z&source_kind=workspace_file'
        },
        source: {
          evidence_id: evidenceId,
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'observed',
          route: `/evidence-records/${encodeURIComponent(evidenceId)}`
        },
        replay: {
          evidence_id: evidenceId,
          correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
          route: `/accountability/replay?evidence_id=${encodeURIComponent(evidenceId)}`
        }
      }
    }
  });
  assert.equal(JSON.stringify(provenanceBundle.body).includes('/tmp/evidence-query'), false);
  assert.equal(JSON.stringify(provenanceBundle.body).includes('evidence_ref'), false);
  assert.equal(JSON.stringify(provenanceBundle.body).includes('metadata'), false);
  assert.equal(JSON.stringify(provenanceBundle.body).includes('degraded_reasons'), false);

  const replay = await requestJson(
    `${baseUrl}/accountability/replay?evidence_id=${encodeURIComponent(evidenceId)}&limit=5&window=60m`
  );
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.body.query, {
    evidence_id: evidenceId,
    limit: 5,
    window: '60m'
  });
  assert.equal(JSON.stringify(replay.body.query).includes('/tmp/evidence-query'), false);
  assert.ok(
    replay.body.memory_artifacts.some(
      (artifact) => artifact.artifact_ref === '/tmp/evidence-query/app/outbox.md'
    )
  );

  const unknownBundle = await requestJson(
    `${baseUrl}/evidence-records/missing-evidence-id/provenance-bundle`
  );
  assert.equal(unknownBundle.response.status, 404);
  assert.equal(unknownBundle.body.error, 'not_found');
  assert.equal(unknownBundle.body.details, 'unknown evidence record');

  const unknownDetail = await requestJson(`${baseUrl}/evidence-records/missing-evidence-id`);
  assert.equal(unknownDetail.response.status, 404);
  assert.equal(unknownDetail.body.error, 'not_found');
  assert.equal(unknownDetail.body.details, 'unknown evidence record');

  const hostileUnknownDetail = await requestJson(
    `${baseUrl}/evidence-records/${encodeURIComponent('/tmp/hostile-token-evidence')}`
  );
  assertPublic404DoesNotExposeCanary(hostileUnknownDetail, '/tmp/hostile-token-evidence');

  const substringEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=${encodeURIComponent(evidenceId.slice(0, -2))}&limit=10`
  );
  assert.equal(substringEvidenceId.response.status, 200);
  assert.deepEqual(substringEvidenceId.body.items, []);

  const unknownEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=missing-evidence-id&limit=10`
  );
  assert.equal(unknownEvidenceId.response.status, 200);
  assert.deepEqual(unknownEvidenceId.body.items, []);

  const blankFilters = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=false&limit=2`
  );
  assert.equal(blankFilters.response.status, 200);
  assert.deepEqual(blankFilters.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const newestFirst = await requestJson(
    `${baseUrl}/evidence-records?output_candidate=false&newest_first=true&limit=2`
  );
  assert.equal(newestFirst.response.status, 200);
  assert.deepEqual(newestFirst.body.items.map((item) => item.evidence_ref), [
    'tmux://unmapped-session/0.0',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const unmapped = await requestJson(
    `${baseUrl}/evidence-records?evidence_role=runtime_unmapped&output_candidate=false&limit=-1`
  );
  assert.equal(unmapped.response.status, 200);
  assert.deepEqual(unmapped.body.items, [
    {
      evidence_id: unmapped.body.items[0].evidence_id,
      append_index: unmapped.body.items[0].append_index,
      observed_at: '2026-03-09T18:05:50.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      agent_id: null,
      source_kind: 'tmux_observation',
      evidence_ref: 'tmux://unmapped-session/0.0',
      evidence_role: 'runtime_unmapped',
      source_status: 'observed',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      degraded_reasons: [],
      metadata: {
        session_name: 'unmapped-session',
        observed_count: 1,
        source_health_key: 'runtime_source_evidence.unmapped_tmux_sessions'
      }
    }
  ]);

  const mappedOnly = await requestJson(`${baseUrl}/evidence-records?mapped=true&limit=10`);
  assert.equal(mappedOnly.response.status, 200);
  assert.ok(mappedOnly.body.items.length > 0);
  assert.ok(mappedOnly.body.items.every((item) => item.agent_id !== null));

  const unmappedOnly = await requestJson(`${baseUrl}/evidence-records?mapped=false&limit=10`);
  assert.equal(unmappedOnly.response.status, 200);
  assert.deepEqual(unmappedOnly.body.items.map((item) => item.evidence_ref), [
    'tmux://unmapped-session/0.0'
  ]);

  const unmappedWithAgent = await requestJson(
    `${baseUrl}/evidence-records?mapped=false&agent_id=app-engineering&limit=10`
  );
  assert.equal(unmappedWithAgent.response.status, 200);
  assert.deepEqual(unmappedWithAgent.body.items, []);

  const invalidMapped = await requestJson(`${baseUrl}/evidence-records?mapped=maybe&limit=2`);
  assert.equal(invalidMapped.response.status, 200);
  assert.deepEqual(invalidMapped.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const exactDrilldown = await requestJson(
    `${baseUrl}/evidence-records?evidence_ref=${encodeURIComponent('/tmp/evidence-query/app/outbox.md')}&source_status=observed&collector_snapshot_id=${encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z')}&correlation_id=${encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z')}`
  );
  assert.equal(exactDrilldown.response.status, 200);
  assert.deepEqual(exactDrilldown.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const negativeWorkspaceGap = await requestJson(
    `${baseUrl}/evidence-records?agent_id=protocol-engineering&source_kind=workspace_file&source_status=missing&output_candidate=false&limit=10`
  );
  assert.equal(negativeWorkspaceGap.response.status, 200);
  assert.deepEqual(negativeWorkspaceGap.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/protocol/inbox.md'
  ]);
  assert.equal(negativeWorkspaceGap.body.items[0].evidence_role, 'inbound_task');

  const observedWindow = await requestJson(
    `${baseUrl}/evidence-records?observed_since=${encodeURIComponent('2026-03-09T18:04:30.000Z')}&observed_until=${encodeURIComponent('2026-03-09T18:05:30.000Z')}&newest_first=true&limit=2`
  );
  assert.equal(observedWindow.response.status, 200);
  assert.deepEqual(observedWindow.body.items.map((item) => item.evidence_ref), [
    'tmux://5-web3-app-engineering/0.1',
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const collectedWindow = await requestJson(
    `${baseUrl}/evidence-records?collected_since=${encodeURIComponent('2026-03-09T18:06:00.000Z')}&collected_until=${encodeURIComponent('2026-03-09T18:06:00.000Z')}&limit=1`
  );
  assert.equal(collectedWindow.response.status, 200);
  assert.deepEqual(collectedWindow.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app'
  ]);

  const invalidWindow = await requestJson(
    `${baseUrl}/evidence-records?observed_since=bogus&observed_until=&collected_since=%20&collected_until=2026-13-99&limit=1`
  );
  assert.equal(invalidWindow.response.status, 200);
  assert.deepEqual(invalidWindow.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app'
  ]);

  const unknownExact = await requestJson(
    `${baseUrl}/evidence-records?evidence_ref=${encodeURIComponent('/tmp/evidence-query')}&source_status=missing&collector_snapshot_id=unknown&correlation_id=unknown`
  );
  assert.equal(unknownExact.response.status, 200);
  assert.deepEqual(unknownExact.body.items, []);

  const summary = await requestJson(
    `${baseUrl}/evidence-records/summary?output_candidate=false&newest_first=true&limit=1`
  );
  assert.equal(summary.response.status, 200);
  assert.deepEqual(summary.body, {
    item: {
      total_count: 4,
      returned_limit: 1,
      mapped_count: 3,
      unmapped_count: 1,
      output_candidate_buckets: {
        true: 0,
        false: 4
      },
      source_kind_buckets: {
        workspace_root: 1,
        workspace_file: 2,
        tmux_observation: 1,
        hermes_profile: 0,
        hermes_session: 0,
        kanban_fixture: 0,
        linear_fixture: 0,
        slack_fixture: 0,
        task_fixture: 0
      },
      evidence_role_buckets: {
        workspace_presence: 1,
        inbound_task: 2,
        agent_output: 0,
        agent_plan: 0,
        runtime_activity: 0,
        runtime_presence: 0,
        runtime_unmapped: 1,
        task_reference: 0
      },
      source_status_buckets: {
        observed: 3,
        degraded: 0,
        missing: 1,
        error: 0
      },
      collector_snapshot_id_buckets: {
        'collector-snapshot:2026-03-09T18:06:00.000Z': 4
      },
      first_observed_at: '2026-03-09T18:03:00.000Z',
      last_observed_at: '2026-03-09T18:05:50.000Z',
      first_collected_at: '2026-03-09T18:06:00.000Z',
      last_collected_at: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const inputProofSummary = await requestJson(
    `${baseUrl}/evidence-records/input-proof-summary?evidence_ref=${encodeURIComponent('/tmp/evidence-query/app/outbox.md')}&limit=1`
  );
  assert.equal(inputProofSummary.response.status, 200);
  assert.deepEqual(inputProofSummary.body, {
    item: {
      total_count: 1,
      returned_limit: 1,
      proof_count: 0,
      missing_proof_count: 1,
      source_format_buckets: {
        json_array: 0,
        jsonl: 0
      },
      source_index_buckets: {},
      line_buckets: {},
      source_input_ordinal_buckets: {},
      source_file_ordinal_buckets: {}
    }
  });
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
  for (const unsafeFragment of [
    'evidence_id',
    'evidence_ref',
    '/tmp/evidence-query',
    'tmux://',
    'metadata',
    'degraded_reasons',
    'payload',
    'token',
    'webhook'
  ]) {
    assert.equal(JSON.stringify(inputProofSummary.body).includes(unsafeFragment), false);
  }

  const emptyInputProofSummary = await requestJson(
    `${baseUrl}/evidence-records/input-proof-summary?evidence_id=missing-evidence-id&limit=10`
  );
  assert.equal(emptyInputProofSummary.response.status, 200);
  assert.deepEqual(emptyInputProofSummary.body.item, {
    total_count: 0,
    returned_limit: 10,
    proof_count: 0,
    missing_proof_count: 0,
    source_format_buckets: {
      json_array: 0,
      jsonl: 0
    },
    source_index_buckets: {},
    line_buckets: {},
    source_input_ordinal_buckets: {},
    source_file_ordinal_buckets: {}
  });

  const emptySummary = await requestJson(
    `${baseUrl}/evidence-records/summary?mapped=false&agent_id=app-engineering&limit=10`
  );
  assert.equal(emptySummary.response.status, 200);
  assert.deepEqual(emptySummary.body.item, {
    total_count: 0,
    returned_limit: 10,
    mapped_count: 0,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 0,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 0,
      degraded: 0,
      missing: 0,
      error: 0
    },
    collector_snapshot_id_buckets: {},
    first_observed_at: null,
    last_observed_at: null,
    first_collected_at: null,
    last_collected_at: null
  });

  assert.equal(collectCount, 0);

  const facets = await requestJson(
    `${baseUrl}/evidence-records/facets?output_candidate=false&newest_first=true&limit=1`
  );
  assert.equal(facets.response.status, 200);
  assert.deepEqual(facets.body, {
    item: {
      total_count: 4,
      returned_limit: 1,
      source_kind_buckets: {
        workspace_root: 1,
        workspace_file: 2,
        tmux_observation: 1,
        hermes_profile: 0,
        hermes_session: 0,
        kanban_fixture: 0,
        linear_fixture: 0,
        slack_fixture: 0,
        task_fixture: 0
      },
      evidence_role_buckets: {
        workspace_presence: 1,
        inbound_task: 2,
        agent_output: 0,
        agent_plan: 0,
        runtime_activity: 0,
        runtime_presence: 0,
        runtime_unmapped: 1,
        task_reference: 0
      },
      source_status_buckets: {
        observed: 3,
        degraded: 0,
        missing: 1,
        error: 0
      },
      output_candidate_buckets: {
        true: 0,
        false: 4
      },
      mapped_buckets: {
        mapped: 3,
        unmapped: 1
      },
      agent_id_buckets: {
        'team-lead': 0,
        'market-intel': 0,
        'product-pmf': 0,
        tokenomics: 0,
        'protocol-engineering': 1,
        'app-engineering': 2,
        'growth-revenue': 0,
        unmapped: 1
      }
    }
  });
  const serializedFacets = JSON.stringify(facets.body);
  assert.equal(serializedFacets.includes('/tmp/evidence-query'), false);
  assert.equal(serializedFacets.includes('tmux://'), false);
  assert.equal(serializedFacets.includes('metadata'), false);
  assert.equal(serializedFacets.includes('degraded_reasons'), false);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const emptyFacets = await requestJson(
    `${baseUrl}/evidence-records/facets?mapped=false&agent_id=app-engineering&limit=10`
  );
  assert.equal(emptyFacets.response.status, 200);
  assert.deepEqual(emptyFacets.body.item, {
    total_count: 0,
    returned_limit: 10,
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 0,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 0,
      degraded: 0,
      missing: 0,
      error: 0
    },
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    mapped_buckets: {
      mapped: 0,
      unmapped: 0
    },
    agent_id_buckets: {
      'team-lead': 0,
      'market-intel': 0,
      'product-pmf': 0,
      tokenomics: 0,
      'protocol-engineering': 0,
      'app-engineering': 0,
      'growth-revenue': 0,
      unmapped: 0
    }
  });
  assert.equal(collectCount, 0);

  const refRollup = await requestJson(
    `${baseUrl}/evidence-records/ref-rollup?output_candidate=false&limit=2`
  );
  assert.equal(refRollup.response.status, 200);
  assert.deepEqual(refRollup.body, {
    item: {
      total_count: 4,
      total_groups: 4,
      returned_limit: 2,
      groups: [
        {
          evidence_ref: null,
          evidence_ref_key: 'ref_group_001',
          evidence_ref_label: 'workspace_root observed evidence',
          record_count: 1,
          mapped_count: 1,
          unmapped_count: 0,
          agent_id_buckets: {
            'app-engineering': 1
          },
          source_kind_buckets: {
            workspace_root: 1
          },
          source_status_buckets: {
            observed: 1
          }
        },
        {
          evidence_ref: null,
          evidence_ref_key: 'ref_group_002',
          evidence_ref_label: 'workspace_file observed evidence',
          record_count: 1,
          mapped_count: 1,
          unmapped_count: 0,
          agent_id_buckets: {
            'app-engineering': 1
          },
          source_kind_buckets: {
            workspace_file: 1
          },
          source_status_buckets: {
            observed: 1
          }
        }
      ]
    }
  });
  assert.equal(refRollup.body.item.groups[0].metadata, undefined);
  assert.equal(refRollup.body.item.groups[0].degraded_reasons, undefined);
  assert.equal(JSON.stringify(refRollup.body).includes('/tmp/evidence-query/app'), false);

  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET evidence and source read routes keep JSONL and SQLite parity', async (t) => {
  if (!(await hasSqlite3())) {
    t.skip('sqlite3 binary not found; SQLite route parity smoke skipped explicitly');
    return;
  }

  const jsonl = await createHarness(t);
  const sqlite = await createHarness(t, { storeBackend: 'sqlite' });
  const report = createRouteParityCollectorReport();
  await jsonl.store.appendCollectorReport(report);
  await sqlite.store.appendCollectorReport(structuredClone(report));

  const before = {
    jsonl: jsonl.store.records.length,
    sqlite: sqlite.store.records.length
  };

  async function parityRequest(pathname) {
    const jsonlResponse = await requestJson(`${jsonl.baseUrl}${pathname}`);
    const sqliteResponse = await requestJson(`${sqlite.baseUrl}${pathname}`);
    assert.equal(jsonlResponse.response.status, 200);
    assert.equal(sqliteResponse.response.status, 200);
    return [jsonlResponse.body, sqliteResponse.body];
  }

  const [jsonlHealth, sqliteHealth] = await parityRequest('/health');
  assert.deepEqual(sqliteHealth, jsonlHealth);

  const [jsonlReplayCheckpoint, sqliteReplayCheckpoint] = await parityRequest(
    '/accountability/replay/checkpoint-summary'
  );
  assert.deepEqual(sqliteReplayCheckpoint, jsonlReplayCheckpoint);
  assert.equal(
    jsonlReplayCheckpoint.item.record_count,
    Object.values(jsonlReplayCheckpoint.item.record_kind_buckets)
      .reduce((sum, count) => sum + count, 0)
  );
  assert.equal(jsonlReplayCheckpoint.item.evidence_record_count > 0, true);
  assert.equal(
    jsonlReplayCheckpoint.item.latest_collector_snapshot.collector_snapshot_id,
    'collector-snapshot:2026-03-09T18:06:00.000Z'
  );
  assert.equal(
    Object.hasOwn(jsonlReplayCheckpoint.item.latest_evidence_record, 'evidence_id'),
    false
  );
  assert.equal(JSON.stringify(jsonlReplayCheckpoint).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpoint).includes('route-parity'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpoint).includes('tmux://'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpoint).includes('5-web3-app-engineering'), false);

  const [jsonlStorageManifest, sqliteStorageManifest] = await parityRequest(
    '/storage/replay-manifest'
  );
  assert.deepEqual(sqliteStorageManifest, jsonlStorageManifest);
  assert.deepEqual(Object.keys(jsonlStorageManifest), ['item']);
  assert.deepEqual(Object.keys(jsonlStorageManifest.item), [
    'record_count',
    'record_kind_buckets',
    'runtime_gap_summary',
    'evidence_summary',
    'canonical_record_hash'
  ]);
  assert.deepEqual(
    {
      ...jsonlStorageManifest.item,
      runtime_gap_summary: {
        ...jsonlStorageManifest.item.runtime_gap_summary,
        latest_observed_at: '<timestamp>',
        latest_collected_at: '<timestamp>'
      },
      evidence_summary: {
        ...jsonlStorageManifest.item.evidence_summary,
        latest_observed_at: '<timestamp>',
        latest_collected_at: '<timestamp>'
      },
      canonical_record_hash: '<sha256>'
    },
    {
      record_count: before.jsonl,
      record_kind_buckets: {
        event: 2,
        heartbeat: 1,
        evidence_record: 6,
        collector_snapshot: 1
      },
      runtime_gap_summary: {
        total_count: 4,
        mapped_count: 3,
        unmapped_count: 1,
        source_kind_buckets: {
          workspace_file: 2,
          workspace_root: 1,
          tmux_observation: 1
        },
        source_status_buckets: {
          degraded: 2,
          missing: 1,
          observed: 1
        },
        latest_observed_at: '<timestamp>',
        latest_collected_at: '<timestamp>'
      },
      evidence_summary: {
        evidence_record_count: 6,
        source_kind_buckets: {
          workspace_root: 2,
          workspace_file: 2,
          tmux_observation: 2
        },
        source_category_buckets: {
          workspace: 4,
          runtime: 2
        },
        evidence_role_buckets: {
          workspace_presence: 2,
          inbound_task: 1,
          agent_output: 1,
          runtime_activity: 1,
          runtime_unmapped: 1
        },
        source_status_buckets: {
          observed: 3,
          degraded: 2,
          missing: 1
        },
        output_candidate_count: 2,
        unmapped_count: 1,
        latest_observed_at: '<timestamp>',
        latest_collected_at: '<timestamp>'
      },
      canonical_record_hash: '<sha256>'
    }
  );
  assert.match(jsonlStorageManifest.item.canonical_record_hash, /^[a-f0-9]{64}$/);
  const serializedStorageManifest = JSON.stringify(jsonlStorageManifest);
  for (const unsafeFragment of [
    '/tmp',
    '/Users',
    '/Volumes',
    'route-parity',
    'tmux://agent-007/1',
    'evidence_ref:raw',
    'payload',
    'metadata',
    'token',
    'webhook',
    'degraded_reasons'
  ]) {
    assert.equal(serializedStorageManifest.includes(unsafeFragment), false, unsafeFragment);
  }

  const [jsonlIndexHealth, sqliteIndexHealth] = await parityRequest('/storage/index-health');
  assert.deepEqual(jsonlIndexHealth, {
    item: {
      backend: 'jsonl',
      status: 'ok',
      record_count: before.jsonl,
      record_index_count: null,
      record_evidence_ref_count: null,
      record_index_drift_count: null,
      record_evidence_ref_drift_count: null,
      evidence_query_probe_count: null,
      evidence_query_probe_drift_count: null,
      evidence_query_probe_status: 'not_applicable',
      health_reason_codes: [],
      sidecar_status: 'not_applicable',
      record_kind_buckets: {
        event: 2,
        heartbeat: 1,
        evidence_record: 6,
        collector_snapshot: 1
      },
      latest_record_ts: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.deepEqual(sqliteIndexHealth, {
    item: {
      backend: 'sqlite',
      status: 'ok',
      record_count: before.sqlite,
      record_index_count: before.sqlite,
      record_evidence_ref_count: 10,
      record_index_drift_count: 0,
      record_evidence_ref_drift_count: 0,
      evidence_query_probe_count: 16,
      evidence_query_probe_drift_count: 0,
      evidence_query_probe_status: 'complete',
      health_reason_codes: [],
      sidecar_status: 'complete',
      record_kind_buckets: {
        event: 2,
        heartbeat: 1,
        evidence_record: 6,
        collector_snapshot: 1
      },
      latest_record_ts: '2026-03-09T18:06:00.000Z'
    }
  });
  const serializedIndexHealth = JSON.stringify([jsonlIndexHealth, sqliteIndexHealth]);
  for (const unsafeFragment of [
    '/tmp',
    '/Users',
    '/Volumes',
    'route-parity',
    'tmux://agent-007/1',
    'evidence_ref:raw',
    'payload',
    'metadata',
    'stderr'
  ]) {
    assert.equal(serializedIndexHealth.includes(unsafeFragment), false, unsafeFragment);
  }

  const [jsonlReplayCheckpointLog, sqliteReplayCheckpointLog] = await parityRequest(
    '/accountability/replay/checkpoint-log?limit=3'
  );
  assert.deepEqual(sqliteReplayCheckpointLog, jsonlReplayCheckpointLog);
  assert.deepEqual(
    jsonlReplayCheckpointLog.items.map((item) => item.record_kind),
    ['evidence_record', 'evidence_record', 'collector_snapshot']
  );
  const expectedCheckpointLogAppendIndexes = [before.jsonl - 2, before.jsonl - 1, before.jsonl];
  assert.deepEqual(
    jsonlReplayCheckpointLog.items.map((item) => item.append_index),
    expectedCheckpointLogAppendIndexes
  );
  assert.equal(
    Object.hasOwn(jsonlReplayCheckpointLog.items[0].checkpoint, 'evidence_id'),
    false
  );
  assert.equal(JSON.stringify(jsonlReplayCheckpointLog).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpointLog).includes('route-parity'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpointLog).includes('tmux://'), false);
  assert.equal(JSON.stringify(jsonlReplayCheckpointLog).includes('5-web3-app-engineering'), false);

  const [jsonlFilteredCheckpointLog, sqliteFilteredCheckpointLog] = await parityRequest(
    '/accountability/replay/checkpoint-log?record_kind=evidence_record&limit=1'
  );
  assert.deepEqual(sqliteFilteredCheckpointLog, jsonlFilteredCheckpointLog);
  assert.deepEqual(
    jsonlFilteredCheckpointLog.items.map((item) => item.record_kind),
    ['evidence_record']
  );
  assert.deepEqual(
    jsonlFilteredCheckpointLog.items.map((item) => item.append_index),
    [before.jsonl - 1]
  );
  assert.equal(
    Object.hasOwn(jsonlFilteredCheckpointLog.items[0].checkpoint, 'evidence_id'),
    false
  );
  assert.equal(JSON.stringify(jsonlFilteredCheckpointLog).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlFilteredCheckpointLog).includes('route-parity'), false);
  assert.equal(JSON.stringify(jsonlFilteredCheckpointLog).includes('tmux://'), false);
  assert.equal(JSON.stringify(jsonlFilteredCheckpointLog).includes('payload'), false);

  const [jsonlUnknownCheckpointLog, sqliteUnknownCheckpointLog] = await parityRequest(
    '/accountability/replay/checkpoint-log?record_kind=not_a_kind&limit=3'
  );
  assert.deepEqual(sqliteUnknownCheckpointLog, jsonlUnknownCheckpointLog);
  assert.deepEqual(jsonlUnknownCheckpointLog, { items: [] });

  const [jsonlCoverage, sqliteCoverage] = await parityRequest(
    '/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_file&confidence_level=high&limit=10'
  );
  assert.deepEqual(sqliteCoverage, jsonlCoverage);
  assert.deepEqual(jsonlCoverage.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);

  const [jsonlSourceHealth, sqliteSourceHealth] = await parityRequest(
    '/collectors/controller-snapshot/source-health?status=missing&limit=10'
  );
  assert.deepEqual(sqliteSourceHealth, jsonlSourceHealth);
  assert.deepEqual(jsonlSourceHealth.item.agent_items.map((item) => item.agent_id), [
    'protocol-engineering'
  ]);

  const projectEvidenceRecords = (body) =>
    body.items.map((item) => ({
      observed_at: item.observed_at,
      collected_at: item.collected_at,
      agent_id: item.agent_id,
      source_kind: item.source_kind,
      evidence_ref: item.evidence_ref,
      evidence_role: item.evidence_role,
      source_status: item.source_status,
      output_candidate: item.output_candidate,
      collector_snapshot_id: item.collector_snapshot_id,
      correlation_id: item.correlation_id
    }));

  const [jsonlMapped, sqliteMapped] = await parityRequest(
    '/evidence-records?mapped=true&output_candidate=true&observed_since=2026-03-09T18%3A04%3A30.000Z&observed_until=2026-03-09T18%3A05%3A30.000Z&collected_since=2026-03-09T18%3A06%3A00.000Z&collected_until=2026-03-09T18%3A06%3A00.000Z&newest_first=true&limit=10'
  );
  assert.deepEqual(projectEvidenceRecords(sqliteMapped), projectEvidenceRecords(jsonlMapped));
  assert.deepEqual(projectEvidenceRecords(jsonlMapped).map((item) => item.evidence_ref), [
    'tmux://5-web3-app-engineering/0.1',
    '/tmp/route-parity/app/outbox.md'
  ]);

  const [jsonlUnmapped, sqliteUnmapped] = await parityRequest(
    '/evidence-records?mapped=false&output_candidate=false&limit=10'
  );
  assert.deepEqual(projectEvidenceRecords(sqliteUnmapped), projectEvidenceRecords(jsonlUnmapped));
  assert.deepEqual(projectEvidenceRecords(jsonlUnmapped).map((item) => item.evidence_ref), [
    'tmux://unmapped-route-parity/0.0'
  ]);

  const [jsonlSummary, sqliteSummary] = await parityRequest(
    '/evidence-records/summary?mapped=true&output_candidate=true&newest_first=true&limit=1'
  );
  assert.deepEqual(sqliteSummary, jsonlSummary);
  assert.equal(jsonlSummary.item.total_count, 2);
  assert.equal(jsonlSummary.item.returned_limit, 1);

  const [jsonlFacets, sqliteFacets] = await parityRequest(
    '/evidence-records/facets?mapped=true&output_candidate=true&newest_first=true&limit=1'
  );
  assert.deepEqual(sqliteFacets, jsonlFacets);
  assert.equal(jsonlFacets.item.total_count, 2);
  assert.equal(jsonlFacets.item.returned_limit, 1);
  assert.equal(JSON.stringify(jsonlFacets).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlFacets).includes('tmux://'), false);

  const [jsonlRefRollup, sqliteRefRollup] = await parityRequest(
    '/evidence-records/ref-rollup?mapped=true&output_candidate=true&limit=2'
  );
  assert.deepEqual(sqliteRefRollup, jsonlRefRollup);
  assert.deepEqual(
    jsonlRefRollup.item.groups.map((group) => group.evidence_ref_key),
    ['ref_group_001', 'ref_group_002']
  );
  assert.equal(JSON.stringify(jsonlRefRollup).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlRefRollup).includes('tmux://'), false);

  const jsonlSourceContextRecord = jsonl.store.listEvidenceRecords({
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    output_candidate: 'true',
    limit: '1'
  })[0];
  const sqliteSourceContextRecord = sqlite.store.listEvidenceRecords({
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    output_candidate: 'true',
    limit: '1'
  })[0];
  assert.ok(jsonlSourceContextRecord);
  assert.deepEqual(sqliteSourceContextRecord?.evidence_id, jsonlSourceContextRecord.evidence_id);
  const [jsonlSourceContext, sqliteSourceContext] = await parityRequest(
    `/evidence-records/${encodeURIComponent(jsonlSourceContextRecord.evidence_id)}/source-context`
  );
  assert.deepEqual(sqliteSourceContext, jsonlSourceContext);
  assert.equal(jsonlSourceContext.item.evidence_id, jsonlSourceContextRecord.evidence_id);
  assert.equal(jsonlSourceContext.item.source_summary.kind, 'workspace_file');
  assert.equal(jsonlSourceContext.item.source_gaps.items.length, 1);
  assert.equal(jsonlSourceContext.item.source_health.agent_items.length, 1);
  const serializedSourceContext = JSON.stringify(jsonlSourceContext);
  for (const unsafeFragment of [
    '/tmp/route-parity',
    'tmux://',
    'collector_snapshot_id',
    'collector-snapshot:',
    'correlation_id',
    'metadata',
    'degraded_reasons',
    'payload',
    'token',
    'webhook'
  ]) {
    assert.equal(serializedSourceContext.includes(unsafeFragment), false, unsafeFragment);
  }

  const [jsonlReplayWindow, sqliteReplayWindow] = await parityRequest(
    `/evidence-records/${encodeURIComponent(jsonlSourceContextRecord.evidence_id)}/replay-window?before=2&after=2`
  );
  assert.deepEqual(sqliteReplayWindow, jsonlReplayWindow);
  assert.deepEqual(jsonlReplayWindow.item.window, { before: 2, after: 2 });
  assert.equal(jsonlReplayWindow.item.before.length <= 2, true);
  assert.equal(jsonlReplayWindow.item.after.length <= 2, true);
  const serializedReplayWindow = JSON.stringify(jsonlReplayWindow);
  for (const unsafeFragment of [
    '/tmp/route-parity',
    'tmux://',
    'collector_snapshot_id',
    'collector-snapshot:',
    'correlation_id',
    'metadata',
    'degraded_reasons',
    'payload',
    'token',
    'webhook'
  ]) {
    assert.equal(serializedReplayWindow.includes(unsafeFragment), false, unsafeFragment);
  }

  const [jsonlSpine, sqliteSpine] = await parityRequest(
    '/agents/app-engineering/evidence-spine?source_kind=workspace_file&output_candidate=true&newest_first=true&limit=1'
  );
  assert.deepEqual(sqliteSpine, jsonlSpine);
  assert.equal(jsonlSpine.item.evidence_summary.total_count, 1);
  assert.equal(jsonlSpine.item.recent_evidence.length, 1);
  assert.equal(JSON.stringify(jsonlSpine).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(jsonlSpine).includes('tmux://'), false);
  assert.equal(JSON.stringify(jsonlSpine).includes('metadata'), false);
  assert.equal(JSON.stringify(jsonlSpine).includes('degraded_reasons'), false);

  assert.equal(jsonl.store.records.length, before.jsonl);
  assert.equal(sqlite.store.records.length, before.sqlite);
});

test('GET /storage/index-health is sanitized and read-only', async (t) => {
  const { baseUrl, store, storeFile } = await createHarness(t);

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    checkpoint: store.getReplayCheckpointSummary(),
    file: await readFile(storeFile, 'utf8')
  };

  const response = await requestJson(`${baseUrl}/storage/index-health`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body, {
    item: {
      backend: 'jsonl',
      status: 'ok',
      record_count: before.recordCount,
      record_index_count: null,
      record_evidence_ref_count: null,
      record_index_drift_count: null,
      record_evidence_ref_drift_count: null,
      evidence_query_probe_count: null,
      evidence_query_probe_drift_count: null,
      evidence_query_probe_status: 'not_applicable',
      health_reason_codes: [],
      sidecar_status: 'not_applicable',
      record_kind_buckets: {
        event: 2,
        heartbeat: 1,
        evidence_record: 6,
        collector_snapshot: 1
      },
      latest_record_ts: '2026-03-09T18:06:00.000Z'
    }
  });
  const serialized = JSON.stringify(response.body);
  for (const unsafeFragment of [
    '/tmp',
    '/Users',
    '/Volumes',
    'route-parity',
    'tmux://agent-007/1',
    'evidence_ref:raw',
    'payload',
    'metadata',
    'stderr'
  ]) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }
  assert.equal(store.records.length, before.recordCount);
  assert.deepEqual(store.getCounts(), before.counts);
  assert.deepEqual(store.getReplayCheckpointSummary(), before.checkpoint);
  assert.equal(await readFile(storeFile, 'utf8'), before.file);
});

test('GET replay checkpoint-log filters record_kind before limit without leaking raw fields', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const before = store.records.length;

  const filtered = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?record_kind=evidence_record&limit=1`
  );
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(
    filtered.body.items.map((item) => item.record_kind),
    ['evidence_record']
  );
  assert.deepEqual(
    filtered.body.items.map((item) => item.append_index),
    [before - 1]
  );
  assert.equal(Object.hasOwn(filtered.body.items[0].checkpoint, 'evidence_id'), false);
  assert.equal(JSON.stringify(filtered.body).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(filtered.body).includes('route-parity'), false);
  assert.equal(JSON.stringify(filtered.body).includes('tmux://'), false);
  assert.equal(JSON.stringify(filtered.body).includes('payload'), false);

  const unknown = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?record_kind=not_a_kind&limit=3`
  );
  assert.equal(unknown.response.status, 200);
  assert.deepEqual(unknown.body, { items: [] });
});

test('GET replay checkpoint-log filters exact evidence provenance before limit', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const evidenceRecord = store
    .listEvidenceRecords({ source_kind: 'tmux_observation', limit: '10' })
    .find((record) => record.agent_id === 'app-engineering');
  assert.ok(evidenceRecord);

  const byEvidenceId = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id)}&limit=1`
  );
  assert.equal(byEvidenceId.response.status, 200);
  assert.deepEqual(
    byEvidenceId.body.items.map((item) => [item.record_kind, item.checkpoint.source_kind]),
    [['evidence_record', 'tmux_observation']]
  );
  assert.equal(Object.hasOwn(byEvidenceId.body.items[0].checkpoint, 'evidence_id'), false);
  assert.equal(JSON.stringify(byEvidenceId.body).includes('/tmp/route-parity'), false);
  assert.equal(JSON.stringify(byEvidenceId.body).includes('tmux://'), false);

  const combined = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?record_kind=evidence_record&collector_snapshot_id=collector-snapshot%3A2026-03-09T18%3A06%3A00.000Z&correlation_id=collector-snapshot%3A2026-03-09T18%3A06%3A00.000Z&source_kind=workspace_file&limit=1`
  );
  assert.equal(combined.response.status, 200);
  assert.deepEqual(
    combined.body.items.map((item) => [item.record_kind, item.checkpoint.source_kind]),
    [['evidence_record', 'workspace_file']]
  );

  const substringEvidenceId = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id.slice(0, -2))}&limit=10`
  );
  assert.equal(substringEvidenceId.response.status, 200);
  assert.deepEqual(substringEvidenceId.body, { items: [] });
});

test('GET provenance bundle and checkpoint-log redact unsafe historical evidence internals', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  const unsafePath = '/tmp/provenance-canary/Hermes runtime source/profile-secret.json';
  const unsafeTmuxRef = 'tmux://Hermes-runtime-source/0.9';
  const unsafeProfileRef = 'hermes://profile/profile-secret';
  const unsafeSessionRef = 'hermes://session/session-secret';
  const safeSessionEvidenceRef = 'hermes://session/runtime-canary';
  const unsafeToken = 'ghp_provenanceCanaryToken1234567890';
  const unsafeWebhook = 'https://hooks.slack.com/services/T000/B000/provenanceCanary';
  const unsafeFragments = [
    unsafePath,
    unsafeTmuxRef,
    unsafeProfileRef,
    unsafeSessionRef,
    unsafeToken,
    unsafeWebhook,
    'payload_dump',
    'metadata_dump',
    'profile-secret',
    'session-secret'
  ];

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [unsafePath, unsafeTmuxRef, unsafeProfileRef, unsafeSessionRef],
        hermes_runtime_observations: [
          {
            source_kind: 'hermes_session',
            evidence_ref: safeSessionEvidenceRef,
            profile_id: 'profile-secret',
            session_ref: 'session-secret',
            status: 'observed',
            observed_at: '2026-03-09T18:05:40.000Z',
            degraded_reasons: [`payload_dump ${unsafeWebhook}`],
            metadata: {
              token: unsafeToken,
              webhook_url: unsafeWebhook,
              local_path: unsafePath,
              tmux_ref: unsafeTmuxRef,
              profile_ref: unsafeProfileRef,
              session_ref: unsafeSessionRef,
              metadata_dump: {
                payload_dump: unsafeToken
              }
            }
          }
        ],
        source_health: {
          hermes_session: {
            status: 'observed',
            profile_id: 'profile-secret',
            expected_session_ref: 'session-secret',
            last_observed_at: '2026-03-09T18:05:40.000Z',
            degraded_reasons: [`metadata_dump ${unsafeToken}`]
          }
        }
      }
    ]
  });

  const evidenceRecord = store
    .listEvidenceRecords({ source_kind: 'hermes_session', limit: '10' })
    .find((record) => record.evidence_ref === safeSessionEvidenceRef);
  assert.ok(evidenceRecord);
  const evidenceAppendIndex =
    store.records.findIndex(
      (record) =>
        record.kind === 'evidence_record' &&
        record.payload?.evidence_id === evidenceRecord.evidence_id
    ) + 1;
  assert.equal(evidenceAppendIndex > 0, true);

  const provenanceBundle = await requestJson(
    `${baseUrl}/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/provenance-bundle`
  );
  assert.equal(provenanceBundle.response.status, 200);
  assert.deepEqual(Object.keys(provenanceBundle.body.item).sort(), [
    'anchors',
    'evidence_id',
    'record',
    'source_summary'
  ]);
  assert.deepEqual(provenanceBundle.body.item.record, {
    observed_at: '2026-03-09T18:05:40.000Z',
    collected_at: '2026-03-09T18:06:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'hermes_session',
    evidence_role: 'runtime_presence',
    source_status: 'observed',
    output_candidate: false,
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
    correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
    unmapped: false
  });

  const checkpointLog = await requestJson(
    `${baseUrl}/accountability/replay/checkpoint-log?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id)}&limit=1`
  );
  assert.equal(checkpointLog.response.status, 200);
  assert.deepEqual(checkpointLog.body.items, [
    {
      append_index: evidenceAppendIndex,
      record_kind: 'evidence_record',
      checkpoint: provenanceBundle.body.item.record
    }
  ]);

  for (const body of [provenanceBundle.body, checkpointLog.body]) {
    const serialized = JSON.stringify(body);
    for (const unsafeFragment of unsafeFragments) {
      assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
    }
    assert.equal(serialized.includes('evidence_ref'), false);
    assert.equal(serialized.includes('degraded_reasons'), false);
    assert.equal(serialized.includes('payload'), false);
    assert.equal(serialized.includes('metadata'), false);
    assert.equal(serialized.includes('webhook'), false);
    assert.equal(serialized.includes('token'), false);
  }
});

test('runtime provenance public projections redact Hermes task and source canary matrix', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-provenance-redaction-'));
  const store = await createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
  const unsafeFragments = [
    '/tmp/runtime-provenance-redaction/profile.json',
    '/Users/cwp/private/runtime-provenance-redaction/session.json',
    'file:///tmp/runtime-provenance-redaction/profile.json',
    'https://example.invalid/runtime-provenance-redaction',
    'http://example.invalid/runtime-provenance-redaction',
    'https://hooks.slack.com/services/runtime-provenance-redaction',
    'ghp_runtimeProvenanceRedaction1234567890',
    'token=runtime-provenance-redaction',
    'tmux://runtime-provenance-redaction/0.1',
    'hermes://profile/runtime-provenance-redaction',
    'hermes://session/runtime-provenance-redaction',
    'profile-runtime-provenance-redaction',
    'session-runtime-provenance-redaction',
    'payload_dump',
    'metadata_dump',
    'degraded_reason_dump'
  ];

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 2,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        hermes_profile: 1,
        kanban_fixture: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 2,
          source_kinds: ['hermes_profile', 'kanban_fixture'],
          latest_evidence_at: '2026-03-09T18:05:40.000Z',
          confidence_level: 'high'
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: unsafeFragments,
        hermes_runtime_observations: [
          {
            source_kind: 'hermes_profile',
            evidence_ref: 'hermes://profile/runtime-public-safe',
            profile_id: 'profile-runtime-provenance-redaction',
            session_ref: 'session-runtime-provenance-redaction',
            status: 'observed',
            observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: [`degraded_reason_dump ${unsafeFragments[5]}`],
            source_provenance: {
              payload: unsafeFragments[0],
              url: unsafeFragments[3]
            },
            metadata: {
              payload_dump: unsafeFragments,
              webhook: unsafeFragments[5],
              token: unsafeFragments[7]
            }
          }
        ],
        task_evidence_observations: [
          {
            status: 'degraded',
            task_ref: 'SAFE-TASK-101',
            source_kind: 'kanban_fixture',
            observed_at: '2026-03-09T18:05:40.000Z',
            correlation_id: 'runtime-provenance-redaction-task',
            warnings: ['agent_id suppressed'],
            source_provenance: {
              payload: unsafeFragments[1],
              webhook: unsafeFragments[5]
            },
            metadata: {
              metadata_dump: unsafeFragments
            }
          }
        ],
        source_health: {
          hermes_profile: {
            status: 'observed',
            profile_id: 'profile-runtime-provenance-redaction',
            expected_session_ref: 'session-runtime-provenance-redaction',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: [`metadata_dump ${unsafeFragments[6]}`]
          }
        }
      }
    ]
  });

  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 0
  });

  const hermesRecord = store.listEvidenceRecords({
    source_kind: 'hermes_profile',
    evidence_role: 'runtime_presence',
    limit: '1'
  })[0];
  assert.ok(hermesRecord);

  const sourceContext = store.getEvidenceSourceContext(hermesRecord.evidence_id);
  const summary = store.getAgentEvidenceSpineSummary({ newest_first: 'true', limit: '5' });
  const spine = store.getAgentEvidenceSpine('app-engineering', {
    newest_first: 'true',
    limit: '5'
  });

  assert.deepEqual(sourceContext.source_summary, {
    kind: 'hermes_profile',
    status: 'observed',
    role: 'runtime_presence',
    output_candidate: false,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:30.000Z',
      collected_at: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.equal(sourceContext.source_health.summary.agent_count, 1);
  assert.equal(sourceContext.source_health.summary.source_kind_buckets.hermes_profile.observed, 1);
  assert.deepEqual(sourceContext.record, {
    observed_at: '2026-03-09T18:05:30.000Z',
    collected_at: '2026-03-09T18:06:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'hermes_profile',
    evidence_role: 'runtime_presence',
    source_status: 'observed',
    output_candidate: false,
    unmapped: false
  });

  const appSummary = summary.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appSummary.evidence_count, 2);
  assert.equal(appSummary.source_kind_buckets.hermes_profile, 1);
  assert.equal(appSummary.source_kind_buckets.kanban_fixture, 1);
  assert.equal(appSummary.output_candidate_buckets.false, 2);
  assert.equal(appSummary.latest_observed_at, '2026-03-09T18:05:40.000Z');

  assert.equal(spine.evidence_summary.total_count, 2);
  assert.equal(spine.evidence_summary.evidence_role_buckets.runtime_presence, 1);
  assert.equal(spine.evidence_summary.evidence_role_buckets.task_reference, 1);
  assert.equal(spine.source_health.summary.source_kind_buckets.hermes_profile.observed, 1);
  assert.equal(spine.source_health.agent_items[0].evidence_count, 2);

  for (const body of [sourceContext, summary, spine]) {
    const serialized = JSON.stringify(body);
    for (const unsafeFragment of unsafeFragments) {
      assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
    }
    for (const unsafePattern of ['http://', 'https://', 'file://', '/tmp/', '/Users/', 'tmux://', 'hermes://']) {
      assert.equal(serialized.includes(unsafePattern), false, unsafePattern);
    }
    for (const field of [
      'evidence_ref',
      'source_provenance',
      'metadata',
      'degraded_reasons',
      'payload',
      'webhook',
      '"token"',
      'current_state',
      'active_task',
      'last_meaningful_output_at',
      'last_heartbeat_at'
    ]) {
      assert.equal(serialized.includes(field), false, field);
    }
  }
});

test('GET input-proof summary is read-only and exposes only proof count buckets', async (t) => {
  const store = await createDirectStore();
  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 1,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        hermes_profile: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 1,
          source_kinds: ['hermes_profile'],
          latest_evidence_at: '2026-03-09T18:05:30.000Z',
          confidence_level: 'high'
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: ['hermes://profile/input-proof-secret'],
        hermes_runtime_observations: [
          {
            source_kind: 'hermes_profile',
            evidence_ref: 'hermes://profile/input-proof-secret',
            profile_id: 'input-proof-profile-secret',
            session_ref: 'input-proof-session-secret',
            status: 'observed',
            observed_at: '2026-03-09T18:05:30.000Z',
            source_provenance: {
              source_format: 'json_array',
              source_index: 0,
              source_input_ordinal: 2,
              source_file_ordinal: 3,
              payload: 'token=input-proof-secret'
            }
          }
        ],
        source_health: {}
      }
    ]
  });
  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    checkpoint: store.getReplayCheckpointSummary()
  };

  const result = await requestJsonDirect({
    url: '/evidence-records/input-proof-summary?agent_id=app-engineering&source_kind=hermes_profile&limit=1',
    store
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, {
    item: {
      total_count: 1,
      returned_limit: 1,
      proof_count: 1,
      missing_proof_count: 0,
      source_format_buckets: {
        json_array: 1,
        jsonl: 0
      },
      source_index_buckets: {
        '0': 1
      },
      line_buckets: {},
      source_input_ordinal_buckets: {
        '2': 1
      },
      source_file_ordinal_buckets: {
        '3': 1
      }
    }
  });
  assert.deepEqual(
    {
      recordCount: store.records.length,
      counts: store.getCounts(),
      checkpoint: store.getReplayCheckpointSummary()
    },
    before
  );

  const empty = await requestJsonDirect({
    url: '/evidence-records/input-proof-summary?evidence_id=missing-evidence-id&limit=10',
    store
  });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.item, {
    total_count: 0,
    returned_limit: 10,
    proof_count: 0,
    missing_proof_count: 0,
    source_format_buckets: {
      json_array: 0,
      jsonl: 0
    },
    source_index_buckets: {},
    line_buckets: {},
    source_input_ordinal_buckets: {},
    source_file_ordinal_buckets: {}
  });

  const serialized = JSON.stringify(result.body);
  for (const unsafeFragment of [
    'evidence_id',
    'evidence_ref',
    'metadata',
    'degraded_reasons',
    'hermes://',
    'input-proof-profile-secret',
    'input-proof-session-secret',
    'token=input-proof-secret'
  ]) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }
});

test('GET read route purity matrix leaves replay records and checkpoints unchanged', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET read route purity matrix must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport(createRouteParityCollectorReport());
  const evidenceRecord = store.listEvidenceRecords({
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    output_candidate: 'true',
    limit: '1'
  })[0];
  assert.ok(evidenceRecord);

  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    checkpoint: store.getReplayCheckpointSummary(),
    checkpointLog: store.listReplayCheckpointLog({ limit: '3' }),
    file: await readFile(storeFile, 'utf8')
  };

  const paths = [
    '/evidence-records?mapped=true&output_candidate=true&limit=2',
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}`,
    '/evidence-records/facets?mapped=true&output_candidate=true&limit=1',
    '/evidence-records/summary?mapped=true&output_candidate=true&limit=1',
    '/evidence-records/ref-rollup?mapped=true&output_candidate=true&limit=2',
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/provenance-bundle`,
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/source-context`,
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/replay-window?before=1&after=1`,
    `/accountability/replay?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id)}&limit=5&window=60m`,
    '/accountability/replay/checkpoint-summary',
    '/accountability/replay/checkpoint-log?limit=3',
    '/storage/replay-manifest',
    '/storage/index-health',
    '/storage/schema',
    '/runtime/source-gaps?newest_first=true&limit=10',
    '/runtime/source-gaps/schema',
    '/runtime/source-gaps/summary?newest_first=true&limit=1',
    '/runtime/source-gaps/agent-summary?newest_first=true&limit=1',
    '/runtime/source-gaps/lifecycle?newest_first=true&limit=1',
    '/runtime/source-gaps/trend?newest_first=true&limit=1',
    '/agents/evidence-spine/summary?newest_first=true&limit=1',
    '/agents/app-engineering/evidence-spine?newest_first=true&limit=1'
  ];

  for (const pathname of paths) {
    const response = await requestJson(`${baseUrl}${pathname}`);
    assert.equal(response.response.status, 200, pathname);
    assert.equal(store.records.length, before.recordCount, pathname);
    assert.deepEqual(store.getCounts(), before.counts, pathname);
    assert.deepEqual(store.getReplayCheckpointSummary(), before.checkpoint, pathname);
    assert.deepEqual(store.listReplayCheckpointLog({ limit: '3' }), before.checkpointLog, pathname);
    assert.equal(await readFile(storeFile, 'utf8'), before.file, pathname);
  }

  const unknownReplay = await requestJson(
    `${baseUrl}/accountability/replay?evidence_id=missing-evidence-id&limit=5&window=60m`
  );
  assert.equal(unknownReplay.response.status, 200);
  assert.deepEqual(unknownReplay.body.query, {
    limit: 5,
    window: '60m'
  });
  assert.equal(JSON.stringify(unknownReplay.body).includes('missing-evidence-id'), false);
  assert.deepEqual(unknownReplay.body.events, []);
  assert.deepEqual(unknownReplay.body.interactions, []);
  assert.deepEqual(unknownReplay.body.memory_artifacts, []);
  assert.deepEqual(unknownReplay.body.ledger, []);
  assert.equal(store.records.length, before.recordCount);
  assert.deepEqual(store.getCounts(), before.counts);
  assert.deepEqual(store.getReplayCheckpointSummary(), before.checkpoint);
  assert.deepEqual(store.listReplayCheckpointLog({ limit: '3' }), before.checkpointLog);
  assert.equal(await readFile(storeFile, 'utf8'), before.file);
  assert.equal(collectCount, 0);
});

test('read-only GET route boundary matrix non-echoes hostile ids and stays collection-free', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('read-only route boundary matrix must not collect runtime evidence');
    }
  };
  const safeRecord = createReadOnlyRouteBoundaryEvidenceRecord();
  const safeItem = { label: 'route-boundary-safe' };
  const safeList = [safeItem];
  const safeEvidenceList = [safeRecord];
  const safeNull = () => null;
  const safeObject = () => safeItem;
  const routes = [
    ['inventory route: evidence records schema', '/evidence-records/schema?limit=1', 'getEvidenceRecordsSchema'],
    [
      'list route: evidence records',
      '/evidence-records?agent_id=app-engineering&source_kind=workspace_file&limit=1',
      'listEvidenceRecords',
      () => safeEvidenceList
    ],
    [
      'detail route: evidence record',
      `/evidence-records/${encodeURIComponent(safeRecord.evidence_id)}`,
      'getEvidenceRecord',
      () => safeRecord
    ],
    [
      'non-echo detail route: unknown hostile evidence id',
      `/evidence-records/${encodeURIComponent(READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID)}`,
      'getEvidenceRecord',
      safeNull,
      404
    ],
    [
      'ref-rollup route',
      '/evidence-records/ref-rollup?agent_id=app-engineering&limit=1',
      'getEvidenceRefRollup'
    ],
    [
      'input-proof-summary route',
      '/evidence-records/input-proof-summary?agent_id=app-engineering&limit=1',
      'getEvidenceInputProofSummary'
    ],
    ['inventory route: agent evidence-spine schema', '/agents/evidence-spine/schema?limit=1', 'getAgentsEvidenceSpineSchema'],
    [
      'agent evidence-spine summary route',
      '/agents/evidence-spine/summary?agent_id=app-engineering&limit=1',
      'getAgentEvidenceSpineSummary'
    ],
    [
      'agent evidence-spine source-matrix route',
      '/agents/evidence-spine/source-matrix?agent_id=app-engineering&limit=1',
      'getAgentEvidenceSourceStatusMatrix'
    ],
    [
      'agent evidence-spine detail route',
      '/agents/app-engineering/evidence-spine?source_kind=workspace_file&limit=1',
      'getAgentEvidenceSpine'
    ],
    [
      'non-echo agent evidence-spine route: unknown hostile agent id',
      `/agents/${encodeURIComponent(READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID)}/evidence-spine`,
      'getAgentEvidenceSpine',
      safeNull,
      404
    ],
    ['inventory route: runtime source-gaps schema', '/runtime/source-gaps/schema?limit=1', 'getRuntimeSourceGapsSchema'],
    ['source-gaps list route', '/runtime/source-gaps?agent_id=app-engineering&limit=1', 'listRuntimeSourceGaps', () => safeList],
    ['source-gaps summary route', '/runtime/source-gaps/summary?agent_id=app-engineering&limit=1', 'getRuntimeSourceGapsSummary'],
    ['source-gaps agent-summary route', '/runtime/source-gaps/agent-summary?agent_id=app-engineering&limit=1', 'getRuntimeSourceGapAgentSummary'],
    ['source-gaps lifecycle route', '/runtime/source-gaps/lifecycle?agent_id=app-engineering&limit=1', 'getRuntimeSourceGapLifecycle'],
    ['source-gaps trend route', '/runtime/source-gaps/trend?agent_id=app-engineering&limit=1', 'getRuntimeSourceGapTrend'],
    [
      'source-context route',
      `/evidence-records/${encodeURIComponent(safeRecord.evidence_id)}/source-context`,
      'getEvidenceSourceContext'
    ],
    [
      'non-echo source-context route: unknown hostile evidence id',
      `/evidence-records/${encodeURIComponent(READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID)}/source-context`,
      'getEvidenceSourceContext',
      safeNull,
      404
    ],
    [
      'replay-window route',
      `/evidence-records/${encodeURIComponent(safeRecord.evidence_id)}/replay-window?before=1&after=1`,
      'getEvidenceReplayWindow'
    ],
    [
      'non-echo replay-window route: unknown hostile evidence id',
      `/evidence-records/${encodeURIComponent(READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID)}/replay-window`,
      'getEvidenceReplayWindow',
      safeNull,
      404
    ],
    ['storage replay-manifest route', '/storage/replay-manifest', 'getStorageReplayManifest'],
    ['storage index-health route', '/storage/index-health', 'getStorageIndexHealth'],
    ['inventory route: controller snapshot schema', '/collectors/controller-snapshot/schema?limit=1', 'getControllerSnapshotSchema']
  ];

  for (const [name, pathname, methodName, method = safeObject, status = 200] of routes) {
    await t.test(name, async () => {
      const route = {
        name,
        methods: {
          [methodName]: method
        }
      };
      const { store, calls } = createReadOnlyRouteBoundaryStore(route);
      const response = await requestJsonDirect({
        url: withHostileRouteBoundaryQuery(pathname),
        store,
        controllerSnapshotCollector
      });

      assert.equal(response.response.status, status, name);
      assert.deepEqual(calls, [methodName], name);
      for (const writeMethod of READ_ONLY_ROUTE_BOUNDARY_WRITE_METHODS) {
        assert.equal(calls.includes(writeMethod), false, `${name} called ${writeMethod}`);
      }
      assertNoSafeRouteCanaries(response.body, name);
      assert.equal(
        response.text.includes(READ_ONLY_ROUTE_BOUNDARY_HOSTILE_ID),
        false,
        `${name} echoed hostile id matrix`
      );
    });
  }

  assert.equal(collectCount, 0);
});

test('GET safe-route leak regression matrix stays redacted and read-pure under hostile canaries', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET safe-route leak regression matrix must not collect');
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-safe-route-matrix-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent({
    event_id: 'evt_safe_route_canary',
    ts: '2026-03-09T18:04:00.000Z',
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    agent_role: 'app-engineering',
    event_type: 'review_started',
    current_state: 'reviewing',
    summary: 'Safe route canary event',
    correlation_id: 'corr-safe-route-canary',
    evidence_refs: SAFE_ROUTE_HOSTILE_CANARIES,
    source_kind: 'controller_event',
    metadata: {
      local_path: '/Volumes/safe-route-canary/runtime.json',
      token: 'token=safe-route-canary',
      webhook: 'webhook-safe-route-canary'
    }
  });
  await store.appendCollectorReport(createSafeRouteCanaryCollectorReport());

  const evidenceRecord = store.listEvidenceRecords({
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    output_candidate: 'true',
    limit: '1'
  })[0];
  assert.ok(evidenceRecord);

  const hostileInputQuery = new URLSearchParams({
    ignored_canary: SAFE_ROUTE_HOSTILE_CANARIES.join(' '),
    runtime_sources_file: SAFE_ROUTE_HOSTILE_CANARIES[0],
    hermes_runtime_sources_file: SAFE_ROUTE_HOSTILE_CANARIES[1],
    task_evidence_file: SAFE_ROUTE_HOSTILE_CANARIES[2],
    task_evidence_paths: SAFE_ROUTE_HOSTILE_CANARIES[3],
    controller_snapshot_id: SAFE_ROUTE_HOSTILE_CANARIES[4],
    from_collector_snapshot_id: SAFE_ROUTE_HOSTILE_CANARIES[5],
    to_collector_snapshot_id: SAFE_ROUTE_HOSTILE_CANARIES[6],
    evidence_id: SAFE_ROUTE_HOSTILE_CANARIES[7],
    evidence_ref: SAFE_ROUTE_HOSTILE_CANARIES[8],
    token: SAFE_ROUTE_HOSTILE_CANARIES[9],
    webhook: SAFE_ROUTE_HOSTILE_CANARIES[10]
  }).toString();
  const routes = [
    `/collectors/controller-snapshot/schema?${hostileInputQuery}`,
    `/collectors/controller-snapshot/summary?${hostileInputQuery}`,
    `/collectors/controller-snapshot/evidence-coverage?agent_id=app-engineering&source_kind=workspace_file&limit=2&${hostileInputQuery}`,
    `/collectors/controller-snapshot/source-health?agent_id=app-engineering&source_kind=workspace_file&limit=2&${hostileInputQuery}`,
    `/collectors/controller-snapshot/history?agent_id=app-engineering&limit=2&${hostileInputQuery}`,
    `/collectors/controller-snapshot/diff?limit=2&${hostileInputQuery}`,
    `/runtime/source-gaps/schema?${hostileInputQuery}`,
    `/runtime/source-gaps/summary?newest_first=true&limit=2&${hostileInputQuery}`,
    `/runtime/source-gaps/agent-summary?newest_first=true&limit=2&${hostileInputQuery}`,
    `/runtime/source-gaps/lifecycle?newest_first=true&limit=2&${hostileInputQuery}`,
    `/runtime/source-gaps/transition-summary?newest_first=true&limit=2&${hostileInputQuery}`,
    `/runtime/source-gaps/trend?newest_first=true&limit=2&${hostileInputQuery}`,
    `/agents/evidence-spine/schema?${hostileInputQuery}`,
    `/agents/evidence-spine/summary?newest_first=true&limit=2&${hostileInputQuery}`,
    `/agents/evidence-spine/source-matrix?newest_first=true&limit=2&${hostileInputQuery}`,
    `/storage/schema?${hostileInputQuery}`,
    `/storage/replay-manifest?${hostileInputQuery}`,
    `/storage/index-health?${hostileInputQuery}`,
    `/accountability/replay/checkpoint-summary?${hostileInputQuery}`,
    `/accountability/replay/checkpoint-log?limit=2&${hostileInputQuery}`,
    `/evidence-records/schema?${hostileInputQuery}`,
    `/evidence-records/input-proof-summary?agent_id=app-engineering&source_kind=hermes_profile&limit=2&${hostileInputQuery}`,
    `/evidence-records/ref-rollup?agent_id=app-engineering&limit=5&${hostileInputQuery}`,
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/source-context?${hostileInputQuery}`,
    `/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/replay-window?before=1&after=1&${hostileInputQuery}`
  ];

  const before = {
    recordCount: store.records.length,
    counts: store.getCounts(),
    checkpoint: store.getReplayCheckpointSummary(),
    checkpointLog: store.listReplayCheckpointLog({ limit: '5' }),
    file: await readFile(storeFile, 'utf8')
  };

  for (const route of routes) {
    const response = await requestJsonDirect({
      url: route,
      store,
      controllerSnapshotCollector
    });
    assert.equal(response.response.status, 200, route);
    assertNoSafeRouteCanaries(response.body, route);
    assert.equal(store.records.length, before.recordCount, route);
    assert.deepEqual(store.getCounts(), before.counts, route);
    assert.deepEqual(store.getReplayCheckpointSummary(), before.checkpoint, route);
    assert.deepEqual(store.listReplayCheckpointLog({ limit: '5' }), before.checkpointLog, route);
    assert.equal(await readFile(storeFile, 'utf8'), before.file, route);
  }

  assert.equal(collectCount, 0);
});

test('GET evidence source-context is bounded, sanitized, and 404s unknown evidence', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  const unsafeFragments = [
    '/tmp/source-context-route',
    '/Users/cwp/private/source-context-route.md',
    'tmux://source-context-route/0.1',
    'hermes://profile/source-context-route',
    'hermes://session/source-context-route',
    'session-source-context-route',
    'profile-source-context-route',
    'payload_dump',
    'metadata_dump',
    'token=source-context-route',
    'https://hooks.slack.com/services/source-context-route'
  ];

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: unsafeFragments,
        workspace_observations: [
          {
            path: '/tmp/source-context-route/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:20.000Z'
          }
        ],
        source_health: {
          workspace_files: {
            status: 'degraded',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:20.000Z',
            degraded_reasons: unsafeFragments
          }
        }
      }
    ]
  });

  const evidenceRecord = store.listEvidenceRecords({
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    limit: '1'
  })[0];
  assert.ok(evidenceRecord);
  const beforeCount = store.records.length;

  const unknown = await requestJson(`${baseUrl}/evidence-records/missing-evidence-id/source-context`);
  assert.equal(unknown.response.status, 404);
  assert.deepEqual(unknown.body, {
    error: 'not_found',
    details: 'unknown evidence record',
    disclosure: {
      decision: 'deny',
      reason_code: 'unknown_evidence',
      mapping: 'unknown',
      freshness: 'unknown'
    }
  });

  const sourceContext = await requestJson(
    `${baseUrl}/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/source-context`
  );
  assert.equal(sourceContext.response.status, 200);
  assert.equal(sourceContext.body.item.evidence_id, evidenceRecord.evidence_id);
  assert.deepEqual(sourceContext.body.item.disclosure, {
    decision: 'allow',
    reason_code: 'mapped_stale',
    mapping: 'mapped',
    freshness: 'stale'
  });
  assert.equal(sourceContext.body.item.source_summary.kind, 'workspace_file');
  assert.equal(sourceContext.body.item.source_gaps.items.length, 1);
  assert.equal(sourceContext.body.item.source_health.agent_items.length, 1);
  assert.equal(store.records.length, beforeCount);

  const serialized = JSON.stringify(sourceContext.body);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
  assert.equal(serialized.includes('payload'), false);
  assert.equal(serialized.includes('webhook'), false);
  assert.equal(serialized.includes('token'), false);
  for (const unsafeFragment of unsafeFragments) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }
});

test('GET evidence replay-window is bounded, sanitized, capped, and 404s unknown evidence', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  const unsafeFragments = [
    '/tmp/source-context-route',
    '/Users/cwp/private/source-context-route.md',
    'tmux://source-context-route/0.1',
    'hermes://profile/source-context-route',
    'hermes://session/source-context-route',
    'session-source-context-route',
    'profile-source-context-route',
    'payload_dump',
    'metadata_dump',
    'collector-snapshot:2026-03-09T18:06:00.000Z',
    'token=source-context-route',
    'https://hooks.slack.com/services/source-context-route'
  ];

  await store.appendEvent({
    event_id: 'evt_replay_window_canary',
    ts: '2026-03-09T18:04:00.000Z',
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    agent_role: 'app-engineering',
    event_type: 'review_started',
    current_state: 'reviewing',
    summary: 'Replay window route canary',
    correlation_id: 'corr-replay-window-canary',
    evidence_refs: unsafeFragments,
    source_kind: 'controller_event',
    metadata: {
      token: 'token=source-context-route'
    }
  });
  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: unsafeFragments,
        workspace_observations: [
          {
            path: '/tmp/source-context-route/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:20.000Z'
          }
        ],
        source_health: {
          workspace_files: {
            status: 'degraded',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:20.000Z',
            degraded_reasons: unsafeFragments
          }
        }
      }
    ]
  });

  const evidenceRecord = store.listEvidenceRecords({
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    limit: '1'
  })[0];
  assert.ok(evidenceRecord);
  const beforeCount = store.records.length;

  const unknown = await requestJson(
    `${baseUrl}/evidence-records/missing-evidence-id/replay-window`
  );
  assert.equal(unknown.response.status, 404);
  assert.deepEqual(unknown.body, {
    error: 'not_found',
    details: 'unknown evidence record'
  });
  assert.equal(JSON.stringify(unknown.body).includes('missing-evidence-id'), false);

  const replayWindow = await requestJson(
    `${baseUrl}/evidence-records/${encodeURIComponent(evidenceRecord.evidence_id)}/replay-window?before=99&after=99`
  );
  assert.equal(replayWindow.response.status, 200);
  assert.equal(replayWindow.body.item.center.evidence_id, evidenceRecord.evidence_id);
  assert.deepEqual(replayWindow.body.item.window, { before: 10, after: 10 });
  assert.equal(replayWindow.body.item.before.length <= 10, true);
  assert.equal(replayWindow.body.item.after.length <= 10, true);
  assert.equal(replayWindow.body.item.center.source_summary.kind, 'workspace_file');
  assert.equal(store.records.length, beforeCount);

  const serialized = JSON.stringify(replayWindow.body);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
  assert.equal(serialized.includes('payload'), false);
  assert.equal(serialized.includes('webhook'), false);
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('evt_replay_window_canary'), false);
  assert.equal(serialized.includes('review_started'), false);
  assert.equal(serialized.includes('controller_event'), false);
  for (const unsafeFragment of unsafeFragments) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }
});

test('collector snapshot POST exposes shared artifact rollups for refs shared by multiple agents', async (t) => {
  const sharedArtifactRef = '/tmp/shared-controller-snapshot/todo.md';
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
        summary: {
          agent_count: 2,
          heartbeat_count: 2,
          tmux_observed_count: 0,
          workspace_observed_count: 2,
          reboot_recommended_count: 0
        },
        items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/shared-controller-snapshot',
            session_ref: '5-web3-app-engineering',
            evidence_refs: [sharedArtifactRef],
            workspace_observations: [
              {
                path: sharedArtifactRef,
                file_name: 'todo.md',
                kind: 'workspace_file',
                last_modified_at: '2026-03-09T18:04:30.000Z'
              }
            ],
            tmux_observations: [],
            supervision: {
              watch_target: 'growth-revenue',
              watched_by: ['protocol-engineering', 'team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'app-engineering',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'coding',
              active_task: 'Implement shared snapshot artifact rollup',
              last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
              last_file_write_at: '2026-03-09T18:04:30.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          },
          {
            agent_id: 'growth-revenue',
            workspace_root: '/tmp/shared-controller-snapshot',
            session_ref: '6-web3-growth-revenue',
            evidence_refs: [sharedArtifactRef],
            workspace_observations: [
              {
                path: sharedArtifactRef,
                file_name: 'todo.md',
                kind: 'workspace_file',
                last_modified_at: '2026-03-09T18:04:45.000Z'
              }
            ],
            tmux_observations: [],
            supervision: {
              watch_target: 'app-engineering',
              watched_by: ['team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'growth-revenue',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'researching',
              active_task: 'Review shared snapshot artifact rollup',
              last_meaningful_output_at: '2026-03-09T18:04:45.000Z',
              last_file_write_at: '2026-03-09T18:04:45.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          }
        ]
      };
    }
  };

  const { baseUrl } = await createHarness(t, { controllerSnapshotCollector });

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.deepEqual(collected.body.item.shared_artifacts, [
    {
      artifact_ref: sharedArtifactRef,
      artifact_kind: 'workspace_file',
      file_name: 'todo.md',
      agent_ids: ['app-engineering', 'growth-revenue'],
      agent_count: 2,
      mention_count: 2,
      last_seen_at: '2026-03-09T18:04:45.000Z',
      source_kinds: ['workspace_file']
    }
  ]);

  const latest = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(latest.response.status, 200);
  assert.deepEqual(latest.body.item.shared_artifacts, collected.body.item.shared_artifacts);
});

test('collector snapshot POST emits supervision events onto existing query surfaces', async (t) => {
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
        summary: {
          agent_count: 2,
          heartbeat_count: 2,
          tmux_observed_count: 1,
          workspace_observed_count: 2,
          reboot_recommended_count: 1
        },
        items: [
          {
            agent_id: 'market-intel',
            evidence_refs: ['/tmp/market-intel/outbox.md'],
            workspace_observations: [],
            tmux_observations: [],
            supervision: {
              watch_target: 'product-pmf',
              watched_by: ['growth-revenue', 'team-lead'],
              needs_attention: true
            },
            heartbeat: {
              agent_id: 'market-intel',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'researching',
              active_task: 'Review competitor notes',
              last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
              last_file_write_at: '2026-03-09T17:45:00.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          },
          {
            agent_id: 'growth-revenue',
            evidence_refs: [
              '/tmp/growth-revenue/inbox.md',
              'tmux://6-web3-growth-revenue/0.0'
            ],
            workspace_observations: [],
            tmux_observations: [
              {
                session_name: '6-web3-growth-revenue',
                window_index: '0',
                pane_index: '0',
                pane_id: '%21',
                pane_title: 'Investigate stalled shell',
                pane_current_command: 'bash',
                pane_active: true,
                pane_dead: true,
                pane_activity_at: '2026-03-09T18:00:00.000Z'
              }
            ],
            supervision: {
              watch_target: 'market-intel',
              watched_by: ['app-engineering', 'team-lead'],
              needs_attention: true
            },
            heartbeat: {
              agent_id: 'growth-revenue',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'blocked',
              active_task: 'Investigate stalled shell',
              last_meaningful_output_at: '2026-03-09T18:00:00.000Z',
              last_file_write_at: null,
              current_blocker: 'tmux pane marked dead',
              confidence_level: 'high',
              reboot_recommended: true
            }
          }
        ]
      };
    }
  };

  const { baseUrl } = await createHarness(t, { controllerSnapshotCollector });

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);

  const activityEvents = await requestJson(`${baseUrl}/events?event_type=agent_state_changed&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.equal(activityEvents.body.items.length, 2);
  assert.ok(activityEvents.body.items.every((event) => event.metadata.collector_activity_family === 'state_change'));

  const fileWriteEvents = await requestJson(`${baseUrl}/events?event_type=agent_wrote_file&limit=5`);
  assert.equal(fileWriteEvents.response.status, 200);
  assert.equal(fileWriteEvents.body.items.length, 1);
  assert.ok(fileWriteEvents.body.items.every((event) => event.metadata.collector_activity_family === 'file_write'));
  assert.ok(fileWriteEvents.body.items.every((event) => !event.evidence_refs.includes('/tmp/growth-revenue/inbox.md')));

  const events = await requestJson(`${baseUrl}/events?event_type=peer_watch_alert_raised`);
  assert.equal(events.response.status, 200);
  assert.equal(events.body.items.length, 2);
  assert.ok(
    events.body.items.some(
      (event) =>
        event.agent_id === 'market-intel' &&
        event.metadata.collector_alert_family === 'staleness' &&
        event.severity === 'yellow'
    )
  );
  assert.ok(
    events.body.items.some(
      (event) =>
        event.agent_id === 'growth-revenue' &&
        event.metadata.collector_alert_family === 'blocked' &&
        event.severity === 'orange'
    )
  );

  const alerts = await requestJson(`${baseUrl}/peer-watch/alerts`);
  assert.equal(alerts.response.status, 200);
  assert.equal(alerts.body.items.length, 2);
  assert.ok(alerts.body.items.every((item) => item.status === 'open'));

  const timeline = await requestJson(`${baseUrl}/timeline?window=30m`);
  assert.equal(timeline.response.status, 200);
  assert.equal(
    timeline.body.items.filter((item) => item.event_type === 'peer_watch_alert_raised').length,
    2
  );
  const growthRevenueAlert = timeline.body.items.find(
    (item) =>
      item.agent_id === 'growth-revenue' && item.event_type === 'peer_watch_alert_raised'
  );
  assert.ok(growthRevenueAlert);
  assert.equal(growthRevenueAlert.source_kind, 'controller_event');
  assert.deepEqual(growthRevenueAlert.counterparty_agent_ids, ['app-engineering']);
  assert.deepEqual(growthRevenueAlert.evidence_refs, [
    '/tmp/growth-revenue/inbox.md',
    'tmux://6-web3-growth-revenue/0.0'
  ]);

  const growthRevenueStateChange = timeline.body.items.find(
    (item) =>
      item.agent_id === 'growth-revenue' && item.event_type === 'agent_state_changed'
  );
  assert.ok(growthRevenueStateChange);
  assert.equal(growthRevenueStateChange.source_kind, 'tmux_observation');
  assert.deepEqual(growthRevenueStateChange.evidence_refs, [
    'tmux://6-web3-growth-revenue/0.0'
  ]);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  const marketIntel = overview.body.agents.find((agent) => agent.agent_id === 'market-intel');
  assert.equal(marketIntel.current_state, 'researching');
  assert.equal(marketIntel.effective_severity, 'yellow');
  const growthRevenue = overview.body.agents.find((agent) => agent.agent_id === 'growth-revenue');
  assert.equal(growthRevenue.current_state, 'blocked');
  assert.equal(growthRevenue.effective_severity, 'orange');
});

test('CORS headers are correctly set for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const { response } = await requestJson(`${baseUrl}/health`, {
    headers: {
      Origin: allowedOrigin
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('OPTIONS preflight requests are handled for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const response = await fetch(`${baseUrl}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Headers': 'Content-Type',
      'Access-Control-Request-Method': 'GET'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('OPTIONS preflight rejects non-GET methods even for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const response = await fetch(`${baseUrl}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Headers': 'Content-Type',
      'Access-Control-Request-Method': 'POST'
    }
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('CORS headers are not set for disallowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const disallowedOrigin = 'http://malicious.com';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const { response } = await requestJson(`${baseUrl}/health`, {
    headers: {
      Origin: disallowedOrigin
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
