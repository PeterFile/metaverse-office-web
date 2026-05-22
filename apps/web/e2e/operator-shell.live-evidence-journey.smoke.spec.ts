import { expect, test, type Page, type Request } from '@playwright/test';

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
  `GET /timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=${snapshotCorrelationId}`,
  'GET /peer-watch/alerts?target_agent_id=app-engineering&limit=4',
  `GET /peer-watch/alerts?target_agent_id=app-engineering&correlation_id=${snapshotCorrelationId}&limit=4`,
  'GET /memory/artifacts?limit=4&window=60m&agent_id=app-engineering',
  `GET /memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=${snapshotCorrelationId}`,
  `GET /correlations/${snapshotCorrelationId}?limit=10&window=60m`
]);

const visibleProofRawRefPattern =
  /\/(?:tmp|Users|Volumes|private|var|home|workspace|mnt)\/|[A-Za-z]:\\|tmux:\/\/|hermes:\/\/|\b\d+-web3-[a-z0-9-]+\b|profile-[a-z0-9-]+|session\/[a-z0-9-]+|session:\/\/|access[_-]?token|secret|payload|metadata|missing workspace files|Hermes session stale/i;

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
    '/correlations'
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function installLiveEvidenceFixtures(page: Page) {
  await page.route('**/collectors/controller-snapshot/evidence-coverage', async (route) => {
    await route.fulfill({ json: { item: evidenceCoverage } });
  });

  await page.route('**/runtime/source-gaps?*', async (route) => {
    await route.fulfill({ json: runtimeSourceGaps });
  });

  await page.route('**/runtime/source-gaps/summary?*', async (route) => {
    await route.fulfill({ json: { item: runtimeSourceGapsSummary } });
  });

  await page.route('**/collectors/controller-snapshot/source-health**', async (route) => {
    await route.fulfill({ json: { item: sourceHealth } });
  });

  await page.route('**/collectors/controller-snapshot', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== '/collectors/controller-snapshot') {
      await route.continue();
      return;
    }

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

test.describe('operator shell live evidence journey smoke', () => {
  test('@journey @evidence-live opens source-gap evidence from live HUD with only exact read GETs', async ({ page }) => {
    const apiRequestViolations: string[] = [];
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
