import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const incidentsUrl = '/incidents?limit=10&window=60m';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
const growthWorkflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
const teamLeadWorkflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
const unknownWorkflowUrl = '/agents/unknown-agent/workflow?limit=10&window=60m';
const correlationUrl = '/correlations/corr-workflow-peer-watch?limit=10&window=60m';
const revenueCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';

const overviewFixture = {
  generated_at: '2026-03-11T00:00:00.000Z',
  summary: {
    agent_count: 5,
    blocked_count: 2,
    reboot_recommended_count: 2,
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 3,
      red: 0
    }
  },
  zones: [
    {
      zone_id: 'meeting-zone',
      label: 'Meeting Zone',
      kind: 'shared',
      grid_x: 0,
      grid_y: 2,
      grid_w: 2,
      grid_h: 1,
      home_agent_id: null,
      occupants: []
    },
    {
      zone_id: 'desk-app-engineering',
      label: 'App Engineering Desk',
      kind: 'desk',
      grid_x: 4,
      grid_y: 1,
      grid_w: 1,
      grid_h: 1,
      home_agent_id: 'app-engineering',
      occupants: [
        {
          agent_id: 'app-engineering',
          display_name: 'App Engineering Agent',
          kind: 'employee',
          current_state: 'blocked',
          active_task: 'Fix workflow issue',
          effective_severity: 'orange'
        }
      ]
    },
    {
      zone_id: 'lead-desk',
      label: 'Team Lead Desk',
      kind: 'desk',
      grid_x: 0,
      grid_y: 0,
      grid_w: 2,
      grid_h: 1,
      home_agent_id: 'team-lead',
      occupants: [
        {
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate the office shell',
          effective_severity: 'normal'
        }
      ]
    }
  ],
  watch_edges: [
    {
      from_agent_id: 'protocol-engineering',
      to_agent_id: 'app-engineering',
      watch_mode: 'peer'
    },
    {
      from_agent_id: 'team-lead',
      to_agent_id: 'app-engineering',
      watch_mode: 'lead'
    },
    {
      from_agent_id: 'team-lead',
      to_agent_id: 'growth-revenue',
      watch_mode: 'lead'
    }
  ],
  agents: [
    {
      agent_id: 'team-lead',
      display_name: 'Team Lead',
      kind: 'lead',
      current_state: 'reviewing',
      active_task: 'Coordinate the office shell',
      current_location: 'lead-desk',
      effective_severity: 'normal',
      reported_severity: 'normal',
      severity: 'normal',
      derived_staleness: {
        severity: 'normal',
        last_meaningful_output_at: '2026-03-11T00:00:00.000Z'
      },
      reboot_recommended: false
    },
    {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_location: 'desk-app-engineering',
      effective_severity: 'orange',
      reported_severity: 'normal',
      severity: 'normal',
      derived_staleness: {
        severity: 'orange',
        last_meaningful_output_at: '2026-03-10T23:20:00.000Z'
      },
      reboot_recommended: true
    },
    {
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      kind: 'employee',
      current_state: 'planning',
      active_task: 'Prepare handoff notes',
      current_location: 'meeting-zone',
      effective_severity: 'yellow',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'normal',
        last_meaningful_output_at: '2026-03-10T23:50:00.000Z'
      },
      reboot_recommended: false
    },
    {
      agent_id: 'protocol-engineering',
      display_name: 'Protocol Engineering Agent',
      kind: 'employee',
      current_state: 'reviewing',
      active_task: 'Audit peer watch evidence',
      current_location: 'meeting-zone',
      effective_severity: 'orange',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'orange',
        last_meaningful_output_at: '2026-03-10T23:30:00.000Z'
      },
      reboot_recommended: true
    },
    {
      agent_id: 'infra-ops',
      display_name: 'Infra Ops Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Restore sandbox shell',
      current_location: 'ops-bay',
      effective_severity: 'orange',
      reported_severity: 'orange',
      severity: 'orange',
      derived_staleness: {
        severity: 'orange',
        last_meaningful_output_at: '2026-03-10T23:25:00.000Z'
      },
      reboot_recommended: false
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
    current_location: 'review-zone',
    latest_heartbeat: {
      agent_id: 'app-engineering',
      received_at: '2026-03-10T23:59:00.000Z'
    },
    open_peer_watch_alerts: [
      {
        alert_id: 'evt_detail_peer_watch_open',
        agent_id: 'app-engineering',
        target_agent_id: 'app-engineering',
        actor_id: 'team-lead',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['protocol-engineering'],
        severity: 'orange',
        status: 'open',
        current_state: 'blocked',
        active_task: 'Fix workflow issue',
        summary: 'Protocol watch remains open for the workflow drift',
        evidence_refs: ['/tmp/workflow-peer-watch.md'],
        evidence_count: 1,
        correlation_id: 'corr-workflow-peer-watch',
        source_kind: 'controller_event',
        metadata: {
          current_blocker: 'Need review evidence'
        }
      }
    ],
    recent_events: [
      {
        event_id: 'evt_detail_workflow_review_started',
        ts: '2026-03-10T23:10:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        event_type: 'review_started',
        severity: 'yellow',
        current_state: 'reviewing',
        active_task: 'Review workflow evidence',
        location: 'review-zone',
        summary: 'Lead started workflow evidence review',
        correlation_id: 'corr-workflow-review',
        counterparty_agent_ids: ['protocol-engineering'],
        evidence_refs: ['/tmp/workflow-review-start.md'],
        source_kind: 'controller_event',
        metadata: {}
      }
    ],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [
      {
        handoff_id: 'evt_detail_handoff_completed',
        ts: '2026-03-10T23:48:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        phase: 'completed',
        status: 'completed',
        severity: 'yellow',
        summary: 'Lead completed the workflow handoff',
        counterparty_agent_ids: ['growth-revenue'],
        evidence_refs: ['/tmp/workflow-handoff.md'],
        correlation_id: 'corr-workflow-handoff',
        source_kind: 'controller_event'
      }
    ],
    recent_reboots: [
      {
        reboot_id: 'evt_detail_reboot_requested',
        ts: '2026-03-10T23:55:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        phase: 'requested',
        status: 'requested',
        severity: 'red',
        summary: 'Lead requested a workflow reboot',
        counterparty_agent_ids: [],
        evidence_refs: ['/tmp/workflow-reboot.md'],
        correlation_id: 'corr-workflow-reboot',
        source_kind: 'controller_event'
      }
    ]
  },
  correlation_ids: ['corr-workflow-peer-watch', 'corr-workflow-review'],
  counterparty_agent_ids: ['protocol-engineering', 'growth-revenue'],
  incidents: [
    {
      incident_id: 'evt_workflow_peer_watch',
      kind: 'peer_watch_alert',
      ts: '2026-03-10T23:40:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Protocol escalated stale workflow evidence',
      correlation_id: 'corr-workflow-peer-watch',
      evidence_refs: ['/tmp/workflow-peer-watch.md'],
      counterparty_agent_ids: ['protocol-engineering'],
      source_kind: 'controller_event'
    }
  ],
  interactions: [
    {
      interaction_id: 'interaction:evt_workflow_review_started',
      interaction_type: 'review',
      correlation_id: 'corr-workflow-review',
      started_at: '2026-03-10T23:10:00.000Z',
      ended_at: '2026-03-10T23:12:00.000Z',
      participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      trigger_event_id: 'evt_workflow_review_started',
      before_state: 'reviewing',
      after_state: 'reviewing',
      severity: 'yellow',
      evidence_refs: ['/tmp/workflow-review.md'],
      summary: 'Lead completed workflow review',
      related_event_ids: ['evt_workflow_review_started', 'evt_workflow_review_completed']
    }
  ],
  timeline: [
    {
      event_id: 'evt_workflow_review_started',
      ts: '2026-03-10T23:10:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'review_started',
      severity: 'yellow',
      current_state: 'reviewing',
      location: 'review-zone',
      summary: 'Lead started workflow review',
      correlation_id: 'corr-workflow-review',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/workflow-review-start.md'],
      source_kind: 'controller_event'
    }
  ]
};

const growthWorkflowFixture = {
  ...workflowFixture,
  agent_id: 'growth-revenue',
  detail: {
    ...workflowFixture.detail,
    agent_id: 'growth-revenue',
    display_name: 'Growth Revenue Agent',
    current_state: 'planning',
    active_task: 'Prepare handoff notes',
    current_location: 'meeting-zone',
    latest_heartbeat: {
      agent_id: 'growth-revenue',
      received_at: '2026-03-10T23:57:00.000Z'
    }
  },
  correlation_ids: ['corr-growth-lead-review'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [
    {
      ...workflowFixture.incidents[0],
      incident_id: 'evt_growth_lead_review_waiting',
      kind: 'handoff',
      ts: '2026-03-10T23:45:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'growth-revenue',
      status: 'waiting',
      severity: 'yellow',
      summary: 'Growth workflow queued for lead approval',
      correlation_id: 'corr-growth-lead-review',
      evidence_refs: ['/tmp/growth-lead-review.md'],
      counterparty_agent_ids: ['team-lead']
    }
  ],
  interactions: [],
  timeline: [
    {
      ...workflowFixture.timeline[0],
      event_id: 'evt_growth_lead_review_requested',
      ts: '2026-03-10T23:44:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'growth-revenue',
      event_type: 'handoff_requested',
      severity: 'yellow',
      current_state: 'planning',
      location: 'meeting-zone',
      summary: 'Growth handoff review requested',
      correlation_id: 'corr-growth-lead-review',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: ['/tmp/growth-lead-review.md']
    }
  ]
};

const teamLeadWorkflowFixture = {
  ...workflowFixture,
  agent_id: 'team-lead',
  detail: {
    ...workflowFixture.detail,
    agent_id: 'team-lead',
    display_name: 'Team Lead',
    current_state: 'reviewing',
    active_task: 'Coordinate the office shell',
    current_location: 'lead-desk',
    latest_heartbeat: {
      agent_id: 'team-lead',
      received_at: '2026-03-10T23:58:00.000Z'
    }
  },
  correlation_ids: ['corr-team-lead-review'],
  counterparty_agent_ids: ['app-engineering', 'growth-revenue'],
  incidents: [
    {
      ...workflowFixture.incidents[0],
      incident_id: 'evt_team_lead_reviewing_growth',
      kind: 'handoff',
      ts: '2026-03-10T23:46:00.000Z',
      agent_id: 'team-lead',
      actor_id: 'growth-revenue',
      status: 'waiting',
      severity: 'yellow',
      summary: 'Team lead is reviewing the queued growth handoff',
      correlation_id: 'corr-team-lead-review',
      evidence_refs: ['/tmp/team-lead-review.md'],
      counterparty_agent_ids: ['growth-revenue']
    }
  ],
  interactions: [
    {
      ...workflowFixture.interactions[0],
      interaction_id: 'interaction:evt_team_lead_review_growth_started',
      interaction_type: 'handoff',
      correlation_id: 'corr-team-lead-review',
      started_at: '2026-03-10T23:43:00.000Z',
      ended_at: '2026-03-10T23:46:00.000Z',
      participant_agent_ids: ['team-lead', 'growth-revenue', 'app-engineering'],
      trigger_event_id: 'evt_team_lead_review_growth_started',
      before_state: 'reviewing',
      after_state: 'reviewing',
      severity: 'yellow',
      evidence_refs: ['/tmp/team-lead-review.md'],
      summary: 'Team lead reviewed the growth handoff package',
      related_event_ids: [
        'evt_team_lead_review_growth_started',
        'evt_team_lead_review_growth_completed'
      ]
    }
  ],
  timeline: [
    {
      ...workflowFixture.timeline[0],
      event_id: 'evt_team_lead_review_growth_started',
      ts: '2026-03-10T23:43:00.000Z',
      agent_id: 'team-lead',
      actor_id: 'growth-revenue',
      event_type: 'handoff_review_started',
      severity: 'yellow',
      current_state: 'reviewing',
      location: 'lead-desk',
      summary: 'Team lead started the growth handoff review',
      correlation_id: 'corr-team-lead-review',
      counterparty_agent_ids: ['growth-revenue', 'app-engineering'],
      evidence_refs: ['/tmp/team-lead-review.md']
    }
  ]
};

const incidentFeedFixture = {
  items: [
    workflowFixture.incidents[0],
    {
      incident_id: 'handoff_growth_revenue_review',
      kind: 'handoff',
      ts: '2026-03-10T23:45:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'growth-revenue',
      status: 'waiting',
      severity: 'yellow',
      summary: 'Revenue handoff is waiting on operator review',
      correlation_id: 'corr-revenue-handoff',
      evidence_refs: ['/tmp/revenue-handoff.md'],
      counterparty_agent_ids: ['team-lead'],
      source_kind: 'controller_event'
    }
  ]
};

const correlationFixture = {
  correlation_id: 'corr-workflow-peer-watch',
  participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
  evidence_refs: ['/tmp/workflow-peer-watch.md', '/tmp/workflow-review-start.md'],
  first_ts: '2026-03-10T23:35:00.000Z',
  last_ts: '2026-03-10T23:40:00.000Z',
  incident_count: 1,
  interaction_count: 1,
  event_count: 1,
  incidents: [workflowFixture.incidents[0]],
  interactions: [
    {
      interaction_id: 'interaction:evt_workflow_peer_watch_opened',
      interaction_type: 'peer_watch',
      correlation_id: 'corr-workflow-peer-watch',
      started_at: '2026-03-10T23:35:00.000Z',
      ended_at: '2026-03-10T23:38:00.000Z',
      participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      trigger_event_id: 'evt_workflow_peer_watch_opened',
      before_state: 'reviewing',
      after_state: 'blocked',
      severity: 'orange',
      evidence_refs: ['/tmp/workflow-peer-watch.md'],
      summary: 'Lead opened peer watch review',
      related_event_ids: ['evt_workflow_peer_watch_opened']
    }
  ],
  timeline: [
    {
      event_id: 'evt_workflow_peer_watch_opened',
      ts: '2026-03-10T23:40:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'review-zone',
      summary: 'Peer watch alert raised',
      correlation_id: 'corr-workflow-peer-watch',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/workflow-peer-watch.md'],
      source_kind: 'controller_event'
    }
  ]
};

const revenueCorrelationFixture = {
  correlation_id: 'corr-revenue-handoff',
  participant_agent_ids: ['growth-revenue', 'team-lead'],
  evidence_refs: ['/tmp/revenue-handoff.md'],
  first_ts: '2026-03-10T23:45:00.000Z',
  last_ts: '2026-03-10T23:45:00.000Z',
  incident_count: 1,
  interaction_count: 0,
  event_count: 1,
  incidents: [incidentFeedFixture.items[1]],
  interactions: [],
  timeline: [
    {
      event_id: 'evt_revenue_handoff_requested',
      ts: '2026-03-10T23:45:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'growth-revenue',
      event_type: 'handoff_requested',
      severity: 'yellow',
      current_state: 'planning',
      location: 'meeting-zone',
      summary: 'Growth revenue asked for operator review',
      correlation_id: 'corr-revenue-handoff',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: ['/tmp/revenue-handoff.md'],
      source_kind: 'controller_event'
    }
  ]
};

function buildJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(buildJsonResponse(body, status));
}

function defaultAppResponse(url: string) {
  if (url === '/office/overview') {
    return jsonResponse(overviewFixture);
  }

  if (url === incidentsUrl) {
    return jsonResponse(incidentFeedFixture);
  }

  if (url === workflowUrl) {
    return jsonResponse(workflowFixture);
  }

  if (url === correlationUrl) {
    return jsonResponse(correlationFixture);
  }

  if (url === revenueCorrelationUrl) {
    return jsonResponse(revenueCorrelationFixture);
  }

  return null;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getOfficeGrid() {
  return screen.getByRole('region', { name: 'Office grid' });
}

function findOfficeGrid() {
  return screen.findByRole('region', { name: 'Office grid' });
}

async function tabToElement(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  maxTabs = 200
) {
  const currentActiveElement = document.activeElement;
  if (currentActiveElement instanceof HTMLElement) {
    currentActiveElement.blur();
  }

  for (let index = 0; index < maxTabs; index += 1) {
    await user.tab();
    if (document.activeElement === target) {
      return;
    }
  }

  throw new Error(
    `unable_to_focus_target_via_tab:${
      target.getAttribute('aria-label') || target.textContent || target.tagName
    }`
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the summary header, office grid, attention queue, watch topology, and the initial selection state', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const overviewLoading = screen.getByRole('status');
    expect(overviewLoading).toHaveTextContent('Loading office overview.');

    expect(await screen.findByRole('heading', { name: 'Operator Shell' })).toBeInTheDocument();
    expect(screen.getByText('5 agents')).toBeInTheDocument();
    expect(screen.getByText('2 blocked')).toBeInTheDocument();
    expect(screen.getByText('2 reboot recommended')).toBeInTheDocument();
    expect(screen.getByText('Team Lead Desk')).toBeInTheDocument();
    expect(screen.getByText('App Engineering Desk')).toBeInTheDocument();
    expect(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })).toBeInTheDocument();
    expect(screen.getByText('Fix workflow issue')).toBeInTheDocument();
    expect(screen.getByText('Location: desk-app-engineering')).toBeInTheDocument();
    expect(screen.getByText('Team Lead Desk').closest('article')?.getAttribute('style')).toContain(
      '--zone-mobile-grid-column: 1 / -1'
    );
    expect(
      screen.getByText('App Engineering Desk').closest('article')?.getAttribute('style')
    ).toContain('--zone-mobile-grid-column: span 1');
    expect(
      screen.getByText('App Engineering Desk').closest('article')?.getAttribute('style')
    ).toContain('--zone-mobile-order: 1');
    expect(
      screen.getByText('Select an agent to inspect incidents, interactions, and replay evidence.')
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Global incident feed' })).toBeInTheDocument();
    expect(screen.getByText('Revenue handoff is waiting on operator review')).toBeInTheDocument();
    const attentionQueuePanel = screen
      .getByRole('heading', { name: 'Operator attention queue' })
      .closest('section');
    expect(attentionQueuePanel).not.toBeNull();

    const attentionQueueItems = within(attentionQueuePanel!).getAllByRole('listitem');
    expect(attentionQueueItems).toHaveLength(4);
    expect(within(attentionQueueItems[0]).getByRole('button')).toHaveTextContent(
      'App Engineering Agent'
    );
    expect(within(attentionQueueItems[1]).getByRole('button')).toHaveTextContent(
      'Protocol Engineering Agent'
    );
    expect(within(attentionQueueItems[2]).getByRole('button')).toHaveTextContent(
      'Infra Ops Agent'
    );
    expect(within(attentionQueueItems[3]).getByRole('button')).toHaveTextContent(
      'Growth Revenue Agent'
    );
    expect(within(attentionQueueItems[0]).getByText('Severity: orange')).toBeInTheDocument();
    expect(within(attentionQueueItems[0]).getByText('State: blocked')).toBeInTheDocument();
    expect(within(attentionQueueItems[0]).getByText('Reboot: recommended')).toBeInTheDocument();
    expect(within(attentionQueueItems[0]).getByText('Task: Fix workflow issue')).toBeInTheDocument();

    const watchTopologyPanel = screen
      .getByRole('heading', { name: 'Watch topology' })
      .closest('section');
    expect(watchTopologyPanel).not.toBeNull();
    const protocolWatchButton = within(watchTopologyPanel!).getByRole('button', {
      name: 'Select target App Engineering Agent from Protocol Engineering Agent (peer watch)'
    });
    expect(protocolWatchButton).toBeInTheDocument();
    expect(protocolWatchButton).toHaveAttribute('aria-pressed', 'false');
    expect(within(watchTopologyPanel!).getByText('Mode: peer')).toBeInTheDocument();
    const leadAppWatchButton = within(watchTopologyPanel!).getByRole('button', {
      name: 'Select target App Engineering Agent from Team Lead (lead watch)'
    });
    expect(leadAppWatchButton).toBeInTheDocument();
    expect(leadAppWatchButton).toHaveAttribute('aria-pressed', 'false');
    const leadGrowthWatchButton = within(watchTopologyPanel!).getByRole('button', {
      name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
    });
    expect(leadGrowthWatchButton).toBeInTheDocument();
    expect(leadGrowthWatchButton).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByText('Select a correlation id from workflow or incident feed.')
    ).toBeInTheDocument();
  });

  it('loads the selected workflow, exposes labelled evidence regions, and polls the read-only routes on an interval', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    expect(screen.getByRole('region', { name: 'Operator attention queue' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Global incident feed' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Watch topology' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Correlation drilldown' })).toBeInTheDocument();

    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen.getByRole('complementary', { name: 'Workflow panel' });

    expect(within(workflowPanel).getByRole('heading', { name: 'Workflow: App Engineering Agent' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow detail peer-watch alerts' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow detail recent events' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow detail recent handoffs' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow detail recent reboots' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow correlation ids' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow counterparties' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow incidents' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow interactions' })).toBeInTheDocument();
    expect(within(workflowPanel).getByRole('list', { name: 'Workflow timeline' })).toBeInTheDocument();
    expect(within(workflowPanel).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    expect(within(workflowPanel).getByText('Lead completed workflow review')).toBeInTheDocument();
    expect(within(workflowPanel).getByText('Lead started workflow review')).toBeInTheDocument();
    expect(
      within(workflowPanel).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    ).toBeInTheDocument();
    expect(
      within(workflowPanel).getByRole('button', {
        name: 'Inspect workflow incident correlation corr-workflow-peer-watch'
      })
    ).toBeInTheDocument();
    const counterpartySection = within(workflowPanel).getByRole('heading', { name: 'Counterparties' }).closest('section');
    expect(counterpartySection).not.toBeNull();
    expect(
      within(counterpartySection!).getByRole('button', { name: 'Select workflow for protocol-engineering' })
    ).toBeInTheDocument();
    expect(
      within(counterpartySection!).getByRole('button', { name: 'Select workflow for protocol-engineering' })
    ).toHaveAttribute('aria-pressed', 'false');
    const workflowDetailAlertRow = within(workflowPanel)
      .getByText('Protocol watch remains open for the workflow drift')
      .closest('li');
    expect(workflowDetailAlertRow).not.toBeNull();
    expect(within(workflowDetailAlertRow!).getByText('Current state: blocked')).toBeInTheDocument();
    expect(within(workflowDetailAlertRow!).getByText('Observer: team-lead')).toBeInTheDocument();
    expect(within(workflowDetailAlertRow!).getByText('Watchers: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowDetailAlertRow!).getByText('Evidence refs: /tmp/workflow-peer-watch.md')).toBeInTheDocument();
    expect(within(workflowDetailAlertRow!).getByText('Evidence count: 1')).toBeInTheDocument();

    const workflowDetailEventRow = within(workflowPanel)
      .getByText('Lead started workflow evidence review')
      .closest('li');
    expect(workflowDetailEventRow).not.toBeNull();
    expect(within(workflowDetailEventRow!).getByText('Timestamp: 2026-03-10T23:10:00.000Z')).toBeInTheDocument();
    expect(within(workflowDetailEventRow!).getByText('Task: Review workflow evidence')).toBeInTheDocument();
    expect(within(workflowDetailEventRow!).getByText('Location: review-zone')).toBeInTheDocument();
    expect(within(workflowDetailEventRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowDetailEventRow!).getByText('Evidence refs: /tmp/workflow-review-start.md')).toBeInTheDocument();

    const workflowDetailHandoffRow = within(workflowPanel)
      .getByText('Lead completed the workflow handoff')
      .closest('li');
    expect(workflowDetailHandoffRow).not.toBeNull();
    expect(within(workflowDetailHandoffRow!).getByText('Actor: team-lead')).toBeInTheDocument();
    expect(within(workflowDetailHandoffRow!).getByText('Counterparties: growth-revenue')).toBeInTheDocument();
    expect(within(workflowDetailHandoffRow!).getByText('Evidence refs: /tmp/workflow-handoff.md')).toBeInTheDocument();

    const workflowDetailRebootRow = within(workflowPanel)
      .getByText('Lead requested a workflow reboot')
      .closest('li');
    expect(workflowDetailRebootRow).not.toBeNull();
    expect(within(workflowDetailRebootRow!).getByText('requested · red')).toBeInTheDocument();
    expect(within(workflowDetailRebootRow!).getByText('Evidence refs: /tmp/workflow-reboot.md')).toBeInTheDocument();

    const workflowIncidentRow = within(workflowPanel)
      .getByText('Protocol escalated stale workflow evidence')
      .closest('li');
    expect(workflowIncidentRow).not.toBeNull();
    expect(within(workflowIncidentRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(workflowIncidentRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowIncidentRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    const workflowInteractionRow = within(workflowPanel)
      .getByText('Lead completed workflow review')
      .closest('li');
    expect(workflowInteractionRow).not.toBeNull();
    expect(
      within(workflowInteractionRow!).getByText(
        'Participants: app-engineering, protocol-engineering, team-lead'
      )
    ).toBeInTheDocument();
    expect(within(workflowInteractionRow!).getByText('Correlation: corr-workflow-review')).toBeInTheDocument();
    expect(within(workflowInteractionRow!).getByText('Severity: yellow')).toBeInTheDocument();
    expect(within(workflowInteractionRow!).getByText('Evidence: /tmp/workflow-review.md')).toBeInTheDocument();

    const workflowTimelineRow = within(workflowPanel)
      .getByText('Lead started workflow review')
      .closest('li');
    expect(workflowTimelineRow).not.toBeNull();
    expect(within(workflowTimelineRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Location: review-zone')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Evidence: /tmp/workflow-review-start.md')).toBeInTheDocument();
    fireEvent.click(
      within(workflowPanel).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );
    await flushAsyncWork();

    const correlationPanel = screen.getByRole('region', { name: 'Correlation drilldown' });

    expect(
      within(correlationPanel).getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
    ).toBeInTheDocument();
    expect(within(correlationPanel).getByRole('list', { name: 'Correlation participants' })).toBeInTheDocument();
    expect(within(correlationPanel).getByRole('list', { name: 'Correlation evidence refs' })).toBeInTheDocument();
    expect(within(correlationPanel).getByRole('list', { name: 'Correlation incidents' })).toBeInTheDocument();
    expect(within(correlationPanel).getByRole('list', { name: 'Correlation interactions' })).toBeInTheDocument();
    expect(within(correlationPanel).getByRole('list', { name: 'Correlation timeline' })).toBeInTheDocument();
    expect(within(correlationPanel).getByText('Lead opened peer watch review')).toBeInTheDocument();
    expect(within(correlationPanel).getByText('Peer watch alert raised')).toBeInTheDocument();
    const correlationIncidentRow = within(correlationPanel)
      .getByText('Protocol escalated stale workflow evidence')
      .closest('li');
    expect(correlationIncidentRow).not.toBeNull();
    expect(within(correlationIncidentRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(correlationIncidentRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(correlationIncidentRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    const correlationInteractionRow = within(correlationPanel)
      .getByText('Lead opened peer watch review')
      .closest('li');
    expect(correlationInteractionRow).not.toBeNull();
    expect(
      within(correlationInteractionRow!).getByText(
        'Participants: app-engineering, protocol-engineering, team-lead'
      )
    ).toBeInTheDocument();
    expect(within(correlationInteractionRow!).getByText('Correlation: corr-workflow-peer-watch')).toBeInTheDocument();
    expect(within(correlationInteractionRow!).getByText('Severity: orange')).toBeInTheDocument();
    expect(within(correlationInteractionRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    const correlationTimelineRow = within(correlationPanel)
      .getByText('Peer watch alert raised')
      .closest('li');
    expect(correlationTimelineRow).not.toBeNull();
    expect(within(correlationTimelineRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(correlationTimelineRow!).getByText('Location: review-zone')).toBeInTheDocument();
    expect(within(correlationTimelineRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(correlationTimelineRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      '/office/overview',
      incidentsUrl,
      workflowUrl,
      correlationUrl
    ]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      await Promise.resolve();
    });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      '/office/overview',
      incidentsUrl,
      workflowUrl,
      correlationUrl,
      '/office/overview',
      incidentsUrl,
      workflowUrl,
      correlationUrl
    ]);
  });

  it('opens a correlation drilldown directly from a workflow incident row', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');

    expect(workflowPanel).not.toBeNull();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', {
        name: 'Inspect workflow incident correlation corr-workflow-peer-watch'
      })
    );

    expect(
      await screen.findByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
    ).toBeInTheDocument();
  });

  it('loads workflow when selecting an agent from the attention queue', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();

    const attentionQueuePanel = screen
      .getByRole('heading', { name: 'Operator attention queue' })
      .closest('section');
    expect(attentionQueuePanel).not.toBeNull();

    fireEvent.click(
      within(attentionQueuePanel!).getByRole('button', { name: /App Engineering Agent/i })
    );
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();
    expect(
      within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')
    ).toBeInTheDocument();
  });

  it('loads the target workflow when selecting a watch topology edge', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const watchTopologyPanel = (
      await screen.findByRole('heading', { name: 'Watch topology' })
    ).closest('section');
    expect(watchTopologyPanel).not.toBeNull();

    fireEvent.click(
      within(watchTopologyPanel!).getByRole('button', {
        name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
      })
    );

    const workflowHeading = await screen.findByRole('heading', {
      name: 'Workflow: Growth Revenue Agent'
    });
    expect(workflowHeading).toBeInTheDocument();
    expect(screen.getByText('Growth workflow queued for lead approval')).toBeInTheDocument();
    const selectedWatchButton = within(watchTopologyPanel!).getByRole('button', {
      name: 'Select target Growth Revenue Agent from Team Lead (lead watch) (selected)'
    });
    expect(selectedWatchButton).toBeInTheDocument();
    expect(selectedWatchButton).toHaveAttribute('aria-pressed', 'true');
    expect(selectedWatchButton).not.toHaveAttribute('aria-current');
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(growthWorkflowUrl);
  });

  it('supports keyboard activation for watch topology target buttons', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    const watchTopologyPanel = (
      await screen.findByRole('heading', { name: 'Watch topology' })
    ).closest('section');
    expect(watchTopologyPanel).not.toBeNull();

    const targetButton = within(watchTopologyPanel!).getByRole('button', {
      name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
    });
    await tabToElement(user, targetButton);
    expect(targetButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('heading', { name: 'Workflow: Growth Revenue Agent' })
    ).toBeInTheDocument();
    expect(screen.getByText('Growth workflow queued for lead approval')).toBeInTheDocument();
    expect(
      within(watchTopologyPanel!).getByRole('button', {
        name: 'Select target Growth Revenue Agent from Team Lead (lead watch) (selected)'
      })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(growthWorkflowUrl);
  });

  it('loads a counterparty workflow when selecting a workflow counterparty token', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Select workflow for growth-revenue' })
    );

    expect(
      await screen.findByRole('heading', { name: 'Workflow: Growth Revenue Agent' })
    ).toBeInTheDocument();
    expect(screen.getByText('Growth workflow queued for lead approval')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(growthWorkflowUrl);
  });

  it('loads a participant workflow when selecting a workflow interaction participant token', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === teamLeadWorkflowUrl) {
        return jsonResponse(teamLeadWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    const interactionRow = within(workflowPanel!).getByText('Lead completed workflow review').closest('li');
    expect(interactionRow).not.toBeNull();

    fireEvent.click(
      within(interactionRow!).getByRole('button', { name: 'Select workflow for team-lead' })
    );

    expect(await screen.findByRole('heading', { name: 'Workflow: Team Lead' })).toBeInTheDocument();
    expect(screen.getByText('Team lead is reviewing the queued growth handoff')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(teamLeadWorkflowUrl);
  });

  it('stops polling and clears selection when a pivoted workflow target returns not found', async () => {
    vi.useFakeTimers();

    let unknownRequests = 0;

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === workflowUrl) {
        return jsonResponse({
          ...workflowFixture,
          counterparty_agent_ids: ['unknown-agent']
        });
      }

      if (url === unknownWorkflowUrl) {
        unknownRequests += 1;
        return jsonResponse(
          {
            error: 'not_found',
            details: 'unknown agent unknown-agent'
          },
          404
        );
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Select workflow for unknown-agent' })
    );
    await flushAsyncWork();

    expect(unknownRequests).toBe(1);
    expect(
      screen.getByText('Select an agent to inspect incidents, interactions, and replay evidence.')
    ).toBeInTheDocument();
    expect(screen.queryByText('unknown agent unknown-agent')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(unknownRequests).toBe(1);
    expect(screen.queryByRole('button', { name: 'Select workflow for unknown-agent' })).not.toBeInTheDocument();
  });

  it('loads a participant workflow when selecting a correlation participant token', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === teamLeadWorkflowUrl) {
        return jsonResponse(teamLeadWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );
    await flushAsyncWork();

    const correlationPanel = screen
      .getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
      .closest('section');
    expect(correlationPanel).not.toBeNull();

    const participantSection = within(correlationPanel!).getByText('Participants').closest('div');
    expect(participantSection).not.toBeNull();

    fireEvent.click(
      within(participantSection!).getByRole('button', { name: 'Select workflow for team-lead' })
    );

    expect(await screen.findByRole('heading', { name: 'Workflow: Team Lead' })).toBeInTheDocument();
    expect(screen.getByText('Team lead is reviewing the queued growth handoff')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(teamLeadWorkflowUrl);
  });

  it('loads a participant workflow when selecting a correlation interaction participant token', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === teamLeadWorkflowUrl) {
        return jsonResponse(teamLeadWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );
    await flushAsyncWork();

    const correlationPanel = screen
      .getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
      .closest('section');
    expect(correlationPanel).not.toBeNull();

    const correlationInteractionRow = within(correlationPanel!)
      .getByText('Lead opened peer watch review')
      .closest('li');
    expect(correlationInteractionRow).not.toBeNull();

    fireEvent.click(
      within(correlationInteractionRow!).getByRole('button', { name: 'Select workflow for team-lead' })
    );

    expect(await screen.findByRole('heading', { name: 'Workflow: Team Lead' })).toBeInTheDocument();
    expect(screen.getByText('Team lead is reviewing the queued growth handoff')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(teamLeadWorkflowUrl);
  });

  it('supports keyboard Tab navigation and Enter/Space activation across evidence controls', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      if (url === teamLeadWorkflowUrl) {
        return jsonResponse(teamLeadWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );

    const workflowPanel = await screen.findByRole('complementary', { name: 'Workflow panel' });

    const workflowCorrelationChip = within(workflowPanel).getByRole('button', {
      name: 'Open correlation corr-workflow-peer-watch'
    });
    await tabToElement(user, workflowCorrelationChip);
    expect(workflowCorrelationChip).toHaveFocus();
    await user.keyboard('[Space]');

    expect(
      await screen.findByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
    ).toBeInTheDocument();

    const correlationPanel = screen.getByRole('region', { name: 'Correlation drilldown' });
    const participantsSection = within(correlationPanel).getByText('Participants').closest('div');
    expect(participantsSection).not.toBeNull();

    const correlationParticipantButton = within(participantsSection!).getByRole('button', {
      name: 'Select workflow for team-lead'
    });
    await tabToElement(user, correlationParticipantButton);
    expect(correlationParticipantButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Workflow: Team Lead' })).toBeInTheDocument();

    const workflowPanelAfterTeamLead = screen.getByRole('complementary', { name: 'Workflow panel' });
    const counterpartySection = within(workflowPanelAfterTeamLead)
      .getByRole('heading', { name: 'Counterparties' })
      .closest('section');
    expect(counterpartySection).not.toBeNull();

    const workflowCounterpartyButton = within(counterpartySection!).getByRole('button', {
      name: 'Select workflow for app-engineering'
    });
    await tabToElement(user, workflowCounterpartyButton);
    expect(workflowCounterpartyButton).toHaveFocus();
    await user.keyboard('[Space]');

    expect(
      await screen.findByRole('heading', { name: 'Workflow: App Engineering Agent' })
    ).toBeInTheDocument();

    const incidentFeedPanel = screen.getByRole('region', { name: 'Global incident feed' });
    const incidentRow = within(incidentFeedPanel)
      .getByText('Revenue handoff is waiting on operator review')
      .closest('li');
    expect(incidentRow).not.toBeNull();

    const incidentCorrelationButton = within(incidentRow!).getByRole('button', {
      name: 'Inspect correlation corr-revenue-handoff'
    });
    await tabToElement(user, incidentCorrelationButton);
    expect(incidentCorrelationButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Correlation: corr-revenue-handoff' })).toBeInTheDocument();

    const incidentWorkflowButton = within(incidentRow!).getByRole('button', {
      name: 'Select workflow for growth-revenue'
    });
    await tabToElement(user, incidentWorkflowButton);
    expect(incidentWorkflowButton).toHaveFocus();
    await user.keyboard('[Space]');

    expect(await screen.findByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        workflowUrl,
        correlationUrl,
        teamLeadWorkflowUrl,
        workflowUrl,
        revenueCorrelationUrl,
        growthWorkflowUrl
      ])
    );
  });

  it('loads workflow when selecting an incident agent from the global incident feed', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const incidentFeedPanel = (
      await screen.findByRole('heading', { name: 'Global incident feed' })
    ).closest('section');
    expect(incidentFeedPanel).not.toBeNull();

    fireEvent.click(
      within(incidentFeedPanel!).getByRole('button', { name: 'Select workflow for growth-revenue' })
    );

    expect(
      await screen.findByRole('heading', { name: 'Workflow: Growth Revenue Agent' })
    ).toBeInTheDocument();
    expect(screen.getByText('Growth workflow queued for lead approval')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(growthWorkflowUrl);
  });

  it('loads workflow when selecting an incident agent from a workflow or correlation incident row', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === growthWorkflowUrl) {
        return jsonResponse(growthWorkflowFixture);
      }

      const response = defaultAppResponse(url);
      if (response) {
        return response;
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    const workflowIncidentRow = within(workflowPanel!)
      .getByText('Protocol escalated stale workflow evidence')
      .closest('li');
    expect(workflowIncidentRow).not.toBeNull();

    fireEvent.click(
      within(workflowIncidentRow!).getByRole('button', {
        name: 'Select workflow for app-engineering (selected)'
      })
    );
    expect(
      within(workflowIncidentRow!).getByRole('button', {
        name: 'Select workflow for app-engineering (selected)'
      })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Workflow: App Engineering Agent' })).toBeInTheDocument();

    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Select workflow for growth-revenue' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Workflow: Growth Revenue Agent' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect correlation corr-revenue-handoff' })
    );
    await flushAsyncWork();

    const correlationPanel = screen
      .getByRole('heading', { name: 'Correlation: corr-revenue-handoff' })
      .closest('section');
    expect(correlationPanel).not.toBeNull();

    const correlationIncidentRow = within(correlationPanel!)
      .getByText('Revenue handoff is waiting on operator review')
      .closest('li');
    expect(correlationIncidentRow).not.toBeNull();

    fireEvent.click(
      within(correlationIncidentRow!).getByRole('button', {
        name: 'Select workflow for growth-revenue (selected)'
      })
    );
    expect(
      within(correlationIncidentRow!).getByRole('button', {
        name: 'Select workflow for growth-revenue (selected)'
      })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(growthWorkflowUrl);
  });

  it('renders an explicit empty state for watch topology when there are no watch edges', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse({
          ...overviewFixture,
          watch_edges: []
        });
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const watchTopologyPanel = (await screen.findByRole('heading', { name: 'Watch topology' })).closest(
      'section'
    );
    expect(watchTopologyPanel).not.toBeNull();
    expect(
      within(watchTopologyPanel!).getByText('No watch relationships in the current overview.')
    ).toBeInTheDocument();
  });

  it('keeps loading the selected workflow after overview refresh removes that agent from the office', async () => {
    vi.useFakeTimers();

    let overviewRequests = 0;
    const removedAgentOverview = {
      ...overviewFixture,
      generated_at: '2026-03-11T00:15:00.000Z',
      summary: {
        ...overviewFixture.summary,
        agent_count: 4,
        blocked_count: 1,
        reboot_recommended_count: 1,
        severity_buckets: {
          normal: 1,
          yellow: 1,
          orange: 2,
          red: 0
        }
      },
      zones: overviewFixture.zones.map((zone) =>
        zone.zone_id === 'desk-app-engineering'
          ? {
              ...zone,
              occupants: []
            }
          : zone
      ),
      watch_edges: overviewFixture.watch_edges.filter((edge) => edge.to_agent_id !== 'app-engineering'),
      agents: overviewFixture.agents.filter((agent) => agent.agent_id !== 'app-engineering')
    };

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        overviewRequests += 1;
        return jsonResponse(overviewRequests === 1 ? overviewFixture : removedAgentOverview);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(workflowFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');
    expect(workflowPanel).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(screen.getByRole('heading', { name: 'Workflow: App Engineering Agent' })).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      '/office/overview',
      incidentsUrl,
      workflowUrl,
      '/office/overview',
      incidentsUrl,
      workflowUrl,
      '/office/overview',
      incidentsUrl,
      workflowUrl
    ]);
  });

  it('shows an explicit note when the selected workflow target is absent from the current office overview', async () => {
    vi.useFakeTimers();

    let overviewRequests = 0;
    const removedAgentOverview = {
      ...overviewFixture,
      generated_at: '2026-03-11T00:15:00.000Z',
      summary: {
        ...overviewFixture.summary,
        agent_count: 4,
        blocked_count: 1,
        reboot_recommended_count: 1,
        severity_buckets: {
          normal: 1,
          yellow: 1,
          orange: 2,
          red: 0
        }
      },
      zones: overviewFixture.zones.map((zone) =>
        zone.zone_id === 'desk-app-engineering'
          ? {
              ...zone,
              occupants: []
            }
          : zone
      ),
      watch_edges: overviewFixture.watch_edges.filter((edge) => edge.to_agent_id !== 'app-engineering'),
      agents: overviewFixture.agents.filter((agent) => agent.agent_id !== 'app-engineering')
    };

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        overviewRequests += 1;
        return jsonResponse(overviewRequests === 1 ? overviewFixture : removedAgentOverview);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(workflowFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });
    await flushAsyncWork();

    const workflowPanel = screen.getByRole('complementary', { name: 'Workflow panel' });
    expect(
      within(workflowPanel).getByText(
        'App Engineering Agent is absent from the current office overview. Workflow evidence remains available, but the office grid and watch topology cannot highlight this agent.'
      )
    ).toBeInTheDocument();
  });

  it('waits for the current overview poll to finish before starting another refresh', async () => {
    vi.useFakeTimers();

    const firstOverview = createDeferred<Response>();
    const secondOverview = createDeferred<Response>();
    const overviewSignals: Array<AbortSignal | null | undefined> = [];
    let overviewRequests = 0;

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);

      if (url === '/office/overview') {
        overviewRequests += 1;
        overviewSignals.push(init?.signal);

        if (overviewRequests === 1) {
          return firstOverview.promise;
        }

        if (overviewRequests === 2) {
          return secondOverview.promise;
        }
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const overviewLoading = screen.getByRole('status');
    expect(overviewLoading).toHaveTextContent('Loading office overview.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(overviewRequests).toBe(1);

    firstOverview.resolve(buildJsonResponse(overviewFixture));
    await flushAsyncWork();

    expect(screen.getByRole('heading', { name: 'Operator Shell' })).toBeInTheDocument();
    expect(screen.getByText('5 agents')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });

    expect(overviewRequests).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(overviewRequests).toBe(2);

    secondOverview.resolve(
      buildJsonResponse({
        ...overviewFixture,
        generated_at: '2026-03-11T00:15:00.000Z',
        summary: {
          ...overviewFixture.summary,
          agent_count: 6
        }
      })
    );

    await flushAsyncWork();

    expect(screen.getByText('6 agents')).toBeInTheDocument();
    expect(screen.getByText('Last refresh: 2026-03-11T00:15:00.000Z')).toBeInTheDocument();
    expect(overviewSignals[0]).toBeInstanceOf(AbortSignal);
    expect(overviewSignals[0]?.aborted).toBe(false);
    expect(overviewSignals[1]).toBeInstanceOf(AbortSignal);
    expect(overviewSignals[1]?.aborted).toBe(false);
  });

  it('waits for the current workflow poll to finish before starting another refresh', async () => {
    vi.useFakeTimers();

    const firstWorkflow = createDeferred<Response>();
    const secondWorkflow = createDeferred<Response>();
    const workflowSignals: Array<AbortSignal | null | undefined> = [];
    let workflowRequests = 0;

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        workflowRequests += 1;
        workflowSignals.push(init?.signal);

        if (workflowRequests === 1) {
          return firstWorkflow.promise;
        }

        if (workflowRequests === 2) {
          return secondWorkflow.promise;
        }
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    expect(screen.getByRole('status')).toHaveTextContent('Loading workflow.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(workflowRequests).toBe(1);

    firstWorkflow.resolve(buildJsonResponse(workflowFixture));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');

    expect(workflowPanel).not.toBeNull();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });

    expect(workflowRequests).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(workflowRequests).toBe(2);

    secondWorkflow.resolve(
      buildJsonResponse({
        ...workflowFixture,
        incidents: [
          {
            ...workflowFixture.incidents[0],
            incident_id: 'evt_workflow_recovered',
            summary: 'Workflow recovered after retry'
          }
        ],
        timeline: [
          {
            ...workflowFixture.timeline[0],
            event_id: 'evt_workflow_recovered_confirmed',
            summary: 'Lead confirmed recovery'
          }
        ]
      })
    );

    await flushAsyncWork();

    expect(screen.getByText('Workflow recovered after retry')).toBeInTheDocument();
    expect(screen.getByText('Lead confirmed recovery')).toBeInTheDocument();
    expect(within(workflowPanel!).queryByText('Protocol escalated stale workflow evidence')).not.toBeInTheDocument();
    expect(workflowSignals[0]).toBeInstanceOf(AbortSignal);
    expect(workflowSignals[0]?.aborted).toBe(false);
    expect(workflowSignals[1]).toBeInstanceOf(AbortSignal);
    expect(workflowSignals[1]?.aborted).toBe(false);
  });

  it('keeps the last good office overview visible when a refresh poll fails after an initial success', async () => {
    vi.useFakeTimers();

    let overviewRequests = 0;

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        overviewRequests += 1;

        if (overviewRequests === 1) {
          return jsonResponse(overviewFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'overview refresh failed'
          },
          500
        );
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();

    expect(screen.getByRole('heading', { name: 'Operator Shell' })).toBeInTheDocument();
    expect(screen.getByText('5 agents')).toBeInTheDocument();
    expect(screen.getByText('Last refresh: 2026-03-11T00:00:00.000Z')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: 'Operator Shell' })).toBeInTheDocument();
    expect(screen.getByText('5 agents')).toBeInTheDocument();
    expect(screen.getByText('Last refresh: 2026-03-11T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.queryByText('Unable to load office overview.')).not.toBeInTheDocument();
  });

  it('keeps the last good workflow slice visible when a refresh poll fails after an initial success', async () => {
    vi.useFakeTimers();

    let workflowRequests = 0;

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        workflowRequests += 1;

        if (workflowRequests === 1) {
          return jsonResponse(workflowFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'workflow refresh failed'
          },
          500
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');

    expect(workflowPanel).not.toBeNull();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Lead completed workflow review')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: 'Workflow: App Engineering Agent' })).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Lead completed workflow review')).toBeInTheDocument();
    expect(within(workflowPanel!).queryByText('Unable to load workflow.')).not.toBeInTheDocument();
  });

  it('keeps last good overview, workflow, incidents, and correlation data visible while showing degraded refresh status', async () => {
    vi.useFakeTimers();

    let overviewRequests = 0;
    let incidentRequests = 0;
    let workflowRequests = 0;
    let correlationRequests = 0;

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        overviewRequests += 1;

        if (overviewRequests === 1) {
          return jsonResponse(overviewFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'overview refresh failed'
          },
          500
        );
      }

      if (url === incidentsUrl) {
        incidentRequests += 1;

        if (incidentRequests === 1) {
          return jsonResponse(incidentFeedFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'incident refresh failed'
          },
          500
        );
      }

      if (url === workflowUrl) {
        workflowRequests += 1;

        if (workflowRequests === 1) {
          return jsonResponse(workflowFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'workflow refresh failed'
          },
          500
        );
      }

      if (url === correlationUrl) {
        correlationRequests += 1;

        if (correlationRequests === 1) {
          return jsonResponse(correlationFixture);
        }

        return jsonResponse(
          {
            error: 'internal_error',
            details: 'correlation refresh failed'
          },
          500
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();
    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');

    expect(workflowPanel).not.toBeNull();
    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );
    await flushAsyncWork();

    const incidentFeedPanel = screen.getByRole('heading', { name: 'Global incident feed' }).closest('section');
    const correlationPanel = screen
      .getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
      .closest('section');

    expect(incidentFeedPanel).not.toBeNull();
    expect(correlationPanel).not.toBeNull();

    expect(screen.getByText('5 agents')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    const incidentFeedRow = within(incidentFeedPanel!)
      .getByText('Revenue handoff is waiting on operator review')
      .closest('li');
    expect(incidentFeedRow).not.toBeNull();
    expect(within(incidentFeedRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(incidentFeedRow!).getByText('Counterparties: team-lead')).toBeInTheDocument();
    expect(within(incidentFeedRow!).getByText('Evidence: /tmp/revenue-handoff.md')).toBeInTheDocument();
    expect(within(correlationPanel!).getByText('Lead opened peer watch review')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      await Promise.resolve();
    });

    expect(screen.getByText('5 agents')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    expect(within(incidentFeedRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(incidentFeedRow!).getByText('Counterparties: team-lead')).toBeInTheDocument();
    expect(within(incidentFeedRow!).getByText('Evidence: /tmp/revenue-handoff.md')).toBeInTheDocument();
    expect(within(correlationPanel!).getByText('Lead opened peer watch review')).toBeInTheDocument();
    expect(
      screen.getByText('Overview refresh degraded. Showing last good data. Reason: overview refresh failed')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Workflow refresh degraded. Showing last good data. Reason: workflow refresh failed')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Incident feed refresh degraded. Showing last good data. Reason: incident refresh failed')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Correlation refresh degraded. Showing last good data. Reason: correlation refresh failed')
    ).toBeInTheDocument();
  });

  it('renders an explicit overview error state', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(
          {
            error: 'internal_error',
            details: 'overview failed'
          },
          500
        );
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const overviewError = await screen.findByRole('alert');
    expect(overviewError).toHaveTextContent('Unable to load office overview.');
    expect(overviewError).toHaveTextContent('overview failed');
  });

  it('renders an explicit incident-feed error state', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(
          {
            error: 'internal_error',
            details: 'incident feed failed'
          },
          500
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const incidentFeedPanel = await screen.findByRole('region', { name: 'Global incident feed' });
    const incidentFeedError = within(incidentFeedPanel).getByRole('alert');
    expect(incidentFeedError).toHaveTextContent('Unable to load incident feed.');
    expect(incidentFeedError).toHaveTextContent('incident feed failed');
    expect(screen.queryByText('No incidents in 60m for the global feed.')).not.toBeInTheDocument();
  });

  it('renders explicit workflow empty states', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse({ items: [] });
      }

      if (url === workflowUrl) {
        return jsonResponse({
          ...workflowFixture,
          detail: {
            ...workflowFixture.detail,
            open_peer_watch_alerts: [],
            recent_events: [],
            recent_handoffs: [],
            recent_reboots: []
          },
          incidents: [],
          interactions: [],
          timeline: [],
          correlation_ids: [],
          counterparty_agent_ids: []
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );

    expect(await screen.findByText('No open peer-watch alerts in this detail slice.')).toBeInTheDocument();
    expect(screen.getByText('No recent events in this detail slice.')).toBeInTheDocument();
    expect(screen.getByText('No recent handoffs in this detail slice.')).toBeInTheDocument();
    expect(screen.getByText('No recent reboots in this detail slice.')).toBeInTheDocument();
    expect(screen.getByText('No incidents in 60m.')).toBeInTheDocument();
    expect(screen.getByText('No interactions in 60m.')).toBeInTheDocument();
    expect(screen.getByText('No timeline events in 60m.')).toBeInTheDocument();
    expect(screen.getByText('No correlation ids in this slice.')).toBeInTheDocument();
    expect(screen.getByText('No counterparties in this slice.')).toBeInTheDocument();
    expect(screen.getByText('No incidents in 60m for the global feed.')).toBeInTheDocument();
  });

  it('renders an explicit empty state for the attention queue when no agents are attention-worthy', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse({
          ...overviewFixture,
          agents: overviewFixture.agents.map((agent) => ({
            ...agent,
            effective_severity: 'normal',
            reboot_recommended: false,
            current_state: 'idle'
          }))
        });
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    const attentionQueuePanel = (
      await screen.findByRole('heading', { name: 'Operator attention queue' })
    ).closest('section');
    expect(attentionQueuePanel).not.toBeNull();
    expect(
      within(attentionQueuePanel!).getByText('No attention-worthy agents in the current overview.')
    ).toBeInTheDocument();
  });

  it('renders an explicit workflow error state for a known agent when the backend returns a problem response', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(
          {
            error: 'internal_error',
            details: 'workflow failed'
          },
          500
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );

    const workflowPanel = await screen.findByRole('complementary', { name: 'Workflow panel' });
    const workflowError = within(workflowPanel).getByRole('alert');
    expect(workflowError).toHaveTextContent('Unable to load workflow.');
    expect(workflowError).toHaveTextContent('workflow failed');
    expect(screen.queryByRole('heading', { name: 'Workflow: App Engineering Agent' })).not.toBeInTheDocument();
    expect(screen.queryByText('No incidents in 60m.')).not.toBeInTheDocument();
  });

  it('renders an explicit correlation error state for a selected correlation id', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(workflowFixture);
      }

      if (url === correlationUrl) {
        return jsonResponse(
          {
            error: 'internal_error',
            details: 'correlation failed'
          },
          500
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );

    const correlationPanel = await screen.findByRole('region', { name: 'Correlation drilldown' });
    const correlationError = within(correlationPanel).getByRole('alert');
    expect(correlationError).toHaveTextContent('Unable to load correlation.');
    expect(correlationError).toHaveTextContent('correlation failed');
    expect(
      screen.queryByText('Select a correlation id from workflow or incident feed.')
    ).not.toBeInTheDocument();
  });

  it('stops polling and clears the selected correlation when it disappears from visible evidence and later returns not found', async () => {
    vi.useFakeTimers();

    let incidentRequests = 0;
    let workflowRequests = 0;
    let correlationRequests = 0;

    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        incidentRequests += 1;

        if (incidentRequests === 1) {
          return jsonResponse(incidentFeedFixture);
        }

        return jsonResponse({
          items: [incidentFeedFixture.items[1]]
        });
      }

      if (url === workflowUrl) {
        workflowRequests += 1;

        if (workflowRequests === 1) {
          return jsonResponse(workflowFixture);
        }

        return jsonResponse({
          ...workflowFixture,
          correlation_ids: ['corr-workflow-review'],
          incidents: [],
          interactions: [],
          timeline: [],
          detail: {
            ...workflowFixture.detail,
            open_peer_watch_alerts: [],
            recent_events: workflowFixture.detail.recent_events.filter(
              (event) => event.correlation_id !== 'corr-workflow-peer-watch'
            ),
            recent_interactions: [],
            recent_incidents: [],
            recent_handoffs: workflowFixture.detail.recent_handoffs.filter(
              (handoff) => handoff.correlation_id !== 'corr-workflow-peer-watch'
            ),
            recent_reboots: workflowFixture.detail.recent_reboots.filter(
              (reboot) => reboot.correlation_id !== 'corr-workflow-peer-watch'
            )
          }
        });
      }

      if (url === correlationUrl) {
        correlationRequests += 1;

        if (correlationRequests < 3) {
          return jsonResponse(correlationFixture);
        }

        return jsonResponse(
          {
            error: 'not_found',
            details: 'unknown correlation corr-workflow-peer-watch'
          },
          404
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    render(<App />);

    await flushAsyncWork();
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();
    fireEvent.click(screen.getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' }));
    await flushAsyncWork();

    expect(correlationRequests).toBe(1);
    expect(screen.getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(correlationRequests).toBe(2);
    expect(
      screen.queryByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(correlationRequests).toBe(3);
    expect(
      screen.getByText('Select a correlation id from workflow or incident feed.')
    ).toBeInTheDocument();
    expect(screen.queryByText('unknown correlation corr-workflow-peer-watch')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });

    expect(correlationRequests).toBe(3);
  });

  it('keeps the selected correlation in error state when it still remains visible in workflow evidence', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(workflowFixture);
      }

      if (url === correlationUrl) {
        return jsonResponse(
          {
            error: 'not_found',
            details: 'unknown correlation corr-workflow-peer-watch'
          },
          404
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );

    const correlationPanel = await screen.findByRole('region', { name: 'Correlation drilldown' });
    const correlationError = within(correlationPanel).getByRole('alert');
    expect(correlationError).toHaveTextContent('Unable to load correlation.');
    expect(correlationError).toHaveTextContent('unknown correlation corr-workflow-peer-watch');
    expect(
      screen.queryByText('Select a correlation id from workflow or incident feed.')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    ).toBeInTheDocument();
  });

  it('keeps a known selected agent in error state when workflow returns not found but the overview still contains that agent', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);

      if (url === '/office/overview') {
        return jsonResponse(overviewFixture);
      }

      if (url === incidentsUrl) {
        return jsonResponse(incidentFeedFixture);
      }

      if (url === workflowUrl) {
        return jsonResponse(
          {
            error: 'not_found',
            details: 'workflow projection missing for app-engineering'
          },
          404
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    });

    const user = userEvent.setup();

    render(<App />);

    await user.click(
      within(await findOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i })
    );

    const workflowPanel = await screen.findByRole('complementary', { name: 'Workflow panel' });
    const workflowError = within(workflowPanel).getByRole('alert');
    expect(workflowError).toHaveTextContent('Unable to load workflow.');
    expect(workflowError).toHaveTextContent('workflow projection missing for app-engineering');
    expect(
      screen.queryByText('Select an agent to inspect incidents, interactions, and replay evidence.')
    ).not.toBeInTheDocument();
  });
});
