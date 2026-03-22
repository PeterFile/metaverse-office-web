import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App, { resolveOverviewRefreshWarning, resolveSelectedAgent } from './App';
import type { OfficeAgent } from './types';

const operationsUrl = '/office/operations?limit=4';
const fullOperationsUrl = '/office/operations';
const incidentsUrl = '/incidents?limit=10&window=60m';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
const teamLeadWorkflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
const correlationUrl = '/correlations/corr-app-review?limit=10&window=60m';
const secondaryCorrelationUrl = '/correlations/corr-app-secondary?limit=10&window=60m';

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

const operationsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    item_count: 2,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      reviewing: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 0,
      orange: 1,
      red: 0
    }
  },
  items: [
    {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_blocker: 'Workflow evidence is still incomplete',
      current_location: 'meeting-zone',
      effective_severity: 'orange',
      reported_severity: 'yellow',
      derived_staleness: {
        severity: 'orange',
        stale_for_minutes: 22,
        last_meaningful_output_at: '2026-03-16T08:38:00.000Z'
      },
      reboot_recommended: true,
      last_event_at: '2026-03-16T08:50:00.000Z',
      last_heartbeat_at: '2026-03-16T08:59:30.000Z',
      last_meaningful_output_at: '2026-03-16T08:38:00.000Z',
      correlation_id: 'corr-app-review',
      latest_event: {
        event_id: 'evt-1',
        event_type: 'peer_watch_alert_raised',
        ts: '2026-03-16T08:50:00.000Z',
        summary: 'Workflow evidence is still incomplete',
        source_kind: 'controller_event',
        evidence_refs: ['/tmp/evidence.md'],
        counterparty_agent_ids: ['team-lead']
      }
    },
    {
      agent_id: 'team-lead',
      display_name: 'Team Lead',
      kind: 'lead',
      current_state: 'reviewing',
      active_task: 'Coordinate rollout',
      current_blocker: '',
      current_location: 'lead-desk',
      effective_severity: 'normal',
      reported_severity: 'normal',
      derived_staleness: {
        severity: 'normal',
        stale_for_minutes: 1,
        last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
      },
      reboot_recommended: false,
      last_event_at: null,
      last_heartbeat_at: null,
      last_meaningful_output_at: null,
      correlation_id: null,
      latest_event: null
    }
  ]
};

const emptyOperationsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    item_count: 0,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {},
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 0
    }
  },
  items: []
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
    },
    {
      incident_id: 'inc-2',
      kind: 'handoff',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'growth-revenue',
      status: 'completed',
      severity: 'yellow',
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      evidence_refs: ['/tmp/secondary-evidence.md'],
      counterparty_agent_ids: ['growth-revenue'],
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
  correlation_ids: ['corr-app-review', 'corr-app-secondary'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [],
  interactions: [],
  timeline: []
};

const teamLeadWorkflowFixture = {
  agent_id: 'team-lead',
  detail: {
    agent_id: 'team-lead',
    display_name: 'Team Lead',
    current_state: 'reviewing',
    active_task: 'Coordinate rollout',
    current_location: 'lead-desk',
    latest_heartbeat: {
      agent_id: 'team-lead',
      received_at: '2026-03-16T08:59:30.000Z'
    },
    open_peer_watch_alerts: [],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: []
  },
  correlation_ids: [],
  counterparty_agent_ids: [],
  incidents: [],
  interactions: [],
  timeline: []
};

const correlationFixture = {
  correlation_id: 'corr-app-review',
  participant_agent_ids: ['app-engineering', 'team-lead'],
  evidence_refs: ['/tmp/evidence.md', '/tmp/peer-watch.md'],
  first_ts: '2026-03-16T08:49:00.000Z',
  last_ts: '2026-03-16T08:50:00.000Z',
  incident_count: 1,
  interaction_count: 1,
  event_count: 1,
  incidents: [
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
  ],
  interactions: [
    {
      interaction_id: 'interaction-1',
      interaction_type: 'peer_watch',
      correlation_id: 'corr-app-review',
      started_at: '2026-03-16T08:49:00.000Z',
      ended_at: '2026-03-16T08:50:00.000Z',
      participant_agent_ids: ['app-engineering', 'team-lead'],
      trigger_event_id: 'evt-1',
      before_state: 'coding',
      after_state: 'blocked',
      severity: 'orange',
      evidence_refs: ['/tmp/evidence.md'],
      summary: 'Lead escalated missing workflow evidence',
      related_event_ids: ['evt-1']
    }
  ],
  timeline: [
    {
      event_id: 'evt-1',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'meeting-zone',
      summary: 'Workflow evidence is still incomplete',
      correlation_id: 'corr-app-review',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: ['/tmp/evidence.md'],
      source_kind: 'controller_event'
    }
  ]
};

const secondaryCorrelationFixture = {
  correlation_id: 'corr-app-secondary',
  participant_agent_ids: ['app-engineering', 'growth-revenue'],
  evidence_refs: ['/tmp/secondary-evidence.md'],
  first_ts: '2026-03-16T08:52:00.000Z',
  last_ts: '2026-03-16T08:52:00.000Z',
  incident_count: 1,
  interaction_count: 0,
  event_count: 1,
  incidents: [
    {
      incident_id: 'inc-2',
      kind: 'handoff',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'growth-revenue',
      status: 'completed',
      severity: 'yellow',
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      evidence_refs: ['/tmp/secondary-evidence.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ],
  interactions: [],
  timeline: [
    {
      event_id: 'evt-2',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'growth-revenue',
      event_type: 'handoff_completed',
      severity: 'yellow',
      current_state: 'coding',
      location: 'meeting-zone',
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: ['/tmp/secondary-evidence.md'],
      source_kind: 'controller_event'
    }
  ]
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

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
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

        if (url === teamLeadWorkflowUrl) {
          return new Response(JSON.stringify(teamLeadWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(secondaryCorrelationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

afterEach(() => {
  vi.useRealTimers();
  delete (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__;
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
    expect(await screen.findByRole('dialog', { name: 'Hub' })).toBeVisible();
    expect(await screen.findByRole('complementary', { name: 'Agent details' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close Hub' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  it('treats Hub as a dialog, closes on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<App />);

    const hubTrigger = await screen.findByRole('button', { name: 'Open Hub' });
    hubTrigger.focus();
    expect(hubTrigger).toHaveFocus();

    await user.click(hubTrigger);

    const dialog = await screen.findByRole('dialog', { name: 'Hub' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close Hub' });
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open Hub' })).toHaveFocus();
  });

  it('traps Tab navigation inside Hub while it is open', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open Hub' }));

    const dialog = await screen.findByRole('dialog', { name: 'Hub' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close Hub' });
    const dialogButtons = within(dialog).getAllByRole('button');
    const lastDialogButton = dialogButtons.at(-1);

    expect(lastDialogButton).toBeDefined();
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.tab({ shift: true });
    expect(lastDialogButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('loads the active operations queue only when Hub opens in Crew Overview and requests the limited slice', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(operationsUrl, expect.anything());

    const details = await openHub(user);

    expect(await within(details).findByRole('heading', { name: 'Active Queue' })).toBeVisible();
    expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(within(details).getByText('reviewing · Coordinate rollout')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(operationsUrl, expect.anything());
    });

    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));
    expect(within(details).queryByRole('heading', { name: 'Active Queue' })).not.toBeInTheDocument();
  });

  it('opens agent detail and correlation drilldown directly from the active queue', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueButton = within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' });
    await user.click(queueButton);

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Clear' })).toHaveFocus();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('keeps queue-derived operation context visible after drilling into a selected agent', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(operationSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: /Open operation correlation corr-app-review/ })).toBeVisible();
      expect(within(operationSection!).getByText('Location · meeting-zone')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(operationSection!).getByText('Counterparties · team-lead')).toBeVisible();
      expect(within(operationSection!).getByText('Evidence · /tmp/evidence.md')).toBeVisible();
      expect(within(operationSection!).getByText('Source · controller_event')).toBeVisible();
    });
  });

  it('shows when a queue-derived operation does not have a latest event yet', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(operationSection!).getByText('reviewing · Coordinate rollout')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · No latest event yet')).toBeVisible();
      expect(within(operationSection!).queryByText('Latest event · Coordinate rollout')).not.toBeInTheDocument();
      expect(within(operationSection!).getByText('Source · No latest event source')).toBeVisible();
    });
  });

  it('refreshes queue-derived operation context while selected agent details remain open', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    const refreshedOperationsFixture = {
      ...operationsFixture,
      generated_at: '2026-03-16T09:00:20.000Z',
      summary: {
        ...operationsFixture.summary,
        item_count: 6,
        blocked_count: 4,
        reboot_recommended_count: 4,
        state_buckets: {
          blocked: 4,
          reviewing: 2
        },
        severity_buckets: {
          normal: 1,
          yellow: 2,
          orange: 3,
          red: 0
        }
      },
      items: [
        {
          ...operationsFixture.items[0],
          agent_id: 'market-intel',
          display_name: 'Market Intel Agent',
          active_task: 'Escalate policy spike',
          current_blocker: 'Awaiting policy note',
          current_location: 'policy-room'
        },
        {
          ...operationsFixture.items[0],
          agent_id: 'product-pmf',
          display_name: 'Product PMF Agent',
          active_task: 'Resolve churn alert',
          current_blocker: 'Need retention evidence',
          current_location: 'pmf-room'
        },
        {
          ...operationsFixture.items[0],
          agent_id: 'tokenomics',
          display_name: 'Tokenomics Agent',
          active_task: 'Audit unlock schedule',
          current_blocker: 'Waiting on vesting sheet',
          current_location: 'treasury-desk'
        },
        {
          ...operationsFixture.items[0],
          agent_id: 'growth-revenue',
          display_name: 'Growth Revenue Agent',
          active_task: 'Stabilize launch handoff',
          current_blocker: 'Need live launch metrics',
          current_location: 'launch-bridge'
        },
        {
          ...operationsFixture.items[0],
          current_state: 'reviewing',
          active_task: 'Verify merged rollout',
          current_blocker: '',
          current_location: 'review-zone',
          correlation_id: 'corr-app-followup',
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                summary: 'Merged rollout verified',
                source_kind: 'workspace_snapshot',
                evidence_refs: ['/tmp/review.log'],
                counterparty_agent_ids: ['growth-revenue']
              }
            : null
        },
        operationsFixture.items[1]
      ]
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

        if (url === operationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === fullOperationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(refreshedOperationsFixture), {
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

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(fullOperationsUrl, expect.anything());
    });

    await waitFor(() => {
      expect(within(operationSection!).getByText('reviewing · Verify merged rollout')).toBeVisible();
      expect(within(operationSection!).getByText('Location · review-zone')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · Merged rollout verified')).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: /Open operation correlation corr-app-followup/ })).toBeVisible();
      expect(within(operationSection!).getByText('Counterparties · growth-revenue')).toBeVisible();
      expect(within(operationSection!).getByText('Evidence · /tmp/review.log')).toBeVisible();
      expect(within(operationSection!).getByText('Source · workspace_snapshot')).toBeVisible();
    });
  });

  it('shows a stale-operation warning when queue-derived refresh fails after selection', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === fullOperationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
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

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = await within(details).findByRole('heading', { name: 'Current Operation' });
    expect(operationSection).toBeVisible();

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(fullOperationsUrl, expect.anything());
      expect(within(details).getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible();
      expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    });
  });

  it('clears queue-derived operation context before a fresh roster selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
    });
  });

  it('resets toolbar-cleared correlation selection back to the crew-overview default on reopen', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );
    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Clear Selection' }));
    await user.click(screen.getByRole('button', { name: 'Hide Hub' }));
    const reopenedDetails = await openHub(user);
    const reopenedCorrelationSection = within(reopenedDetails)
      .getByRole('heading', { name: 'Correlation Drilldown' })
      .closest('section');
    expect(reopenedCorrelationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(reopenedDetails).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(reopenedCorrelationSection!).getByText('corr-app-review')).toBeVisible();
    });
    expect(within(reopenedCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
  });

  it('shows operations queue loading state explicitly while the overview queue is still pending', async () => {
    let resolveOperations: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Promise<Response>((resolve) => {
            resolveOperations = resolve;
          });
        }

        if (url === incidentsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(incidentFeedFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === workflowUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        return Promise.reject(new Error(`Unexpected request: ${url}`));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('Loading operations queue...')).toBeVisible();

    expect(resolveOperations).not.toBeNull();
    resolveOperations!(
      new Response(JSON.stringify(operationsFixture), {
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await within(details).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
  });

  it('shows operations queue failures explicitly instead of pretending empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
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

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('operations refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active operations queue.')).not.toBeInTheDocument();
  });

  it('loads correlation drilldown from selected-agent workflow evidence', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    expect(await within(details).findAllByText('Participants · app-engineering, team-lead')).toHaveLength(2);
    expect(within(details).getAllByText('Counts · 1 incidents · 1 interactions · 1 events')[0]).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('keeps an explicitly selected incident correlation instead of snapping back to the workflow default', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')
      ).toBeVisible();
    });
    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('does not fall back to crew-overview correlations while a selected-agent workflow is still loading', async () => {
    let correlationRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl || url === teamLeadWorkflowUrl) {
          return new Promise<Response>(() => {});
        }

        if (url === correlationUrl || url === secondaryCorrelationUrl) {
          correlationRequests += 1;
          return Promise.resolve(
            new Response(JSON.stringify(correlationFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        return Promise.reject(new Error(`Unexpected request: ${url}`));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });
    expect(correlationRequests).toBe(0);
  });

  it('clears stale correlation drilldown when switching to an agent without correlations', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    expect(await within(details).findByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });
    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
  });

  it('loads correlation drilldown from incident feed evidence', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    expect(await within(details).findAllByText('Participants · app-engineering, team-lead')).toHaveLength(2);

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('shows correlation loading and error states explicitly', async () => {
    let resolveCorrelation: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(incidentFeedFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === workflowUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === correlationUrl) {
          return new Promise<Response>((resolve) => {
            resolveCorrelation = resolve;
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${url}`));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    expect(resolveCorrelation).not.toBeNull();
    resolveCorrelation!(
      new Response(JSON.stringify({ error: 'internal_error', details: 'correlation refresh failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await within(details).findByText('correlation refresh failed')).toBeVisible();
    expect(within(details).queryByText('Counts · 1 incidents · 1 interactions · 1 events')).not.toBeInTheDocument();
  });

  it('keeps the last correlation drilldown visible when a later poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let correlationRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
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

        if (url === correlationUrl) {
          correlationRequests += 1;
          if (correlationRequests === 1) {
            return new Response(JSON.stringify(correlationFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'correlation refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    expect(await within(details).findByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    expect(await within(details).findByText('correlation refresh failed')).toBeVisible();
    expect(within(correlationSection!).getAllByText('Participants · app-engineering, team-lead')[0]).toBeVisible();
    expect(within(correlationSection!).getByText('Evidence · /tmp/evidence.md, /tmp/peer-watch.md')).toBeVisible();
    expect(correlationRequests).toBeGreaterThan(1);
  });

  it('shows an empty operations queue explicitly when no active overview items exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(emptyOperationsFixture), {
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

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('No active operations queue.')).toBeVisible();
  });

  it('keeps the last operations queue visible when a later queue poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          operationsRequests += 1;
          if (operationsRequests === 1) {
            return new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
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

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();

    expect(await within(details).findByText('operations refresh failed')).toBeVisible();
    expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(operationsRequests).toBeGreaterThan(1);
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

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
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

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
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

  it('keeps the last overview snapshot visible when a later overview poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let overviewRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          overviewRequests += 1;
          if (overviewRequests === 1) {
            return new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'overview refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    expect(screen.getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();

    expect(await screen.findByText('Showing last office snapshot.')).toBeVisible();
    expect(screen.getByText('overview refresh failed')).toBeVisible();
    expect(screen.getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();
    expect(screen.queryByText('Unable to load office overview.')).not.toBeInTheDocument();
  });

  it('clears stale selected-agent workflow details only after overview confirms the agent is absent', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let overviewRequests = 0;
    let workflowRequests = 0;
    let allowOverviewDrop = false;
    let overviewDroppedAgent = false;
    const overviewWithoutSelectedAgent = {
      ...overviewFixture,
      summary: {
        ...overviewFixture.summary,
        agent_count: 2,
        blocked_count: 0,
        reboot_recommended_count: 0,
        severity_buckets: {
          normal: 1,
          yellow: 1,
          orange: 0,
          red: 0
        }
      },
      watch_edges: [],
      agents: overviewFixture.agents.filter((agent) => agent.agent_id !== 'app-engineering'),
      zones: overviewFixture.zones.map((zone) => ({
        ...zone,
        occupants: zone.occupants
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          overviewRequests += 1;
          const body = allowOverviewDrop ? overviewWithoutSelectedAgent : overviewFixture;
          if (allowOverviewDrop) {
            overviewDroppedAgent = true;
          }
          return new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          workflowRequests += 1;
          if (workflowRequests === 1) {
            allowOverviewDrop = true;
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          if (!overviewDroppedAgent) {
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'not_found', details: 'unknown agent app-engineering' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(await within(details).findByRole('button', { name: 'Inspect App Engineering Agent' }));
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    });
    expect(overviewRequests).toBeGreaterThan(1);
    expect(workflowRequests).toBeGreaterThan(1);
    expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear Selection' })).not.toBeInTheDocument();
  });

  it('keeps selected-agent workflow details pinned when a workflow 404 arrives before overview drops the agent', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let workflowRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          workflowRequests += 1;
          if (workflowRequests === 1) {
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'not_found', details: 'unknown agent app-engineering' }), {
            status: 404,
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
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();

    expect(await within(details).findByText('unknown agent app-engineering')).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
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

        if (url === operationsUrl || url === fullOperationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
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

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    expect(within(details).getByText('Fix workflow issue')).toBeVisible();
    expect(within(workflowSection!).getByText('Workflow evidence is still incomplete')).toBeVisible();
    expect(within(details).getByText('meeting-zone')).toBeVisible();
    expect(within(workflowSection!).getByText('Workflow status · blocked')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
    });
  });
});
