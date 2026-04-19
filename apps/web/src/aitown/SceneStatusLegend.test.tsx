import { render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

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

function WorldFixture({ world }: { world: WorldState | null }) {
  const { setWorld } = useWorld();

  useEffect(() => {
    setWorld(world);
  }, [setWorld, world]);

  return <SceneStatusLegend />;
}

function renderLegend(world: WorldState | null) {
  return render(
    <WorldProvider>
      <WorldFixture world={world} />
    </WorldProvider>
  );
}

describe('SceneStatusLegend', () => {
  it('keeps the hot zones section hidden when projected world data is unavailable', () => {
    renderLegend(null);

    expect(screen.getByRole('list', { name: 'Scene status legend' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Hot zones legend' })).not.toBeInTheDocument();
  });

  it('renders live hot zones beneath the badge legend with combined alert/incident copy', async () => {
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

    expect(hotZoneItems[1]).toHaveTextContent('Meeting Zone');
    expect(hotZoneItems[1]).toHaveTextContent('Orange');
    expect(hotZoneItems[1]).toHaveTextContent('1 occupant');
    expect(hotZoneItems[1]).toHaveTextContent('0 blocked');
    expect(hotZoneItems[1]).toHaveTextContent('0 reboot');
    expect(hotZoneItems[1]).toHaveTextContent('1 occupant with open alerts or incidents');

    expect(screen.queryByText('Focus Booth')).not.toBeInTheDocument();
  });
});
