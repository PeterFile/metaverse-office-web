import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test';

import { resolveViewportEdgeDragDelta } from '../scripts/viewport-reachability';

const evidenceCoverage = {
  evidence_ref_count: 1,
  covered_agent_count: 1,
  low_confidence_agent_ids: ['growth-revenue'],
  source_kind_buckets: {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 0
  },
  agent_items: [
    {
      agent_id: 'growth-revenue',
      evidence_ref_count: 1,
      source_kinds: ['workspace_file'],
      latest_evidence_at: '2026-03-10T23:57:00.000Z',
      confidence_level: 'medium'
    }
  ]
};

const sourceHealth = {
  collected_at: '2026-03-16T09:01:00.000Z',
  actor_id: 'team-lead',
  summary: {
    agent_count: 1,
    source_kind_buckets: {
      workspace_root: { observed: 0, degraded: 0, missing: 0, error: 0 },
      workspace_files: { observed: 0, degraded: 1, missing: 0, error: 0 },
      tmux_session: { observed: 1, degraded: 0, missing: 0, error: 0 },
      hermes_profile: { observed: 0, degraded: 0, missing: 1, error: 0 },
      hermes_session: { observed: 0, degraded: 1, missing: 0, error: 0 }
    },
    status_buckets: { observed: 1, degraded: 2, missing: 1, error: 0 }
  },
  agent_items: [
    {
      agent_id: 'app-engineering',
      workspace_root: '/tmp/app-engineering',
      session_ref: '5-web3-app-engineering',
      source_health: {
        workspace_files: {
          status: 'degraded',
          expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
          observed_count: 1, missing_count: 2, error_count: 0,
          last_observed_at: '2026-03-16T08:58:30.000Z',
          degraded_reasons: ['missing workspace files: inbox.md, todo.md']
        },
        tmux_session: {
          status: 'observed',
          expected_session_ref: '5-web3-app-engineering',
          observed_count: 1, last_observed_at: '2026-03-16T08:58:32.000Z',
          degraded_reasons: []
        },
        hermes_profile: {
          status: 'missing',
          profile_id: 'profile-app-engineering',
          evidence_ref: 'hermes://profile/profile-app-engineering',
          last_observed_at: null, degraded_reasons: ['Hermes profile missing']
        },
        hermes_session: {
          status: 'degraded',
          expected_session_ref: '5-web3-app-engineering',
          evidence_ref: 'hermes://session/5-web3-app-engineering',
          last_observed_at: '2026-03-16T08:58:35.000Z',
          degraded_reasons: ['Hermes session stale']
        }
      },
      evidence_ref_count: 3,
      evidence_refs: ['/tmp/launch-note.md', 'hermes://profile/profile-app-engineering', 'hermes://session/5-web3-app-engineering'],
      latest_evidence_at: '2026-03-16T08:58:40.000Z'
    }
  ],
  runtime_source_evidence: { unmapped_tmux_sessions: [] }
};

const collectorSnapshotSummary = {
  has_snapshot: true,
  collected_at: '2026-03-16T09:01:00.000Z',
  agent_count: 1,
  heartbeat_count: 1,
  tmux_observed_count: 1,
  workspace_observed_count: 1,
  reboot_recommended_count: 0,
  evidence_ref_count: 1,
  covered_agent_count: 1,
  low_confidence_agent_count: 1,
  source_kind_buckets: {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 0,
    hermes_profile: 0,
    hermes_session: 0,
    task_evidence: 0
  },
  source_health_buckets: {
    source_kind_buckets: sourceHealth.summary.source_kind_buckets,
    status_buckets: sourceHealth.summary.status_buckets
  },
  runtime_source_evidence: {
    unmapped_tmux_session_count: 0,
    unmapped_hermes_source_count: 0,
    unmapped_task_evidence_count: 0,
    latest_observed_at: '2026-03-16T08:58:40.000Z'
  }
};

const runtimeSourceGaps = {
  items: [
    {
      observed_at: '2026-03-16T08:58:30.000Z',
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['workspace file degraded'],
      unmapped: false
    },
    {
      observed_at: null,
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'hermes_profile',
      evidence_role: 'runtime_presence',
      source_status: 'missing',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['Hermes profile missing'],
      unmapped: false
    },
    {
      observed_at: '2026-03-16T08:58:35.000Z',
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'hermes_session',
      evidence_role: 'runtime_presence',
      source_status: 'degraded',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['Hermes session degraded'],
      unmapped: false
    }
  ]
};

const runtimeSourceGapsSummary = {
  total_count: 3,
  returned_limit: 3,
  mapped_count: 3,
  unmapped_count: 0,
  output_candidate_buckets: { true: 0, false: 3 },
  source_kind_buckets: {
    workspace_file: 1,
    hermes_profile: 1,
    hermes_session: 1
  },
  evidence_role_buckets: { agent_output: 1, runtime_presence: 2 },
  source_status_buckets: { degraded: 2, missing: 1 },
  collector_snapshot_id_buckets: {
    'collector-snapshot:2026-03-16T09:01:00.000Z': 3
  }
};

const runtimeSourceGapLifecycle = {
  total_count: 1,
  total_groups: 1,
  returned_limit: 3,
  groups: [
    {
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      current_status: 'degraded',
      lifecycle_state: 'opened',
      first_observed_at: '2026-03-16T08:58:30.000Z',
      last_observed_at: '2026-03-16T08:58:30.000Z',
      first_collected_at: '2026-03-16T09:01:00.000Z',
      last_collected_at: '2026-03-16T09:01:00.000Z',
      record_count: 1
    }
  ]
};

const evidenceSourceMatrix = {
  item: {
    agent_count: 2,
    returned_limit: 200,
    total_count: 11,
    mapped_count: 9,
    unmapped_count: 2,
    agents: [
      {
        agent_id: 'app-engineering',
        sources: [
          {
            source_kind: 'workspace_file',
            evidence_count: 4,
            source_status_buckets: { observed: 4 },
            evidence_role_buckets: { agent_output: 3, agent_plan: 1 },
            output_candidate_buckets: { true: 3, false: 1 },
            latest_observed_at: '2026-03-16T08:59:10.000Z',
            latest_collected_at: '2026-03-16T09:01:00.000Z'
          },
          {
            source_kind: 'tmux_observation',
            evidence_count: 3,
            source_status_buckets: { degraded: 2, observed: 1 },
            evidence_role_buckets: { runtime_activity: 3 },
            output_candidate_buckets: { true: 0, false: 3 },
            latest_observed_at: '2026-03-16T08:58:30.000Z',
            latest_collected_at: '2026-03-16T09:01:00.000Z'
          },
          {
            source_kind: '/tmp/app/secret-token.md',
            evidence_count: 2,
            source_status_buckets: { 'tmux://raw-session': 2 },
            evidence_role_buckets: { webhook: 2 },
            output_candidate_buckets: { true: 0, false: 2 },
            latest_observed_at: '2026-03-16T08:57:30.000Z',
            latest_collected_at: '2026-03-16T09:01:00.000Z'
          }
        ]
      }
    ],
    unmapped_evidence_summary: {
      total_count: 2,
      sources: [
        {
          source_kind: 'hermes_profile',
          evidence_count: 2,
          source_status_buckets: { observed: 2 },
          evidence_role_buckets: { runtime_unmapped: 2 },
          output_candidate_buckets: { true: 0, false: 2 },
          latest_observed_at: '2026-03-16T08:56:00.000Z',
          latest_collected_at: '2026-03-16T09:01:00.000Z'
        }
      ]
    }
  }
};

const runtimeSourceGapsWithUnmappedWorldPin = {
  items: [
    runtimeSourceGaps.items[0],
    {
      observed_at: '2026-03-16T08:58:36.000Z',
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: null,
      source_kind: 'tmux_session',
      evidence_role: 'runtime_unmapped',
      source_status: 'observed',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['unmapped runtime marker'],
      unmapped: true
    }
  ]
};

const runtimeSourceGapsWithUnmappedWorldPinSummary = {
  total_count: 2,
  returned_limit: 2,
  mapped_count: 1,
  unmapped_count: 1,
  output_candidate_buckets: { true: 0, false: 2 },
  source_kind_buckets: { workspace_file: 1, tmux_session: 1 },
  evidence_role_buckets: { agent_output: 1, runtime_unmapped: 1 },
  source_status_buckets: { degraded: 1, observed: 1 },
  collector_snapshot_id_buckets: {
    'collector-snapshot:2026-03-16T09:01:00.000Z': 2
  }
};

const snapshotCorrelationId = 'collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z';
const replayEvidenceId =
  'ev_collector-snapshot_2026-03-10T23_59_40_000Z_app-engineering_workspace_file__tmp_revenue-handoff_md_1';
const boundedReplayEvidenceId = `${replayEvidenceId.slice(0, 69)}...`;
const replayEvidenceRecordGets = [
  'GET /evidence-records?agent_id=app-engineering&newest_first=true&limit=12',
  `GET /evidence-records/${replayEvidenceId}`,
  `GET /evidence-records/${replayEvidenceId}/provenance-bundle`
];
const replayEvidenceRefRollupGet =
  'GET /evidence-records/ref-rollup?agent_id=app-engineering&newest_first=true&limit=12';
const replayEvidenceRefRollupFixture = {
  item: {
    total_count: 8,
    total_groups: 2,
    returned_limit: 12,
    groups: [
      {
        evidence_ref: null,
        evidence_ref_key: 'ref_group_001',
        evidence_ref_label: 'workspace_file degraded evidence',
        record_count: 7,
        mapped_count: 5,
        unmapped_count: 2,
        agent_id_buckets: { 'app-engineering': 7 },
        source_kind_buckets: {
          workspace_file: 5,
          tmux_observation: 2,
          '/tmp/secret-token.md': 99,
          'control-plane': 99
        },
        source_status_buckets: { observed: 5, missing: 2, dispatch: 99 }
      },
      {
        evidence_ref: null,
        evidence_ref_key: '/tmp/private-token',
        evidence_ref_label: '/tmp/output.md token=secret webhook tmux://raw hermes://profile metadata dispatch',
        record_count: 1,
        mapped_count: 0,
        unmapped_count: 1,
        agent_id_buckets: { 'app-engineering': 1 },
        source_kind_buckets: { workspace_root: 1, 'tmux://raw': 1 },
        source_status_buckets: { error: 1, metadata: 99 }
      }
    ]
  }
};
const replaySourceContextGet = `GET /evidence-records/${replayEvidenceId}/source-context`;
const replaySourceContextFixture = {
  item: {
    evidence_id: 'redacted-source-context-id',
    context_summary: 'Redacted context for the inspected evidence record.',
    context_lines: [
      {
        label: 'handoff summary',
        text: 'Revenue launch handoff is ready for replay.',
        line_number: 1
      }
    ],
    redacted: true
  }
};
const replaySourceContextUiFixture = {
  item: {
    evidence_id: replayEvidenceId,
    source_summary: {
      kind: 'workspace_file',
      status: 'observed',
      role: 'agent_output',
      output_candidate: true,
      mapped: true,
      time: {
        observed_at: '2026-03-16T08:58:00.000Z',
        collected_at: '2026-03-16T08:59:00.000Z'
      }
    },
    record: {
      observed_at: '2026-03-16T08:58:00.000Z',
      collected_at: '2026-03-16T08:59:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'observed',
      output_candidate: true,
      unmapped: false
    },
    source_health: {
      collected_at: '2026-03-16T08:59:00.000Z',
      summary: {
        agent_count: 1,
        source_kind_buckets: {
          workspace_files: { observed: 1, degraded: 0, missing: 0, error: 0 }
        },
        status_buckets: { observed: 1, degraded: 0, missing: 0, error: 0 }
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          source_health: {
            workspace_files: {
              status: 'observed',
              observed_count: 1,
              missing_count: 0,
              error_count: 0,
              last_observed_at: '2026-03-16T08:58:00.000Z'
            }
          },
          evidence_count: 1,
          latest_evidence_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    },
    source_gaps: {
      summary: {
        total_count: 1,
        returned_limit: 1,
        mapped_count: 1,
        unmapped_count: 0,
        output_candidate_buckets: { true: 1, false: 0 },
        source_kind_buckets: { workspace_file: 1 },
        evidence_role_buckets: { agent_output: 1 },
        source_status_buckets: { observed: 1 },
        first_observed_at: '2026-03-16T08:58:00.000Z',
        last_observed_at: '2026-03-16T08:58:00.000Z',
        first_collected_at: '2026-03-16T08:59:00.000Z',
        last_collected_at: '2026-03-16T08:59:00.000Z'
      },
      items: [
        {
          observed_at: '2026-03-16T08:58:00.000Z',
          collected_at: '2026-03-16T08:59:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'observed',
          output_candidate: true,
          unmapped: false
        }
      ]
    }
  }
};
const replayByEvidenceIdGet =
  `GET /accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}&agent_id=app-engineering`;
const replayWindowByEvidenceIdGet = `GET /evidence-records/${replayEvidenceId}/replay-window?before=2&after=2`;
const checkpointLogByEvidenceIdGet =
  `GET /accountability/replay/checkpoint-log?limit=3&evidence_id=${replayEvidenceId}`;
const evidenceSpineSummaryGet = 'GET /agents/evidence-spine/summary?newest_first=true&limit=200';
const evidenceSourceMatrixGet = 'GET /agents/evidence-spine/source-matrix?newest_first=true&limit=200';
const sourceGapLifecycleMappedGet =
  'GET /runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=workspace_file&source_status=degraded&mapped=true&newest_first=true&limit=3';
const sourceGapLifecycleUnmappedGet =
  'GET /runtime/source-gaps/lifecycle?source_kind=workspace_file&mapped=false&newest_first=true&limit=3';
const sourceGapLifecycleHermesMappedGet =
  'GET /runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=hermes_session&source_status=degraded&mapped=true&newest_first=true&limit=3';
const sourceGapLifecycleHermesUnmappedGet =
  'GET /runtime/source-gaps/lifecycle?source_kind=hermes_session&mapped=false&newest_first=true&limit=3';
const expectedApiGets = new Set([
  'GET /office/overview',
  'GET /incidents?limit=200&window=8760h',
  'GET /collectors/controller-snapshot',
  'GET /collectors/controller-snapshot/summary',
  'GET /collectors/controller-snapshot/evidence-coverage',
  'GET /collectors/controller-snapshot/source-health?limit=7',
  'GET /runtime/source-gaps?newest_first=true&limit=3',
  'GET /runtime/source-gaps/summary?newest_first=true&limit=3',
  sourceGapLifecycleMappedGet,
  sourceGapLifecycleUnmappedGet,
  sourceGapLifecycleHermesMappedGet,
  sourceGapLifecycleHermesUnmappedGet,
  evidenceSpineSummaryGet,
  evidenceSourceMatrixGet,
  'GET /agents/app-engineering/workflow?limit=10&window=60m',
  'GET /office/operations?agent_id=app-engineering',
  'GET /timeline?limit=10&window=60m&agent_id=app-engineering',
  `GET /timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=${snapshotCorrelationId}`,
  'GET /peer-watch/alerts?target_agent_id=app-engineering&limit=4',
  `GET /peer-watch/alerts?target_agent_id=app-engineering&correlation_id=${snapshotCorrelationId}&limit=4`,
  'GET /memory/artifacts?limit=4&window=60m&agent_id=app-engineering',
  `GET /memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=${snapshotCorrelationId}`,
  `GET /correlations/${snapshotCorrelationId}?limit=10&window=60m`
]);

const visibleProofRawRefPattern =
  /\/(?:tmp|Users|Volumes|private|var|home|workspace|mnt)\/|[A-Za-z]:\\|tmux:\/\/|hermes:\/\/|\b\d+-web3-[a-z0-9-]+\b|profile-[a-z0-9-]+|session\/[a-z0-9-]+|session:\/\/|workspace_(?:root|files?)|tmux_session|hermes_(?:profile|session)|profile_id|session_ref|evidence_refs?|source_health|collector_snapshot_id|correlation_id|source_kind|source_status|evidence_role|output_candidate|unmapped_tmux_sessions|webhook|access[_-]?token|secret|payload|metadata|degraded_reasons|missing workspace files|Hermes session stale|control-plane|dispatch|route|writeback|mutate|claim|complete|assign/i;
const visibleProofForbiddenSamples = [
  '/tmp/app-engineering',
  '5-web3-app-engineering',
  'hermes://session/5-web3-app-engineering',
  'profile_id',
  'session_ref',
  'evidence_refs',
  'source_kind',
  'source_status',
  'workspace_root',
  'tmux_session',
  'hermes_profile',
  'hermes_session',
  'collector_snapshot_id',
  'correlation_id',
  'degraded_reasons',
  'payload',
  'metadata',
  'claim',
  'complete'
];

function apiRequestKey(request: Pick<Request, 'method' | 'url'>) {
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

function isExactSourceContextReadGet(request: Pick<Request, 'method' | 'url'>, evidenceId = replayEvidenceId) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET' &&
    url.pathname === `/evidence-records/${evidenceId}/source-context` &&
    url.search === ''
  );
}

function isAllowedExactApiReadGet(request: Pick<Request, 'method' | 'url'>, allowedApiGets: Set<string>) {
  return request.method() === 'GET' && allowedApiGets.has(apiRequestKey(request));
}

function isApiPath(pathname: string) {
  return [
    '/control-plane',
    '/dispatch',
    '/office',
    '/incidents',
    '/collectors',
    '/agents',
    '/tasks',
    '/claims',
    '/kanban',
    '/peer-watch',
    '/memory',
    '/runtime',
    '/timeline',
    '/correlations',
    '/evidence-records',
    '/accountability'
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function makeApiRequest(method: string, pathAndSearch: string): Pick<Request, 'method' | 'url'> {
  return {
    method: () => method,
    url: () => `http://live-evidence-guard.test${pathAndSearch}`
  };
}

async function readRect(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  });
}

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
}

type ViewportState = NonNullable<Awaited<ReturnType<typeof readViewportState>>>;

function resolveViewportRightAllowance(state: ViewportState) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  return (state.clampPadding?.right ?? 0) / scale;
}

function resolveViewportTargetTop(state: ViewportState) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;
  return topAllowance === 0 ? 0 : -topAllowance;
}

async function expectViewportAtRightEdge(page: Page, label: string) {
  await expect
    .poll(async () => {
      const state = await readViewportState(page);
      if (!state) {
        return false;
      }

      const rightAllowance = resolveViewportRightAllowance(state);
      return (
        state.left >= -0.5 &&
        state.right <= state.worldWidth + rightAllowance + 0.5 &&
        state.right >= state.worldWidth + rightAllowance - 0.5
      );
    }, `${label} should settle on the right world edge`)
    .toBe(true);

  const state = await readViewportState(page);
  expect(state).not.toBeNull();
  return state!;
}

async function expectViewportAtTopLeftEdge(page: Page, label: string) {
  await expect
    .poll(async () => {
      const state = await readViewportState(page);
      if (!state) {
        return false;
      }

      const targetTop = resolveViewportTargetTop(state);
      return (
        state.left >= -0.5 &&
        state.left <= 0.5 &&
        state.top <= targetTop + 0.5
      );
    }, `${label} should settle on the top-left world edge`)
    .toBe(true);

  const state = await readViewportState(page);
  expect(state).not.toBeNull();
  return state!;
}

async function dragViewportFromDefaultWorldLane(page: Page, deltaX: number, deltaY: number) {
  const worldRect = await readRect(page.locator('.aitown-world__host'));
  const start = {
    x: worldRect.left + worldRect.width * 0.425,
    y: worldRect.top + worldRect.height * 0.5
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 16 });
  await page.mouse.up();
}

async function moveViewportCenter(page: Page, point: { x: number; y: number }) {
  await page.evaluate(({ x, y }) => window.__AITOWN_VIEWPORT__?.moveCenter(x, y), point);
}

async function clickWorldPoint(page: Page, point: { x: number; y: number }) {
  const [state, hostRect] = await Promise.all([
    readViewportState(page),
    readRect(page.locator('.aitown-world__host'))
  ]);
  expect(state, 'world viewport inspector should be available').not.toBeNull();

  const x =
    hostRect.left +
    ((point.x - state!.left) / Math.max(state!.right - state!.left, Number.EPSILON)) * hostRect.width;
  const y =
    hostRect.top +
    ((point.y - state!.top) / Math.max(state!.bottom - state!.top, Number.EPSILON)) * hostRect.height;
  await page.mouse.click(x, y);
}

async function installLiveEvidenceFixtures(
  page: Page,
  sourceGaps: { items: unknown[] } = runtimeSourceGaps,
  sourceGapsSummary: Record<string, unknown> = runtimeSourceGapsSummary
) {
  await routeExpectedApiGet(page, 'GET /collectors/controller-snapshot/evidence-coverage', async (route) => {
    await route.fulfill({ json: { item: evidenceCoverage } });
  });

  await routeExpectedApiGet(page, 'GET /collectors/controller-snapshot/summary', async (route) => {
    await route.fulfill({ json: { item: collectorSnapshotSummary } });
  });

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: sourceGaps });
  });

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps/summary?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: { item: sourceGapsSummary } });
  });

  await routeExpectedApiGet(page, sourceGapLifecycleMappedGet, async (route) => {
    await route.fulfill({ json: { item: runtimeSourceGapLifecycle } });
  });

  await routeExpectedApiGet(page, sourceGapLifecycleUnmappedGet, async (route) => {
    await route.fulfill({ json: { item: { total_count: 0, total_groups: 0, returned_limit: 3, groups: [] } } });
  });

  await routeExpectedApiGet(page, sourceGapLifecycleHermesMappedGet, async (route) => {
    await route.fulfill({ json: { item: { total_count: 0, total_groups: 0, returned_limit: 3, groups: [] } } });
  });

  await routeExpectedApiGet(page, sourceGapLifecycleHermesUnmappedGet, async (route) => {
    await route.fulfill({ json: { item: { total_count: 0, total_groups: 0, returned_limit: 3, groups: [] } } });
  });

  await routeExpectedApiGet(page, evidenceSourceMatrixGet, async (route) => {
    await route.fulfill({ json: evidenceSourceMatrix });
  });

  await routeExpectedApiGet(page, replayEvidenceRefRollupGet, async (route) => {
    await route.fulfill({ json: replayEvidenceRefRollupFixture });
  });

  await routeExpectedApiGet(page, 'GET /collectors/controller-snapshot/source-health?limit=7', async (route) => {
    await route.fulfill({ json: { item: sourceHealth } });
  });

  await routeExpectedApiGet(page, 'GET /collectors/controller-snapshot', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const sourceHealthByAgentId = new Map(sourceHealth.agent_items.map((item) => [item.agent_id, item] as const));

    await route.fulfill({
      response,
      json: {
        item: {
          ...payload.item,
          evidence_coverage: evidenceCoverage,
          items: payload.item.items.map((item: { agent_id: string }) => {
            const sourceHealthItem = sourceHealthByAgentId.get(item.agent_id);
            return sourceHealthItem
              ? {
                  ...item,
                  source_health: sourceHealthItem.source_health,
                  evidence_ref_count: sourceHealthItem.evidence_ref_count,
                  evidence_refs: sourceHealthItem.evidence_refs,
                  latest_evidence_at: sourceHealthItem.latest_evidence_at
                }
              : item;
          })
        }
      }
    });
  });
}

async function routeExpectedApiGet(page: Page, expectedKey: string, handler: (route: Route) => Promise<void>) {
  const expectedPathAndSearch = expectedKey.slice('GET '.length);

  await page.route(
    (url) => `${url.pathname}${url.search}` === expectedPathAndSearch,
    async (route) => {
      if (apiRequestKey(route.request()) !== expectedKey) {
        await route.continue();
        return;
      }

      await handler(route);
    }
  );
}

async function routeExpectedSourceContextReadGet(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route(
    (url) => url.pathname === `/evidence-records/${replayEvidenceId}/source-context` && url.search === '',
    async (route) => {
      if (!isExactSourceContextReadGet(route.request())) {
        await route.continue();
        return;
      }

      await handler(route);
    }
  );
}

test.describe('operator shell live evidence journey smoke', () => {
  test('@journey @evidence-live keeps read guards method-aware and exact for evidence proof surfaces', () => {
    const allowedApiGets = new Set([
      ...expectedApiGets,
      ...replayEvidenceRecordGets,
      replayEvidenceRefRollupGet,
      replaySourceContextGet,
      checkpointLogByEvidenceIdGet,
      replayByEvidenceIdGet
    ]);
    const guardedReadPaths = [
      '/agents/evidence-spine/summary?newest_first=true&limit=200',
      '/agents/evidence-spine/source-matrix?newest_first=true&limit=200',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=workspace_file&source_status=degraded&mapped=true&newest_first=true&limit=3',
      '/runtime/source-gaps/lifecycle?source_kind=workspace_file&mapped=false&newest_first=true&limit=3',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=hermes_session&source_status=degraded&mapped=true&newest_first=true&limit=3',
      '/runtime/source-gaps/lifecycle?source_kind=hermes_session&mapped=false&newest_first=true&limit=3',
      '/evidence-records?agent_id=app-engineering&newest_first=true&limit=12',
      '/evidence-records/ref-rollup?agent_id=app-engineering&newest_first=true&limit=12',
      `/evidence-records/${replayEvidenceId}`,
      `/evidence-records/${replayEvidenceId}/provenance-bundle`,
      `/evidence-records/${replayEvidenceId}/source-context`,
      `/accountability/replay/checkpoint-log?limit=3&evidence_id=${replayEvidenceId}`,
      `/accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}&agent_id=app-engineering`
    ];
    const rejectedReadPaths = [
      '/agents',
      '/agents/evidence-spine',
      '/agents/evidence-spine/summary',
      '/agents/evidence-spine/summary?newest_first=true&limit=200&raw=true',
      '/agents/evidence-spine/source-matrix',
      '/agents/evidence-spine/source-matrix?limit=200&newest_first=true',
      '/agents/evidence-spine/source-matrix?newest_first=true&limit=200&raw=true',
      '/runtime/source-gaps/lifecycle?newest_first=true&limit=3',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&newest_first=true&limit=3',
      '/runtime/source-gaps/lifecycle?limit=3&newest_first=true&agent_id=app-engineering',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&newest_first=true&limit=3&raw=true',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=workspace_file&source_status=degraded&mapped=true&limit=3&newest_first=true',
      '/runtime/source-gaps/lifecycle?source_kind=workspace_file&mapped=false&limit=3&newest_first=true',
      '/runtime/source-gaps/lifecycle?agent_id=app-engineering&source_kind=hermes_session&source_status=degraded&mapped=true&limit=3&newest_first=true',
      '/runtime/source-gaps/lifecycle?source_kind=hermes_session&mapped=false&limit=3&newest_first=true',
      '/agents/app-engineering/evidence-spine?newest_first=true&limit=200',
      '/evidence-records',
      '/evidence-records?agent_id=app-engineering&limit=12&newest_first=true',
      '/evidence-records?agent_id=app-engineering&newest_first=true&limit=12&raw=true',
      '/evidence-records/ref-rollup',
      '/evidence-records/ref-rollup?agent_id=app-engineering&limit=12&newest_first=true',
      '/evidence-records/ref-rollup?agent_id=app-engineering&newest_first=true&limit=12&raw=true',
      '/evidence-records/ref-rollup?newest_first=true&limit=12',
      `/evidence-records/${replayEvidenceId}?raw=true`,
      `/evidence-records/${replayEvidenceId}/provenance-bundle?metadata=true`,
      `/evidence-records/${replayEvidenceId}/source-context?raw=true`,
      `/evidence-records/${replayEvidenceId}/source-context/extra`,
      `/accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}`,
      `/accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}&agent_id=app-engineering&dispatch=true`,
      `/accountability/replay/checkpoint-log?evidence_id=${replayEvidenceId}&limit=3`,
      `/accountability/replay/checkpoint-log?limit=3&evidence_id=${replayEvidenceId}&payload=true`,
      '/control-plane',
      '/dispatch',
      '/tasks',
      '/claims',
      '/kanban'
    ];

    for (const pathAndSearch of guardedReadPaths) {
      expect(isAllowedExactApiReadGet(makeApiRequest('GET', pathAndSearch), allowedApiGets), pathAndSearch).toBe(
        true
      );
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(
          isAllowedExactApiReadGet(makeApiRequest(method, pathAndSearch), allowedApiGets),
          `${method} ${pathAndSearch}`
        ).toBe(false);
      }
    }

    for (const pathAndSearch of rejectedReadPaths) {
      expect(isAllowedExactApiReadGet(makeApiRequest('GET', pathAndSearch), allowedApiGets), pathAndSearch).toBe(
        false
      );
    }
  });

  test('@journey @evidence-live prepares exact source-context read guard for the L04 UI path', async ({ page }) => {
    const apiRequestViolations: string[] = [];
    const sourceContextRequests: string[] = [];
    const allowedApiGets = new Set([replaySourceContextGet]);
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (isExactSourceContextReadGet(request)) {
        sourceContextRequests.push(key);
      }
      if (!isAllowedExactApiReadGet(request, allowedApiGets)) {
        apiRequestViolations.push(key);
      }
    };

    expect(
      isExactSourceContextReadGet(makeApiRequest('GET', `/evidence-records/${replayEvidenceId}/source-context`))
    ).toBe(true);
    expect(
      isExactSourceContextReadGet(makeApiRequest('POST', `/evidence-records/${replayEvidenceId}/source-context`))
    ).toBe(false);
    expect(
      isExactSourceContextReadGet(makeApiRequest('GET', `/evidence-records/${replayEvidenceId}/source-context?raw=true`))
    ).toBe(false);
    expect(isExactSourceContextReadGet(makeApiRequest('GET', `/evidence-records/${replayEvidenceId}`))).toBe(false);
    expect(
      isExactSourceContextReadGet(makeApiRequest('GET', `/evidence-records/${replayEvidenceId}/source-context/extra`))
    ).toBe(false);
    expect(
      isExactSourceContextReadGet(makeApiRequest('GET', `/evidence-records/${replayEvidenceId}/provenance-bundle`))
    ).toBe(false);
    expect(JSON.stringify(replaySourceContextFixture)).not.toMatch(visibleProofRawRefPattern);

    await routeExpectedSourceContextReadGet(page, async (route) => {
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: replaySourceContextFixture
      });
    });
    page.on('request', handleRequest);

    try {
      await page.goto('data:text/html,<html></html>');
      const response = await page.evaluate(async (url) => {
        const result = await fetch(url, { method: 'GET' });
        return {
          ok: result.ok,
          payload: await result.json()
        };
      }, `http://source-context.test/evidence-records/${replayEvidenceId}/source-context`);

      expect(response).toEqual({ ok: true, payload: replaySourceContextFixture });
      expect(sourceContextRequests).toEqual([replaySourceContextGet]);
      expect(apiRequestViolations).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('@journey @evidence-live keeps selected-agent source peeks compact and read-only', async ({
    page
  }) => {
    const apiRequestViolations: string[] = [];
    const eagerDrilldownRequests: string[] = [];
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (!isAllowedExactApiReadGet(request, expectedApiGets)) {
        apiRequestViolations.push(key);
      }
      if (url.pathname.startsWith('/evidence-records') || url.pathname.startsWith('/accountability/')) {
        eagerDrilldownRequests.push(key);
      }
    };

    await installLiveEvidenceFixtures(page);
    page.on('request', handleRequest);

    try {
      await page.goto('/');
      await expect(page.locator('.aitown-world__host canvas')).toBeVisible();

      await page
        .getByRole('navigation', { name: 'Agent roster' })
        .getByRole('button', { name: 'Select and locate App Engineering Agent' })
        .click();

      const hub = page.getByRole('dialog', { name: 'Hub' });
      const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
      const sourceHealthPeek = page.getByRole('region', { name: 'Selected agent source-health inspect peek' });
      const sourceMatrixPeek = page.getByRole('region', { name: 'Selected agent source matrix peek' });

      await expect(hub).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
      await expect(inspectPeek).toBeVisible();
      await expect(sourceHealthPeek).toBeVisible();
      await expect(sourceMatrixPeek).toBeVisible();
      await expect(sourceHealthPeek).toContainText('Evidence only');
      await expect(sourceHealthPeek).toContainText('Hermes profile · missing');
      await expect(sourceHealthPeek).toContainText('Mapped source');
      await expect(sourceHealthPeek).toContainText('Diff · No comparison');
      await expect(sourceHealthPeek).not.toContainText('Reason · Redacted');
      await expect(sourceHealthPeek).not.toContainText('Configured · Yes');
      await expect(
        sourceHealthPeek,
        'selected-agent source-health peek should not expose raw refs, sessions, profiles, payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      await expect(sourceMatrixPeek).toContainText('Source matrix');
      await expect(sourceMatrixPeek).toContainText('Workspace file · Observed');
      await expect(sourceMatrixPeek).toContainText('Agent output · Output candidate · 4');
      await expect(sourceMatrixPeek).toContainText('Tmux observation · Degraded');
      await expect(sourceMatrixPeek).toContainText('Runtime activity · Supporting evidence · 3');
      await expect(sourceMatrixPeek).toContainText('Unknown · Unknown');
      await expect(sourceMatrixPeek).toContainText('Unmapped evidence · 2 separate');
      await expect(
        sourceMatrixPeek,
        'selected-agent source matrix peek should not expose raw refs, enum keys, sessions, payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      expect(eagerDrilldownRequests, 'source peeks should not prefetch evidence or replay records').toEqual([]);

      const peekRect = await readRect(inspectPeek);
      expect(peekRect.width, 'source-health inspect peek should stay compact').toBeLessThanOrEqual(420);
      expect(peekRect.height, 'source-health inspect peek should stay compact').toBeLessThanOrEqual(300);

      await sourceHealthPeek
        .getByRole('button', {
          name: 'Open source gap supervision for App Engineering Agent hermes profile missing'
        })
        .click();

      await expect(hub).toBeVisible();
      expect(apiRequestViolations).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('@journey @evidence-live keeps live evidence controls from blocking default viewport edge drag', async ({
    page
  }) => {
    await installLiveEvidenceFixtures(page);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const signals = page.getByRole('region', { name: 'Office HUD signals' });
    await signals.locator('summary').click();

    const evidenceFocus = page.getByRole('region', { name: 'Evidence coverage focus' });
    const sourceGapFocus = page.getByRole('region', { name: 'Source gap focus' });
    await expect(evidenceFocus).toBeVisible();
    await expect(sourceGapFocus).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);

    const initial = await readViewportState(page);
    expect(initial).not.toBeNull();

    const worldRect = await readRect(page.locator('.aitown-world__host'));
    const dragStart = {
      x: worldRect.left + worldRect.width * 0.425,
      y: worldRect.top + worldRect.height * 0.5
    };
    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideLiveEvidenceControls: Boolean(
          target?.closest(
            '[aria-label="Office HUD signals"], [aria-label="Evidence coverage focus"], [aria-label="Source gap focus"]'
          )
        ),
        insideButton: Boolean(target?.closest('button')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(hitTarget.insideWorld, `default drag lane should hit the world: ${JSON.stringify(hitTarget)}`).toBe(true);
    expect(
      hitTarget.insideLiveEvidenceControls,
      `Live Evidence controls should not cover the default drag lane: ${JSON.stringify(hitTarget)}`
    ).toBe(false);
    expect(hitTarget.insideButton, `default drag lane should not start on a control: ${JSON.stringify(hitTarget)}`).toBe(
      false
    );

    const rightDrag = resolveViewportEdgeDragDelta(initial!, 'right');
    expect(Math.abs(rightDrag.deltaX), 'default viewport should have right edge pan budget').toBeGreaterThan(40);
    await dragViewportFromDefaultWorldLane(page, rightDrag.deltaX, rightDrag.deltaY);

    const rightEdge = await expectViewportAtRightEdge(page, 'Live Evidence controls-present viewport');
    const topLeftDrag = resolveViewportEdgeDragDelta(rightEdge, 'top-left');
    expect(Math.abs(topLeftDrag.deltaX), 'right edge should allow return to the left edge').toBeGreaterThan(40);
    await dragViewportFromDefaultWorldLane(page, topLeftDrag.deltaX, topLeftDrag.deltaY);

    await expectViewportAtTopLeftEdge(page, 'Live Evidence controls-present viewport');
  });

  test('@journey @evidence-live replays inspected evidence by evidence id only after explicit CTAs', async ({
    page
  }) => {
    const allowedApiGets = new Set([
      ...expectedApiGets,
      ...replayEvidenceRecordGets,
      replayEvidenceRefRollupGet,
      replaySourceContextGet,
      checkpointLogByEvidenceIdGet,
      replayByEvidenceIdGet,
      replayWindowByEvidenceIdGet
    ]);
    const evidenceRecordRequests: string[] = [];
    const evidenceRefRollupRequests: string[] = [];
    const sourceContextRequests: string[] = [];
    const checkpointLogRequests: string[] = [];
    const replayRequests: string[] = [];
    const replayWindowRequests: string[] = [];
    const apiRequestViolations: string[] = [];
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (!isAllowedExactApiReadGet(request, allowedApiGets)) {
        apiRequestViolations.push(key);
      }
      if (url.pathname === '/evidence-records/ref-rollup') {
        evidenceRefRollupRequests.push(key);
      } else if (url.pathname.startsWith('/evidence-records')) {
        evidenceRecordRequests.push(key);
      }
      if (isExactSourceContextReadGet(request)) {
        sourceContextRequests.push(key);
      }
      if (url.pathname === '/accountability/replay/checkpoint-log') {
        checkpointLogRequests.push(key);
      }
      if (url.pathname === '/accountability/replay') {
        replayRequests.push(key);
      }
      if (url.pathname.endsWith('/replay-window')) {
        replayWindowRequests.push(key);
      }
    };

    await installLiveEvidenceFixtures(page);
    await routeExpectedSourceContextReadGet(page, async (route) => {
      await route.fulfill({ json: replaySourceContextUiFixture });
    });
    page.on('request', handleRequest);

    try {
      await page.goto('/');
      await expect(page.locator('.aitown-world__host canvas')).toBeVisible();

      await page
        .getByRole('navigation', { name: 'Agent roster' })
        .getByRole('button', { name: 'Select and locate App Engineering Agent' })
        .click();

      const hub = page.getByRole('dialog', { name: 'Hub' });
      const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
      const ledgerCta = inspectPeek.getByRole('button', { name: 'Open App Engineering Agent Evidence Ledger' });
      await expect(hub).toHaveCount(0);
      await expect(ledgerCta).toBeVisible();
      expect(evidenceRecordRequests, 'selecting an agent should not prefetch evidence records').toEqual([]);
      expect(evidenceRefRollupRequests, 'selecting an agent should not prefetch ref-rollup proof rows').toEqual([]);
      expect(checkpointLogRequests, 'selecting an agent should not prefetch checkpoint proof').toEqual([]);
      expect(replayRequests, 'selecting an agent should not prefetch replay records').toEqual([]);
      expect(replayWindowRequests, 'selecting an agent should not prefetch replay window').toEqual([]);

      await ledgerCta.click();

      const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
      await expect(hub).toBeVisible();
      await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
      await expect.poll(() => evidenceRecordRequests.slice()).toEqual([replayEvidenceRecordGets[0]]);
      await expect.poll(() => evidenceRefRollupRequests.slice()).toEqual([replayEvidenceRefRollupGet]);
      await expect(evidencePanel.getByText('Proof Compass ref groups')).toBeVisible();
      await expect(evidencePanel.getByText('Evidence sources · Workspace file 5, Runtime observation 2')).toBeVisible();
      const proofCompassRefGroups = evidencePanel.locator('li').filter({ hasText: 'Proof Compass ref groups' });
      await expect(proofCompassRefGroups).not.toContainText(
        /\/tmp|\/Users\/cwp|private-token|secret-token|token=secret|webhook|tmux:\/\/raw|hermes:\/\/profile|session:\/\/|profile:\/\/|metadata|control-plane|dispatch/i
      );
      expect(checkpointLogRequests, 'opening Evidence Ledger should not prefetch checkpoint proof').toEqual([]);
      expect(replayRequests, 'opening Evidence Ledger should not prefetch replay records').toEqual([]);
      expect(replayWindowRequests, 'opening Evidence Ledger should not prefetch replay window').toEqual([]);

      await evidencePanel
        .getByRole('button', { name: `Inspect evidence record ${boundedReplayEvidenceId}` })
        .click();

      await expect.poll(() => evidenceRecordRequests.slice()).toEqual(replayEvidenceRecordGets);
      const detailSection = evidencePanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Evidence Record Detail' })
      });
      await expect(
        detailSection.getByRole('button', { name: `Replay this evidence ${boundedReplayEvidenceId}` })
      ).toBeVisible();
      await expect.poll(() => checkpointLogRequests.slice()).toEqual([checkpointLogByEvidenceIdGet]);
      await expect(detailSection).toContainText('Replay anchor · collector-snapshot:2026-03-10T23:59:40.000Z');
      await expect(detailSection).not.toContainText('/accountability/replay');
      await expect(detailSection).not.toContainText('/evidence-records/');
      await expect(detailSection).not.toContainText('/tmp/revenue-handoff.md');
      expect(replayRequests, 'inspecting evidence detail should not prefetch replay records').toEqual([]);
      expect(replayWindowRequests, 'inspecting evidence detail should not prefetch replay window').toEqual([]);
      expect(sourceContextRequests, 'inspecting evidence detail should not prefetch source context').toEqual([]);

      await detailSection
        .getByRole('button', { name: `Inspect source context for evidence ${boundedReplayEvidenceId}` })
        .click();

      await expect.poll(() => sourceContextRequests.slice()).toEqual([replaySourceContextGet]);
      const sourceContextDisclosure = detailSection.getByLabel('Selected evidence source context');
      await expect(sourceContextDisclosure.getByText('Evidence Source Context')).toBeVisible();
      await expect(sourceContextDisclosure).toContainText(
        'Source context · Workspace file · Agent output · Observed · Mapped · Output candidate'
      );
      await expect(sourceContextDisclosure).toContainText('Source gaps · 1 total · 1 mapped · 0 unmapped');
      await expect(sourceContextDisclosure).toContainText(
        'Source health · 1 evidence · Latest 2026-03-16T08:58:00.000Z'
      );
      await expect(
        sourceContextDisclosure,
        'source-context disclosure should not expose raw refs, paths, sessions, payloads, or unsafe metadata'
      ).not.toContainText(visibleProofRawRefPattern);

      await detailSection.getByRole('button', { name: `Replay this evidence ${boundedReplayEvidenceId}` }).click();

      const replayPanel = page.getByRole('tabpanel', { name: 'Replay / Correlation' });
      await expect(replayPanel).toBeVisible();
      await expect(replayPanel.getByRole('heading', { name: 'Replay Bundle' })).toBeVisible();
      await expect.poll(() => replayRequests.slice()).toEqual([replayByEvidenceIdGet]);
      await expect.poll(() => replayWindowRequests.slice()).toEqual([replayWindowByEvidenceIdGet]);
      const replayWindowCard = replayPanel.getByRole('region', { name: 'Selected evidence replay window' });
      await expect(replayWindowCard.getByRole('heading', { name: 'Selected Evidence Replay Window' })).toBeVisible();
      await expect(replayWindowCard).toContainText('Bounds · before 2 · after 2');
      await expect(
        replayWindowCard,
        'replay-window card should not expose raw refs, paths, sessions, payloads, or unsafe metadata'
      ).not.toContainText(visibleProofRawRefPattern);
      expect(apiRequestViolations).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('@journey @evidence-live opens source-gap evidence from live HUD with only exact read GETs', async ({ page }) => {
    const apiRequestViolations: string[] = [];
    for (const forbiddenSample of visibleProofForbiddenSamples) {
      expect(forbiddenSample, `${forbiddenSample} must be covered by the visible proof redaction guard`).toMatch(
        visibleProofRawRefPattern
      );
    }

    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (!isAllowedExactApiReadGet(request, expectedApiGets)) {
        apiRequestViolations.push(key);
      }
    };

    await installLiveEvidenceFixtures(page);
    page.on('request', handleRequest);

    try {
      await page.goto('/');
      await expect(page.locator('.aitown-world__host canvas')).toBeVisible();

      const signals = page.getByRole('region', { name: 'Office HUD signals' });
      await signals.locator('summary').click();

      const evidenceFocus = page.getByRole('region', { name: 'Evidence coverage focus' });
      const sourceGapFocus = page.getByRole('region', { name: 'Source gap focus' });
      const hermesSessionGapChip = sourceGapFocus.getByRole('button', {
        name: 'Open source gap supervision for App Engineering Agent hermes session degraded'
      });

      await expect(signals.locator('summary')).toContainText('Evidence · 6');
      await expect(evidenceFocus.getByText('6 coverage gaps', { exact: true })).toBeVisible();
      await expect(evidenceFocus.getByText('+3 more', { exact: true })).toBeVisible();
      await expect(evidenceFocus.getByRole('button', { name: '+3 more' })).toHaveCount(0);
      await expect(sourceGapFocus.getByText('3 provenance gaps', { exact: true })).toBeVisible();
      await expect(hermesSessionGapChip).toContainText('Hermes session · degraded');
      await expect(
        sourceGapFocus,
        'HUD source-gap focus should summarize evidence without raw refs or runtime payloads'
      ).not.toContainText(visibleProofRawRefPattern);
      await expect(
        hermesSessionGapChip,
        'source-gap chip should not expose raw refs, profile ids, session refs, or degraded reasons'
      ).not.toContainText(visibleProofRawRefPattern);

      await hermesSessionGapChip.click();

      const hub = page.getByRole('dialog', { name: 'Hub' });
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const hermesDrilldown = detailsPanel.locator('#aitown-selected-agent-source-drilldown-hermes');

      await expect(hub).toBeVisible();
      await expect(detailsPanel.getByText('App Engineering Agent · supervision and collector observation.')).toBeVisible();
      const sourceGapContext = detailsPanel.getByRole('region', { name: 'Source gap context' });
      await expect(sourceGapContext).toContainText('Source gap');
      await expect(sourceGapContext).toContainText('App Engineering Agent');
      await expect(sourceGapContext).toContainText('Hermes session · degraded');
      await expect(
        sourceGapContext,
        'source-gap context should not expose raw refs, profile ids, session refs, or degraded reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      await expect(hermesDrilldown).toHaveAttribute('data-source-gap-focus', 'true');
      await expect(hermesDrilldown).toContainText('Hermes session status · degraded');
      await expect(
        hermesDrilldown,
        'source-gap drilldown should not expose raw refs, profile ids, session refs, or degraded reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      expect(apiRequestViolations).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('@journey @evidence-live source-gap world pin selects mapped agent and keeps unmapped marker passive', async ({
    page
  }) => {
    const allowedApiGets = new Set([...expectedApiGets, replayEvidenceRecordGets[0]]);
    const apiRequestViolations: string[] = [];
    const evidenceRecordRequests: string[] = [];
    const replayRequests: string[] = [];
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (!isAllowedExactApiReadGet(request, allowedApiGets)) {
        apiRequestViolations.push(key);
      }
      if (url.pathname.startsWith('/evidence-records')) {
        evidenceRecordRequests.push(key);
      }
      if (url.pathname.startsWith('/accountability/replay')) {
        replayRequests.push(key);
      }
    };

    await installLiveEvidenceFixtures(
      page,
      runtimeSourceGapsWithUnmappedWorldPin,
      runtimeSourceGapsWithUnmappedWorldPinSummary
    );
    page.on('request', handleRequest);

    try {
      await page.goto('/');
      await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
      await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

      const roster = page.getByRole('navigation', { name: 'Agent roster' });
      await roster.getByRole('button', { name: 'Select and locate App Engineering Agent' }).click();
      await expect
        .poll(async () => (await readViewportState(page))?.selectedAgent?.agentId ?? null)
        .toBe('app-engineering');

      const appAgent = (await readViewportState(page))!.selectedAgent!;
      const appSourceGapPin = { x: appAgent.x, y: appAgent.y - 42 };
      const tileDim = appAgent.x / 9.5;
      const unmappedRuntimeMarker = { x: 12.5 * tileDim, y: 28.5 * tileDim };

      await page.getByRole('button', { name: 'Clear Selection' }).click();
      await expect.poll(async () => (await readViewportState(page))?.selectedAgent ?? null).toBeNull();
      await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);

      await moveViewportCenter(page, appSourceGapPin);
      await clickWorldPoint(page, appSourceGapPin);

      await expect
        .poll(async () => (await readViewportState(page))?.selectedAgent?.agentId ?? null)
        .toBe('app-engineering');
      const sourceGapInspectPeek = page.getByRole('region', { name: 'Source gap inspect peek' });
      await expect(sourceGapInspectPeek).toBeVisible();
      await expect(sourceGapInspectPeek).toContainText('Evidence only');
      await expect(sourceGapInspectPeek).toContainText('Workspace files · degraded');
      await expect(sourceGapInspectPeek).toContainText('Mapped source');
      await expect(sourceGapInspectPeek).toContainText('Lifecycle · 1 mapped · 0 unmapped');
      await expect(sourceGapInspectPeek).toContainText('Workspace source · degraded · opened');
      await expect(sourceGapInspectPeek).not.toContainText('Lifecycle · no runtime source-gap snapshot');
      await expect(
        sourceGapInspectPeek,
        'source-gap world pin inspect peek should not expose raw refs, runtime payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);

      await sourceGapInspectPeek.getByRole('button', { name: 'Open source-gap drilldown' }).click();
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
      await expect(evidencePanel).toBeVisible();
      const sourceGapContext = detailsPanel.getByRole('region', { name: 'Source gap context' });
      await expect(sourceGapContext).toContainText('Source gap');
      await expect(sourceGapContext).toContainText('App Engineering Agent');
      await expect(sourceGapContext).toContainText('Workspace files · degraded');
      await expect(
        sourceGapContext,
        'source-gap world pin context should not expose raw refs, runtime payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      const workspaceDrilldown = detailsPanel.locator('#aitown-selected-agent-source-drilldown-workspace');
      await expect(workspaceDrilldown).toHaveAttribute('data-source-gap-focus', 'true');
      await expect(workspaceDrilldown).toContainText('Workspace files status · degraded');
      await expect(
        workspaceDrilldown,
        'source-gap world pin drilldown should not expose raw refs, runtime payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);
      expect(evidenceRecordRequests, 'source-gap world pin drilldown should not prefetch evidence records').toEqual([]);
      expect(replayRequests, 'source-gap world pin drilldown should not prefetch replay records').toEqual([]);

      await page.getByRole('button', { name: 'Close panel' }).click();
      await page.getByRole('button', { name: 'Clear Selection' }).click();
      await expect.poll(async () => (await readViewportState(page))?.selectedAgent ?? null).toBeNull();

      const requestsBeforeUnmappedClick = {
        evidenceRecords: evidenceRecordRequests.length,
        replay: replayRequests.length
      };
      await moveViewportCenter(page, unmappedRuntimeMarker);
      await clickWorldPoint(page, unmappedRuntimeMarker);

      await expect.poll(async () => (await readViewportState(page))?.selectedAgent ?? null).toBeNull();
      await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);
      expect(evidenceRecordRequests).toHaveLength(requestsBeforeUnmappedClick.evidenceRecords);
      expect(replayRequests).toHaveLength(requestsBeforeUnmappedClick.replay);
      expect(apiRequestViolations).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });
});
