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

const snapshotCorrelationId = 'collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z';
const replayEvidenceId =
  'ev_collector-snapshot_2026-03-10T23_59_40_000Z_app-engineering_workspace_file__tmp_revenue-handoff_md_1';
const boundedReplayEvidenceId = `${replayEvidenceId.slice(0, 69)}...`;
const replayEvidenceRecordGets = [
  'GET /evidence-records?agent_id=app-engineering&newest_first=true&limit=12',
  `GET /evidence-records/${replayEvidenceId}`,
  `GET /evidence-records/${replayEvidenceId}/provenance-bundle`
];
const replayByEvidenceIdGet =
  `GET /accountability/replay?limit=10&window=60m&evidence_id=${replayEvidenceId}&agent_id=app-engineering`;
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
      width: rect.width,
      height: rect.height
    };
  });
}

async function installLiveEvidenceFixtures(page: Page) {
  await routeExpectedApiGet(page, 'GET /collectors/controller-snapshot/evidence-coverage', async (route) => {
    await route.fulfill({ json: { item: evidenceCoverage } });
  });

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: runtimeSourceGaps });
  });

  await routeExpectedApiGet(page, 'GET /runtime/source-gaps/summary?newest_first=true&limit=3', async (route) => {
    await route.fulfill({ json: { item: runtimeSourceGapsSummary } });
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

test.describe('operator shell live evidence journey smoke', () => {
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
      replayByEvidenceIdGet
    ]);
    const evidenceRecordRequests: string[] = [];
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
      if (url.pathname.startsWith('/accountability/replay')) {
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
      expect(replayRequests, 'selecting an agent should not prefetch replay records').toEqual([]);

      await ledgerCta.click();

      const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
      await expect(hub).toBeVisible();
      await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
      await expect.poll(() => evidenceRecordRequests.slice()).toEqual([replayEvidenceRecordGets[0]]);
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
});
