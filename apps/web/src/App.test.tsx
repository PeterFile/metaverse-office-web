import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App, { resolveOverviewRefreshWarning, resolveSelectedAgent } from './App';
import type { OfficeAgent } from './types';

const incidentsUrl = '/incidents?limit=10&window=60m';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';

const overviewFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    agent_count: 3,
    blocked_count: 1,
    reboot_recommended_count: 1,
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 1,
      red: 0
    }
  },
  zones: [
    {
      zone_id: 'lead-desk',
      label: 'Team Lead Desk',
      kind: 'desk',
      grid_x: 0,
      grid_y: 0,
      grid_w: 1,
      grid_h: 1,
      home_agent_id: 'team-lead',
      occupants: []
    },
    {
      zone_id: 'meeting-zone',
      label: 'Meeting Zone',
      kind: 'shared',
      grid_x: 1,
      grid_y: 1,
      grid_w: 2,
      grid_h: 1,
      home_agent_id: null,
      occupants: []
    }
  ],
  watch_edges: [
    {
      from_agent_id: 'team-lead',
      to_agent_id: 'app-engineering',
      watch_mode: 'lead'
    }
  ],
  agents: [
    {
      agent_id: 'team-lead',
      display_name: 'Team Lead',
      kind: 'lead',
      current_state: 'reviewing',
      active_task: 'Coordinate rollout',
      current_location: 'lead-desk',
      effective_severity: 'normal',
      reported_severity: 'normal',
      severity: 'normal',
      derived_staleness: {
        severity: 'normal',
        stale_for_minutes: 1,
        last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
      },
      reboot_recommended: false
    },
    {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_location: 'meeting-zone',
      effective_severity: 'orange',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'orange',
        stale_for_minutes: 22,
        last_meaningful_output_at: '2026-03-16T08:38:00.000Z'
      },
      reboot_recommended: true
    },
    {
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      kind: 'employee',
      current_state: 'planning',
      active_task: 'Review launch copy',
      current_location: 'meeting-zone',
      effective_severity: 'yellow',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'yellow',
        stale_for_minutes: 9,
        last_meaningful_output_at: '2026-03-16T08:51:00.000Z'
      },
      reboot_recommended: false
    }
  ]
};

const incidentFeedFixture = {
  items: [
    {
      incident_id: 'inc-1',
      kind: 'peer_watch',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Lead is still waiting on workflow evidence',
      correlation_id: 'corr-app-review',
      evidence_refs: ['/tmp/evidence.md'],
      counterparty_agent_ids: ['team-lead'],
      source_kind: 'controller_event'
    }
  ]
};

const workflowFixture = {
  agent_id: 'app-engineering',
  detail: {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    current_state: 'blocked',
    active_task: 'Fix workflow issue',
    current_location: 'meeting-zone',
    latest_heartbeat: {
      agent_id: 'app-engineering',
      received_at: '2026-03-16T08:59:30.000Z'
    },
    open_peer_watch_alerts: [
      {
        alert_id: 'alert-1',
        agent_id: 'app-engineering',
        target_agent_id: 'app-engineering',
        actor_id: 'team-lead',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['growth-revenue'],
        severity: 'orange',
        status: 'open',
        current_state: 'blocked',
        active_task: 'Fix workflow issue',
        summary: 'Workflow evidence is still incomplete',
        evidence_refs: ['/tmp/evidence.md'],
        evidence_count: 1,
        correlation_id: 'corr-app-review',
        source_kind: 'controller_event',
        metadata: {}
      }
    ],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: []
  },
  correlation_ids: ['corr-app-review'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [],
  interactions: [],
  timeline: []
};

async function openHub(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Open Hub' }));
  return screen.findByRole('complementary', { name: 'Agent details' });
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the AI Town shell as the default frontend', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    expect(screen.getByText('AI Town-derived world shell for Metaverse Office.')).toBeVisible();

    const worldRegion = screen.getByRole('region', { name: 'Town world' });
    expect(worldRegion).toBeVisible();
    expect(within(worldRegion).getByText('Loading world renderer...')).toBeVisible();

    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect App Engineering Agent' })).not.toBeInTheDocument();
  });

  it('uses a full-screen scene with a dismissible hub overlay', async () => {
    const user = userEvent.setup();
    render(<App />);

    const hubTrigger = await screen.findByRole('button', { name: 'Open Hub' });
    expect(hubTrigger).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();

    const worldRegion = screen.getByRole('region', { name: 'Town world' });
    expect(worldRegion.className).toContain('aitown-panel--game-fullscreen');

    await user.click(hubTrigger);
    expect(await screen.findByRole('complementary', { name: 'Agent details' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close Hub' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  it('keeps selected agent summary aligned with projected world state', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    });

    expect(within(details).getByText(/reviewing · Normal · review-zone/i)).toBeVisible();
  });

  it('shows incident feed loading and error states explicitly instead of pretending empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('incident refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active incident feed.')).not.toBeInTheDocument();
  });

  it('keeps the selected details visible when overview briefly drops the selected agent', () => {
    const selected = resolveSelectedAgent('app-engineering', undefined, overviewFixture.agents[1] as OfficeAgent);

    expect(selected).toMatchObject({
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent'
    });
  });

  it('shows incident feed failures explicitly even for selected agents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    expect(await within(details).findByText('incident refresh failed')).toBeVisible();
    expect(within(details).queryByText('No incident feed entries.')).not.toBeInTheDocument();
  });

  it('shows a degraded warning when overview refresh fails after initial load', () => {
    expect(resolveOverviewRefreshWarning('overview refresh failed', true)).toBe('overview refresh failed');
    expect(resolveOverviewRefreshWarning('overview refresh failed', false)).toBeNull();
    expect(resolveOverviewRefreshWarning(null, true)).toBeNull();
  });

  it('prefers workflow incidents when the selected agent is missing from the global incident feed', async () => {
    const workflowWithIncidents = {
      ...workflowFixture,
      incidents: [
        {
          incident_id: 'wf-inc-1',
          kind: 'peer_watch',
          ts: '2026-03-16T08:49:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Workflow incident fallback entry',
          correlation_id: 'corr-app-review',
          evidence_refs: ['/tmp/evidence.md'],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event'
        }
      ],
      detail: {
        ...workflowFixture.detail,
        recent_incidents: [
          {
            incident_id: 'wf-inc-1',
            kind: 'peer_watch',
            ts: '2026-03-16T08:49:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            status: 'open',
            severity: 'orange',
            summary: 'Workflow incident fallback entry',
            correlation_id: 'corr-app-review',
            evidence_refs: ['/tmp/evidence.md'],
            counterparty_agent_ids: ['team-lead'],
            source_kind: 'controller_event'
          }
        ]
      }
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithIncidents), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    expect(await within(details).findByText('Workflow incident fallback entry')).toBeVisible();
    expect(within(details).queryByText('No incident feed entries.')).not.toBeInTheDocument();
  });

  it('loads workflow details into the right panel when an agent is selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    });

    expect(within(details).getByText('Fix workflow issue')).toBeVisible();
    expect(within(details).getByText('Workflow evidence is still incomplete')).toBeVisible();
    expect(within(details).getByText('meeting-zone')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
    });
  });
});
