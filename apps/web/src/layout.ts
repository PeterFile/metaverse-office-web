import type { OfficeZone } from './types';

export interface ZoneLayoutModel {
  zone: OfficeZone;
  desktop: {
    gridColumn: string;
    gridRow: string;
  };
  mobile: {
    order: number;
    gridColumn: string;
  };
}

function compareZones(a: OfficeZone, b: OfficeZone) {
  return (
    a.grid_y - b.grid_y ||
    a.grid_x - b.grid_x ||
    b.grid_w - a.grid_w ||
    b.grid_h - a.grid_h ||
    a.zone_id.localeCompare(b.zone_id)
  );
}

function getMobileGridColumn(zone: OfficeZone) {
  if (zone.kind === 'shared' || zone.grid_w > 1 || zone.grid_h > 1) {
    return '1 / -1';
  }

  return 'span 1';
}

export function buildZoneLayoutModels(zones: OfficeZone[]): ZoneLayoutModel[] {
  return [...zones].sort(compareZones).map((zone, index) => ({
    zone,
    desktop: {
      gridColumn: `${zone.grid_x + 1} / span ${zone.grid_w}`,
      gridRow: `${zone.grid_y + 1} / span ${zone.grid_h}`
    },
    mobile: {
      order: index,
      gridColumn: getMobileGridColumn(zone)
    }
  }));
}
