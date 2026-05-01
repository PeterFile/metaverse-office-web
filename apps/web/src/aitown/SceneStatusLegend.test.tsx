import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useWorld, WorldProvider } from '../context/WorldContext';
import type { WorldAgent, WorldState, ZoneSnapshot } from '../world/types';
import { SceneStatusLegend } from './SceneStatusLegend';

function makeWorldAgent(overrides: Partial<WorldAgent> = {}): WorldAgent {
  return {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    raw_state: 'coding',
    raw_location: 'desk-app-engineering',
    active_task: 'Implement handlers',
    reboot_recommended: false,
    phase: 'active',
    zone: 'desk-app-engineering',
    severity: 'normal',
    severity_reason: 'reported',
    staleness: null,
    recent_trail: [],
    open_alert_count: 0,
    has_open_incidents: false,
    ...overrides,
  };
}

function makeZoneSnapshot(overrides: Partial<ZoneSnapshot> = {}): ZoneSnapshot {
  return {
    zone_id: 'desk-app-engineering',
    label: 'App Engineering Desk',
    kind: 'desk',
    occupant_ids: [],
    grid_x: 0,
    grid_y: 0,
    grid_w: 1,
    grid_h: 1,
    ...overrides,
  };
}

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    generated_at: '2026-03-14T10:00:00Z',
    projection_ts: '2026-03-14T10:00:00Z',
    agents: new Map(),
    zones: [],
    watch_edges: [],
    incidents: [],
    summary: {
      total_agents: 0,
      blocked_count: 0,
      reboot_count: 0,
      severity_buckets: { normal: 0, yellow: 0, orange: 0, red: 0 },
      highest_severity: 'normal',
    },
    data_quality: {
      overview_available: true,
      workflow_agent_ids: [],
      incident_feed_available: true,
      last_overview_at: '2026-03-14T10:00:00Z',
      degraded_reasons: [],
    },
    ...overrides,
  };
}

function WorldFixture({
  world,
  providedWorld,
  onFocusWorldZone,
}: {
  world: WorldState | null;
  providedWorld?: WorldState | null;
  onFocusWorldZone?: (zoneId: string) => void;
}) {
  const { setWorld } = useWorld();

  useEffect(() => {
    setWorld(world);
  }, [setWorld, world]);

  return <SceneStatusLegend onFocusWorldZone={onFocusWorldZone} world={providedWorld} />;
}

function renderLegend(
  world: WorldState | null,
  onFocusWorldZone?: (zoneId: string) => void,
  providedWorld?: WorldState | null
) {
  return render(
    <WorldProvider>
      <WorldFixture world={world} providedWorld={providedWorld} onFocusWorldZone={onFocusWorldZone} />
    </WorldProvider>
  );
}

describe('SceneStatusLegend', () => {
  it('keeps the hot zones section hidden when projected world data is unavailable', () => {
    renderLegend(null);

    expect(screen.getByRole('list', { name: 'Scene status legend' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Hot zones legend' })).not.toBeInTheDocument();
  });

  it('renders live hot zones beneath the badge legend with combined alert/incident copy and keeps healthy data quality quiet', async () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'a',
          makeWorldAgent({
            agent_id: 'a',
            display_name: 'A',
            zone: 'war-room',
            severity: 'red',
            phase: 'blocked',
            reboot_recommended: true,
            has_open_incidents: true,
            staleness: {
              severity: 'orange',
              stale_for_ms: 120000,
              stale_for_minutes: 2,
              last_meaningful_output_at: '2026-03-14T09:58:00Z',
            },
          }),
        ],
        [
          'b',
          makeWorldAgent({
            agent_id: 'b',
            display_name: 'B',
            zone: 'war-room',
            severity: 'yellow',
            has_open_incidents: true,
          }),
        ],
        [
          'c',
          makeWorldAgent({
            agent_id: 'c',
            display_name: 'C',
            zone: 'meeting-zone',
            severity: 'orange',
            has_open_incidents: true,
          }),
        ],
        ['d', makeWorldAgent({ agent_id: 'd', display_name: 'D', zone: 'focus-booth', severity: 'normal' })],
      ]),
      zones: [
        makeZoneSnapshot({ zone_id: 'war-room', label: 'War Room', kind: 'shared', occupant_ids: ['a', 'b'] }),
        makeZoneSnapshot({ zone_id: 'meeting-zone', label: 'Meeting Zone', kind: 'shared', occupant_ids: ['c'] }),
        makeZoneSnapshot({ zone_id: 'focus-booth', label: 'Focus Booth', kind: 'shared', occupant_ids: ['d'] }),
      ],
    });

    renderLegend(world);

    const hotZoneList = await screen.findByRole('list', { name: 'Hot zones legend' });
    const hotZoneItems = within(hotZoneList).getAllByRole('listitem');

    expect(screen.getByText('Hot zones')).toBeVisible();
    expect(hotZoneItems).toHaveLength(2);

    expect(hotZoneItems[0]).toHaveTextContent('War Room');
    expect(hotZoneItems[0]).toHaveTextContent('Red');
    expect(hotZoneItems[0]).toHaveTextContent('2 occupants');
    expect(hotZoneItems[0]).toHaveTextContent('1 blocked');
    expect(hotZoneItems[0]).toHaveTextContent('1 reboot');
    expect(hotZoneItems[0]).toHaveTextContent('2 occupants with open alerts or incidents');
    expect(hotZoneItems[0]).toHaveTextContent('1 occupant with runtime freshness degraded');

    expect(hotZoneItems[1]).toHaveTextContent('Meeting Zone');
    expect(hotZoneItems[1]).toHaveTextContent('Orange');
    expect(hotZoneItems[1]).toHaveTextContent('1 occupant');
    expect(hotZoneItems[1]).toHaveTextContent('0 blocked');
    expect(hotZoneItems[1]).toHaveTextContent('0 reboot');
    expect(hotZoneItems[1]).toHaveTextContent('1 occupant with open alerts or incidents');
    expect(hotZoneItems[1]).not.toHaveTextContent('runtime freshness degraded');

    expect(screen.queryByRole('list', { name: 'Data quality legend' })).not.toBeInTheDocument();
    expect(screen.queryByText('Data quality')).not.toBeInTheDocument();
    expect(screen.queryByText('Degraded')).not.toBeInTheDocument();
    expect(screen.queryByText('Focus Booth')).not.toBeInTheDocument();
  });

  it('renders stale-only hot zones as focusable viewport entrypoints when world focus is available', async () => {
    const user = userEvent.setup();
    const onFocusWorldZone = vi.fn();
    const world = makeWorldState({
      agents: new Map([
        [
          'stale',
          makeWorldAgent({
            agent_id: 'stale',
            display_name: 'Stale Agent',
            zone: 'stale-pod',
            staleness: {
              severity: 'yellow',
              stale_for_ms: 180000,
              stale_for_minutes: 3,
              last_meaningful_output_at: '2026-03-14T09:57:00Z',
            },
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'stale-pod',
          label: 'Stale Pod',
          kind: 'shared',
          occupant_ids: ['stale'],
        }),
      ],
    });

    renderLegend(world, onFocusWorldZone);

    const staleZoneButton = await screen.findByRole('button', { name: /Stale Pod/ });

    expect(staleZoneButton).toBeVisible();
    expect(staleZoneButton).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 occupant with runtime freshness degraded')
    );
    expect(staleZoneButton).toHaveAttribute('aria-label', expect.stringContaining('Focus in world viewport'));
    expect(staleZoneButton).toHaveTextContent('Stale Pod');
    expect(staleZoneButton).toHaveTextContent('Normal');
    expect(staleZoneButton).toHaveTextContent('1 occupant with runtime freshness degraded');

    await user.click(staleZoneButton);

    expect(onFocusWorldZone).toHaveBeenCalledWith('stale-pod');
  });

  it('prefers an explicitly provided world snapshot over lagging context world data', async () => {
    const contextWorld = makeWorldState({
      agents: new Map([
        [
          'context-agent',
          makeWorldAgent({
            agent_id: 'context-agent',
            display_name: 'Context Agent',
            zone: 'context-zone',
            severity: 'red',
            has_open_incidents: true,
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({ zone_id: 'context-zone', label: 'Context Zone', kind: 'shared', occupant_ids: ['context-agent'] }),
      ],
    });
    const providedWorld = makeWorldState({
      agents: new Map([
        [
          'provided-agent',
          makeWorldAgent({
            agent_id: 'provided-agent',
            display_name: 'Provided Agent',
            zone: 'provided-zone',
            severity: 'orange',
            has_open_incidents: true,
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({ zone_id: 'provided-zone', label: 'Provided Zone', kind: 'shared', occupant_ids: ['provided-agent'] }),
      ],
    });

    renderLegend(contextWorld, undefined, providedWorld);

    const hotZoneList = await screen.findByRole('list', { name: 'Hot zones legend' });
    expect(within(hotZoneList).getByText('Provided Zone')).toBeVisible();
    expect(within(hotZoneList).queryByText('Context Zone')).not.toBeInTheDocument();
  });

  it('renders a degraded data-quality section when evidence coverage is incomplete', async () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'app-engineering',
          makeWorldAgent({
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: ['workflow partial'],
              incident_ids: ['inc-alert', 'inc-active-2'],
              source_kinds: ['controller_event'],
              correlation_ids: ['corr-a', 'corr-b'],
              evidence_refs: ['/tmp/a.md', 'tmux://session/0.1'],
            },
          }),
        ],
        [
          'support-agent',
          makeWorldAgent({
            agent_id: 'support-agent',
            display_name: 'Support Agent',
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: ['workflow partial'],
              incident_ids: ['inc-support'],
              source_kinds: ['controller_event'],
              correlation_ids: [' '],
              evidence_refs: [],
            },
          }),
        ],
      ]),
      data_quality: {
        overview_available: false,
        workflow_agent_ids: ['app-engineering'],
        incident_feed_available: false,
        last_overview_at: '2026-03-14T09:55:00Z',
        degraded_reasons: ['overview unavailable', 'incident feed unavailable', 'workflow partial'],
      },
    });

    renderLegend(world);

    const dataQualityList = await screen.findByRole('list', { name: 'Data quality legend' });
    const items = within(dataQualityList).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Degraded · 3 evidence gaps · last overview 2026-03-14T09:55:00Z · overview unavailable; incident feed unavailable; workflow partial'
    );
    expect(items[1]).toHaveTextContent(
      'Incident-feed backfill · App Engineering Agent · incidents inc-alert, inc-active-2 · sources controller_event · correlations corr-a, corr-b · evidence refs /tmp/a.md, tmux://session/0.1 · workflow partial'
    );
    expect(items[2]).toHaveTextContent(
      'Incident-feed backfill · Support Agent · incidents inc-support · sources controller_event · workflow partial'
    );
    expect(items[2]).not.toHaveTextContent('correlations');
    expect(items[2]).not.toHaveTextContent('evidence refs');
    expect(screen.getByText('Data quality')).toBeVisible();
  });

  it('renders passive incident evidence provenance when projected incidents carry evidence', async () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-alert',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'orange',
          status: 'open',
          summary: 'Peer watch alert',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: 'corr-alert',
          source_kind: 'controller_event',
          evidence_refs: ['/tmp/a.md', 'tmux://session/0.1'],
          counterparty_agent_ids: ['ops-lead'],
        },
      ],
    });

    renderLegend(world);

    const evidenceList = await screen.findByRole('list', { name: 'Incident evidence legend' });
    const items = within(evidenceList).getAllByRole('listitem');

    expect(screen.getByText('Incident evidence')).toBeVisible();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(
      'inc-alert · source controller_event · actor team-lead · correlation corr-alert · evidence /tmp/a.md, tmux://session/0.1 · counterparties ops-lead'
    );
  });

  it('renders bounded incident evidence overflow copy with correct plurals', async () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-overflow',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'orange',
          status: 'open',
          summary: 'Overflow provenance',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: 'corr-overflow',
          source_kind: 'controller_event',
          evidence_refs: ['ref-1', 'ref-2', 'ref-3', 'ref-4', 'ref-5'],
          counterparty_agent_ids: ['agent-a', 'agent-b', 'agent-c', 'agent-d', 'agent-e'],
        },
      ],
    });

    renderLegend(world);

    const evidenceList = await screen.findByRole('list', { name: 'Incident evidence legend' });
    const items = within(evidenceList).getAllByRole('listitem');

    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(
      'inc-overflow · source controller_event · actor team-lead · correlation corr-overflow · evidence ref-1, ref-2, ref-3 (+2 more evidence refs) · counterparties agent-a, agent-b, agent-c (+2 more counterparties)'
    );
    expect(items[0]).not.toHaveTextContent('counterpartys');
  });

  it('keeps incident evidence before hot-zone actions so passive provenance does not lift focus buttons', async () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'app-engineering',
          makeWorldAgent({
            zone: 'meeting-zone',
            severity: 'yellow',
            has_open_incidents: true,
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'meeting-zone',
          label: 'Meeting Zone',
          occupant_ids: ['app-engineering'],
        }),
      ],
      incidents: [
        {
          incident_id: 'inc-alert',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'yellow',
          status: 'open',
          summary: 'Peer watch alert',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: 'corr-alert',
          source_kind: 'controller_event',
          evidence_refs: ['/tmp/a.md'],
          counterparty_agent_ids: ['ops-lead'],
        },
      ],
    });

    renderLegend(world, vi.fn());

    const incidentTitle = await screen.findByText('Incident evidence');
    const hotZonesTitle = await screen.findByText('Hot zones');
    expect(incidentTitle.compareDocumentPosition(hotZonesTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: /Meeting Zone/ })).toBeVisible();
  });

  it('keeps incident evidence provenance hidden when projected incidents have no evidence', () => {
    renderLegend(makeWorldState());

    expect(screen.queryByRole('list', { name: 'Incident evidence legend' })).not.toBeInTheDocument();
    expect(screen.queryByText('Incident evidence')).not.toBeInTheDocument();
  });
});
