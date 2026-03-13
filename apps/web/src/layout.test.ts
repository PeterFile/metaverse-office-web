import { describe, expect, it } from 'vitest';

import { buildZoneLayoutModels } from './layout';
import type { OfficeZone } from './types';

const zones: OfficeZone[] = [
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
    occupants: []
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
    occupants: []
  },
  {
    zone_id: 'desk-growth-revenue',
    label: 'Growth Revenue Desk',
    kind: 'desk',
    grid_x: 5,
    grid_y: 1,
    grid_w: 1,
    grid_h: 1,
    home_agent_id: 'growth-revenue',
    occupants: []
  }
];

describe('buildZoneLayoutModels', () => {
  it('keeps desktop placement canonical and remaps mobile layout into explicit safe spans and order', () => {
    const layout = buildZoneLayoutModels(zones);

    expect(layout.map((zone) => zone.zone.zone_id)).toEqual([
      'lead-desk',
      'desk-app-engineering',
      'desk-growth-revenue',
      'meeting-zone'
    ]);

    expect(layout[0].desktop.gridColumn).toBe('1 / span 2');
    expect(layout[0].desktop.gridRow).toBe('1 / span 1');
    expect(layout[0].mobile.order).toBe(0);
    expect(layout[0].mobile.gridColumn).toBe('1 / -1');

    expect(layout[1].desktop.gridColumn).toBe('5 / span 1');
    expect(layout[1].desktop.gridRow).toBe('2 / span 1');
    expect(layout[1].mobile.order).toBe(1);
    expect(layout[1].mobile.gridColumn).toBe('span 1');

    expect(layout[2].mobile.order).toBe(2);
    expect(layout[2].mobile.gridColumn).toBe('span 1');

    expect(layout[3].mobile.order).toBe(3);
    expect(layout[3].mobile.gridColumn).toBe('1 / -1');
  });
});
