import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const incidentsUrl = '/incidents?limit=10&window=60m';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
const correlationUrl = '/correlations/corr-workflow-peer-watch?limit=10&window=60m';

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
    open_peer_watch_alerts: [],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: []
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

    expect(screen.getByText('Loading office overview.')).toBeInTheDocument();

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
    expect(within(watchTopologyPanel!).getByText('Protocol Engineering Agent -> App Engineering Agent')).toBeInTheDocument();
    expect(within(watchTopologyPanel!).getByText('Mode: peer')).toBeInTheDocument();
    expect(within(watchTopologyPanel!).getByText('Team Lead -> App Engineering Agent')).toBeInTheDocument();
    expect(within(watchTopologyPanel!).getByText('Team Lead -> Growth Revenue Agent')).toBeInTheDocument();
    expect(
      screen.getByText('Select a correlation id from workflow or incident feed.')
    ).toBeInTheDocument();
  });

  it('loads the selected workflow and polls the read-only routes on an interval', async () => {
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
    fireEvent.click(within(getOfficeGrid()).getByRole('button', { name: /App Engineering Agent/i }));
    await flushAsyncWork();

    const workflowPanel = screen
      .getByRole('heading', { name: 'Workflow: App Engineering Agent' })
      .closest('aside');

    expect(workflowPanel).not.toBeNull();
    expect(within(workflowPanel!).getByText('Protocol escalated stale workflow evidence')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Lead completed workflow review')).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('Lead started workflow review')).toBeInTheDocument();
    expect(
      within(workflowPanel!).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    ).toBeInTheDocument();
    expect(
      within(workflowPanel!).getByRole('button', {
        name: 'Inspect workflow incident correlation corr-workflow-peer-watch'
      })
    ).toBeInTheDocument();
    expect(within(workflowPanel!).getByText('protocol-engineering')).toBeInTheDocument();
    const workflowIncidentRow = within(workflowPanel!)
      .getByText('Protocol escalated stale workflow evidence')
      .closest('li');
    expect(workflowIncidentRow).not.toBeNull();
    expect(within(workflowIncidentRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(workflowIncidentRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowIncidentRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    const workflowInteractionRow = within(workflowPanel!)
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

    const workflowTimelineRow = within(workflowPanel!)
      .getByText('Lead started workflow review')
      .closest('li');
    expect(workflowTimelineRow).not.toBeNull();
    expect(within(workflowTimelineRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Location: review-zone')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(workflowTimelineRow!).getByText('Evidence: /tmp/workflow-review-start.md')).toBeInTheDocument();
    fireEvent.click(
      within(workflowPanel!).getByRole('button', { name: 'Open correlation corr-workflow-peer-watch' })
    );
    await flushAsyncWork();

    const correlationPanel = screen
      .getByRole('heading', { name: 'Correlation: corr-workflow-peer-watch' })
      .closest('section');

    expect(correlationPanel).not.toBeNull();
    expect(within(correlationPanel!).getByText('Lead opened peer watch review')).toBeInTheDocument();
    expect(within(correlationPanel!).getByText('Peer watch alert raised')).toBeInTheDocument();
    const correlationIncidentRow = within(correlationPanel!)
      .getByText('Protocol escalated stale workflow evidence')
      .closest('li');
    expect(correlationIncidentRow).not.toBeNull();
    expect(within(correlationIncidentRow!).getByText('Source: controller_event')).toBeInTheDocument();
    expect(within(correlationIncidentRow!).getByText('Counterparties: protocol-engineering')).toBeInTheDocument();
    expect(within(correlationIncidentRow!).getByText('Evidence: /tmp/workflow-peer-watch.md')).toBeInTheDocument();

    const correlationInteractionRow = within(correlationPanel!)
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

    const correlationTimelineRow = within(correlationPanel!)
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

  it('clears a stale selected agent after overview refresh removes it from the office', async () => {
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

    expect(screen.getByRole('heading', { name: 'Workflow: App Engineering Agent' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(
      screen.getByText('Select an agent to inspect incidents, interactions, and replay evidence.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workflow: App Engineering Agent' })).not.toBeInTheDocument();

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
      incidentsUrl
    ]);
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

    expect(screen.getByText('Loading office overview.')).toBeInTheDocument();

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

    expect(screen.getByText('Loading workflow.')).toBeInTheDocument();

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

    expect(await screen.findByText('Unable to load office overview.')).toBeInTheDocument();
    expect(screen.getByText('overview failed')).toBeInTheDocument();
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

    expect(await screen.findByText('No incidents in 60m.')).toBeInTheDocument();
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

    expect(await screen.findByText('Unable to load workflow.')).toBeInTheDocument();
    expect(screen.getByText('workflow failed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workflow: App Engineering Agent' })).not.toBeInTheDocument();
    expect(screen.queryByText('No incidents in 60m.')).not.toBeInTheDocument();
  });
});
