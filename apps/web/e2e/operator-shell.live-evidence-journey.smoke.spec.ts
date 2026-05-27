import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test';

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
const replayByEvidenceIdGet =
  `GET /accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}&agent_id=app-engineering`;
const checkpointLogByEvidenceIdGet =
  `GET /accountability/replay/checkpoint-log?limit=3&evidence_id=${replayEvidenceId}`;
const expectedApiGets = new Set([
  'GET /office/overview',
  'GET /incidents?limit=200&window=8760h',
  'GET /collectors/controller-snapshot',
  'GET /collectors/controller-snapshot/evidence-coverage',
  'GET /collectors/controller-snapshot/source-health?limit=7',
  'GET /runtime/source-gaps?newest_first=true&limit=3',
  'GET /runtime/source-gaps/summary?newest_first=true&limit=3',
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

function apiRequestKey(request: Request) {
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

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: sourceGaps });
  });

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps/summary?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: { item: sourceGapsSummary } });
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
  test('@journey @evidence-live prepares exact source-context read guard for the L04 UI path', async ({ page }) => {
    const apiRequestViolations: string[] = [];
    const sourceContextRequests: string[] = [];
    const allowedApiGets = new Set([replaySourceContextGet]);
    const makeRequest = (method: string, pathAndSearch: string): Pick<Request, 'method' | 'url'> => ({
      method: () => method,
      url: () => `http://source-context.test${pathAndSearch}`
    });
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (isExactSourceContextReadGet(request)) {
        sourceContextRequests.push(key);
      }
      if (request.method() !== 'GET' || !allowedApiGets.has(key)) {
        apiRequestViolations.push(key);
      }
    };

    expect(
      isExactSourceContextReadGet(makeRequest('GET', `/evidence-records/${replayEvidenceId}/source-context`))
    ).toBe(true);
    expect(
      isExactSourceContextReadGet(makeRequest('POST', `/evidence-records/${replayEvidenceId}/source-context`))
    ).toBe(false);
    expect(
      isExactSourceContextReadGet(makeRequest('GET', `/evidence-records/${replayEvidenceId}/source-context?raw=true`))
    ).toBe(false);
    expect(isExactSourceContextReadGet(makeRequest('GET', `/evidence-records/${replayEvidenceId}`))).toBe(false);
    expect(
      isExactSourceContextReadGet(makeRequest('GET', `/evidence-records/${replayEvidenceId}/source-context/extra`))
    ).toBe(false);
    expect(
      isExactSourceContextReadGet(makeRequest('GET', `/evidence-records/${replayEvidenceId}/provenance-bundle`))
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

  test('@journey @evidence-live keeps selected-agent source-health inspect peek compact and read-only', async ({
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
      if (request.method() !== 'GET' || !expectedApiGets.has(key)) {
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

      await expect(hub).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
      await expect(inspectPeek).toBeVisible();
      await expect(sourceHealthPeek).toBeVisible();
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
      expect(eagerDrilldownRequests, 'source-health inspect peek should not prefetch evidence or replay records').toEqual(
        []
      );

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

  test('@journey @evidence-live replays inspected evidence by evidence id only after explicit CTAs', async ({
    page
  }) => {
    const allowedApiGets = new Set([
      ...expectedApiGets,
      ...replayEvidenceRecordGets,
      checkpointLogByEvidenceIdGet,
      replayByEvidenceIdGet
    ]);
    const evidenceRecordRequests: string[] = [];
    const checkpointLogRequests: string[] = [];
    const replayRequests: string[] = [];
    const apiRequestViolations: string[] = [];
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (!isApiPath(url.pathname)) {
        return;
      }

      const key = apiRequestKey(request);
      if (request.method() !== 'GET' || !allowedApiGets.has(key)) {
        apiRequestViolations.push(key);
      }
      if (url.pathname.startsWith('/evidence-records')) {
        evidenceRecordRequests.push(key);
      }
      if (url.pathname === '/accountability/replay/checkpoint-log') {
        checkpointLogRequests.push(key);
      }
      if (url.pathname === '/accountability/replay') {
        replayRequests.push(key);
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
      const ledgerCta = inspectPeek.getByRole('button', { name: 'Open App Engineering Agent Evidence Ledger' });
      await expect(hub).toHaveCount(0);
      await expect(ledgerCta).toBeVisible();
      expect(evidenceRecordRequests, 'selecting an agent should not prefetch evidence records').toEqual([]);
      expect(checkpointLogRequests, 'selecting an agent should not prefetch checkpoint proof').toEqual([]);
      expect(replayRequests, 'selecting an agent should not prefetch replay records').toEqual([]);

      await ledgerCta.click();

      const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
      await expect(hub).toBeVisible();
      await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
      await expect.poll(() => evidenceRecordRequests.slice()).toEqual([replayEvidenceRecordGets[0]]);
      expect(checkpointLogRequests, 'opening Evidence Ledger should not prefetch checkpoint proof').toEqual([]);
      expect(replayRequests, 'opening Evidence Ledger should not prefetch replay records').toEqual([]);

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

      await detailSection.getByRole('button', { name: `Replay this evidence ${boundedReplayEvidenceId}` }).click();

      const replayPanel = page.getByRole('tabpanel', { name: 'Replay / Correlation' });
      await expect(replayPanel).toBeVisible();
      await expect(replayPanel.getByRole('heading', { name: 'Replay Bundle' })).toBeVisible();
      await expect.poll(() => replayRequests.slice()).toEqual([replayByEvidenceIdGet]);
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
      if (request.method() !== 'GET' || !expectedApiGets.has(key)) {
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

      await expect(evidenceFocus.getByText('3 coverage gaps', { exact: true })).toBeVisible();
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
      if (request.method() !== 'GET' || !allowedApiGets.has(key)) {
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
      await expect(
        sourceGapInspectPeek,
        'source-gap world pin inspect peek should not expose raw refs, runtime payloads, or reasons'
      ).not.toContainText(visibleProofRawRefPattern);

      await sourceGapInspectPeek.getByRole('button', { name: 'Open Evidence drilldown' }).click();
      const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
      await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
      await expect.poll(() => evidenceRecordRequests.slice()).toEqual([replayEvidenceRecordGets[0]]);
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
