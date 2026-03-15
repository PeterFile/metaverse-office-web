import { useEffect, useRef, useState } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  TilingSprite,
} from 'pixi.js';

import { loadGameAssets } from './AssetLoader';
import type { LoadedAssets } from './AssetLoader';
import { createAgentSprite } from './sprites/AgentSprite';
import type { AgentSprite } from './sprites/AgentSprite';
import { TweenManager } from './systems/TweenManager';
import { LightingSystem } from './systems/LightingSystem';
import { useWorld } from '../context/WorldContext';
import type {
  Severity,
  TrailEntry,
  WatchEdgeSnapshot,
  WorldAgent,
  WorldState,
  ZoneSnapshot,
} from '../world/types';
import type { AgentSpriteMeta } from './sprites/AgentSprite';

const SCENE_PADDING = 60;
const MIN_CELL_SIZE = 40;
const MAX_CELL_SIZE = 280;
const DESK_PROP_SCALE = 1.0;

type GridMetrics = {
  cellW: number;
  cellH: number;
  minX: number;
  minY: number;
  offsetX: number;
  offsetY: number;
};

type ZoneRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ZoneBuildResult = {
  bg: Container;
  props: Sprite[];
  slots: Array<{ x: number; y: number }>;
};

type ZonePropResult = {
  props: Sprite[];
  slots: Array<{ x: number; y: number }>;
  homeAnchor?: { x: number; y: number };
};

type Doorway = {
  side: 'top' | 'bottom' | 'left' | 'right';
  x: number;
  y: number;
  w: number;
  h: number;
};

type RoomPalette = {
  floor: number;
  wall: number;
  outline: number;
  trim: number;
  label: number;
  accent: number;
};

type LayoutCell = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const SEVERITY_COLORS: Record<Severity, number> = {
  normal: 0x34d399,
  yellow: 0xfacc15,
  orange: 0xfb923c,
  red: 0xf87171,
};

const BLUEPRINT_ZONE_CELLS: Record<string, LayoutCell> = {
  'lead-desk': { x: 0, y: 1, w: 4, h: 4 },
  'desk-market-intel': { x: 5, y: 1, w: 3, h: 4 },
  'desk-product-pmf': { x: 9, y: 1, w: 3, h: 4 },
  'desk-tokenomics': { x: 13, y: 1, w: 3, h: 4 },
  'desk-protocol-engineering': { x: 17, y: 1, w: 3, h: 4 },
  'desk-app-engineering': { x: 21, y: 1, w: 3, h: 4 },
  'desk-growth-revenue': { x: 25, y: 1, w: 3, h: 4 },
  'meeting-zone': { x: 0, y: 7, w: 7, h: 6 },
  'review-zone': { x: 8, y: 7, w: 7, h: 5 },
  'rest-zone': { x: 16, y: 7, w: 6, h: 5 },
  'reboot-zone': { x: 23, y: 7, w: 5, h: 5 },
};

const ZONE_SHORT_LABELS: Record<string, string> = {
  'lead-desk': 'LEAD',
  'desk-market-intel': 'MARKET',
  'desk-product-pmf': 'PMF',
  'desk-tokenomics': 'TOKEN',
  'desk-protocol-engineering': 'PROTO',
  'desk-app-engineering': 'APP ENG',
  'desk-growth-revenue': 'GROWTH',
  'meeting-zone': 'MEET',
  'review-zone': 'REVIEW',
  'rest-zone': 'REST',
  'reboot-zone': 'REBOOT',
};

const ZONE_ACCENT_COLORS: Record<string, number> = {
  'lead-desk': 0x38bdf8,
  'desk-market-intel': 0x14b8a6,
  'desk-product-pmf': 0xf59e0b,
  'desk-tokenomics': 0xf97316,
  'desk-protocol-engineering': 0xa78bfa,
  'desk-app-engineering': 0x22c55e,
  'desk-growth-revenue': 0xec4899,
  'meeting-zone': 0x60a5fa,
  'review-zone': 0xc084fc,
  'rest-zone': 0x2dd4bf,
  'reboot-zone': 0xfb7185,
};

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getZoneCell(zone: ZoneSnapshot): LayoutCell {
  return BLUEPRINT_ZONE_CELLS[zone.zone_id] ?? {
    x: zone.grid_x,
    y: zone.grid_y,
    w: zone.grid_w,
    h: zone.grid_h,
  };
}

function toSceneRect(zone: ZoneSnapshot, grid: GridMetrics): ZoneRect {
  const cell = getZoneCell(zone);
  const insetX = 0;
  const insetY = 0;

  return {
    x: grid.offsetX + cell.x * grid.cellW + insetX,
    y: grid.offsetY + cell.y * grid.cellH + insetY,
    w: Math.max(60, cell.w * grid.cellW - insetX * 2),
    h: Math.max(60, cell.h * grid.cellH - insetY * 2),
  };
}

function zoneCenter(zone: ZoneSnapshot, grid: GridMetrics): { x: number; y: number } {
  const rect = toSceneRect(zone, grid);
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  };
}

function isMeetingZone(zone: ZoneSnapshot): boolean {
  const marker = `${zone.zone_id} ${zone.label}`.toLowerCase();
  if (marker.includes('meeting') || marker.includes('collab') || marker.includes('conference')) {
    return true;
  }
  return zone.kind === 'shared';
}

function isReviewZone(zone: ZoneSnapshot): boolean {
  return zone.zone_id.includes('review');
}

function isRestZone(zone: ZoneSnapshot): boolean {
  return zone.zone_id.includes('rest');
}

function isRebootZone(zone: ZoneSnapshot): boolean {
  return zone.zone_id.includes('reboot');
}

function compactLabel(text: string): string {
  const words = text
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !['desk', 'zone', 'agent'].includes(word.toLowerCase()));

  if (words.length === 0) {
    return text.trim().toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => (word.length > 8 ? word.slice(0, 6) : word))
    .join(' ')
    .toUpperCase();
}

function getZoneShortLabel(zone: ZoneSnapshot): string {
  return ZONE_SHORT_LABELS[zone.zone_id] ?? compactLabel(zone.label);
}

function getZoneAccent(zone: ZoneSnapshot): number {
  return ZONE_ACCENT_COLORS[zone.zone_id] ?? ZONE_ACCENT_COLORS['meeting-zone'];
}

function getRoomPalette(zone: ZoneSnapshot): RoomPalette {
  const accent = getZoneAccent(zone);

  if (zone.kind === 'desk') {
    return {
      floor: 0x826c51,
      wall: 0x8a8a8a,
      outline: 0x333333,
      trim: accent,
      label: 0xffffff,
      accent,
    };
  }

  if (isRestZone(zone)) {
    return {
      floor: 0x6e7889,
      wall: 0x665544,
      outline: 0x222222,
      trim: accent,
      label: 0xffffff,
      accent,
    };
  }

  if (isRebootZone(zone)) {
    return {
      floor: 0x5a6351,
      wall: 0x8a8a8a,
      outline: 0x333333,
      trim: accent,
      label: 0xffffff,
      accent,
    };
  }

  if (isReviewZone(zone)) {
    return {
      floor: 0x756b5c,
      wall: 0x8a8a8a,
      outline: 0x333333,
      trim: accent,
      label: 0xffffff,
      accent,
    };
  }

  return {
    floor: 0x8a8174,
    wall: 0x8a8a8a,
    outline: 0x333333,
    trim: accent,
    label: 0xffffff,
    accent,
  };
}

function resolveDoorway(zone: ZoneSnapshot, rect: ZoneRect): Doorway {
  const doorSpan = clamp(Math.round(Math.min(rect.w, rect.h) * 0.24), 28, 44);
  const wallDepth = 8;
  const cell = getZoneCell(zone);

  if (cell.y <= 2) {
    return {
      side: 'bottom',
      x: rect.w * 0.5 - doorSpan * 0.5,
      y: rect.h - wallDepth,
      w: doorSpan,
      h: wallDepth,
    };
  } else if (cell.y === 6 && cell.x > 4) {
    return {
      side: 'top',
      x: rect.w * 0.5 - doorSpan * 0.5,
      y: 0,
      w: doorSpan,
      h: wallDepth,
    };
  } else if (cell.y >= 10) {
    return {
      side: 'top',
      x: rect.w * 0.5 - doorSpan * 0.5,
      y: 0,
      w: doorSpan,
      h: wallDepth,
    };
  } else if (cell.x <= 4 && cell.y >= 4) {
    return {
      side: 'right',
      x: rect.w - wallDepth,
      y: rect.h * 0.25 - doorSpan * 0.5,
      w: wallDepth,
      h: doorSpan,
    };
  }

  return {
    side: 'bottom',
    x: rect.w * 0.5 - doorSpan * 0.5,
    y: rect.h - wallDepth,
    w: doorSpan,
    h: wallDepth,
  };
}

function buildRoomShell(
  background: Container,
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
  palette: RoomPalette,
): Doorway {
  const wallDepth = 8;
  const doorway = resolveDoorway(zone, rect);

  const roomFill = new Graphics();
  roomFill.rect(wallDepth, wallDepth, rect.w - wallDepth * 2, rect.h - wallDepth * 2).fill({ color: palette.floor, alpha: 1 });
  background.addChild(roomFill);

  if (zone.kind !== 'desk') {
    const wall = new Graphics();
    const addWall = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) {
        return;
      }
      wall.rect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h)).fill({ color: palette.wall, alpha: 1 });
      wall.rect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h)).stroke({ color: palette.outline, width: 2, alignment: 0 });
    };

    // Top
    if (doorway.side === 'top') {
      addWall(0, 0, doorway.x, wallDepth);
      addWall(doorway.x + doorway.w, 0, rect.w - doorway.x - doorway.w, wallDepth);
    } else {
      addWall(0, 0, rect.w, wallDepth);
    }

    // Bottom
    if (doorway.side === 'bottom') {
      addWall(0, rect.h - wallDepth, doorway.x, wallDepth);
      addWall(doorway.x + doorway.w, rect.h - wallDepth, rect.w - doorway.x - doorway.w, wallDepth);
    } else {
      addWall(0, rect.h - wallDepth, rect.w, wallDepth);
    }

    // Left
    if (doorway.side === 'left') {
      addWall(0, wallDepth, wallDepth, doorway.y - wallDepth);
      addWall(0, doorway.y + doorway.h, wallDepth, rect.h - wallDepth - doorway.y - doorway.h);
    } else {
      addWall(0, wallDepth, wallDepth, rect.h - wallDepth * 2);
    }

    // Right
    if (doorway.side === 'right') {
      addWall(rect.w - wallDepth, wallDepth, wallDepth, doorway.y - wallDepth);
      addWall(rect.w - wallDepth, doorway.y + doorway.h, wallDepth, rect.h - wallDepth - doorway.y - doorway.h);
    } else {
      addWall(rect.w - wallDepth, wallDepth, wallDepth, rect.h - wallDepth * 2);
    }

    background.addChild(wall);

    const threshold = new Graphics();
    threshold.rect(doorway.x, doorway.y, doorway.w, doorway.h).fill({
      color: palette.floor,
      alpha: 1,
    });
    background.addChild(threshold);
  }

  return doorway;
}

function buildDeskPlaqueText(zone: ZoneSnapshot, agents: Map<string, WorldAgent>): string {
  if (!zone.home_agent_id) {
    return getZoneShortLabel(zone);
  }

  const owner = agents.get(zone.home_agent_id);
  return owner ? compactLabel(owner.display_name) : getZoneShortLabel(zone);
}

function calcGrid(zones: ZoneSnapshot[], screenW: number, screenH: number): GridMetrics {
  if (zones.length === 0) {
    return {
      cellW: 120,
      cellH: 102,
      minX: 0,
      minY: 0,
      offsetX: screenW * 0.5 - 60,
      offsetY: screenH * 0.5 - 50,
    };
  }

  const minX = Math.min(...zones.map((zone) => getZoneCell(zone).x));
  const minY = Math.min(...zones.map((zone) => getZoneCell(zone).y));
  const maxX = Math.max(...zones.map((zone) => getZoneCell(zone).x + getZoneCell(zone).w));
  const maxY = Math.max(...zones.map((zone) => getZoneCell(zone).y + getZoneCell(zone).h));
  const cols = Math.max(1, maxX - minX);
  const rows = Math.max(1, maxY - minY);

  const usableW = Math.max(280, screenW - SCENE_PADDING * 2);
  const usableH = Math.max(220, screenH - SCENE_PADDING * 2);

  const rawCell = Math.floor(Math.min(usableW / cols, usableH / rows));
  const cellW = clamp(rawCell, MIN_CELL_SIZE, MAX_CELL_SIZE);
  const cellH = Math.floor(cellW * 0.84);

  const mapW = cols * cellW;
  const mapH = rows * cellH;

  const offsetX = Math.floor((screenW - mapW) / 2 - minX * cellW);
  const offsetY = Math.floor((screenH - mapH) / 2 - minY * cellH);

  return {
    cellW,
    cellH,
    minX,
    minY,
    offsetX,
    offsetY,
  };
}

function zoneSignature(zones: ZoneSnapshot[], grid: GridMetrics): string {
  const zoneKey = zones
    .map(
      (zone) => {
        const cell = getZoneCell(zone);
        return `${zone.zone_id}:${zone.kind}:${zone.home_agent_id ?? 'none'}:${cell.x}:${cell.y}:${cell.w}:${cell.h}:${zone.occupant_ids.join(',')}`;
      },
    )
    .join('|');
  return `${zoneKey}@${grid.cellW}:${grid.cellH}:${grid.offsetX}:${grid.offsetY}`;
}

function placeSprite(
  list: Sprite[],
  texture: Sprite['texture'] | undefined,
  x: number,
  y: number,
  scale = DESK_PROP_SCALE,
): void {
  if (!texture) {
    return;
  }

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale);
  sprite.position.set(x, y);
  sprite.zIndex = y;
  list.push(sprite);
}

function fillSlots(
  baseSlots: Array<{ x: number; y: number }>,
  rect: ZoneRect,
  total: number,
): Array<{ x: number; y: number }> {
  const slots = [...baseSlots];
  if (slots.length >= total) {
    return slots.slice(0, total);
  }

  while (slots.length < total) {
    const ratio = (slots.length + 1) / (total + 1);
    slots.push({
      x: rect.x + rect.w * ratio,
      y: rect.y + rect.h * 0.82,
    });
  }

  return slots;
}

function buildDeskProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  const props: Sprite[] = [];
  const slots: Array<{ x: number; y: number }> = [];
  const deskTex = assets.interiorTextures['rw_desk.png'];

  const plantTex = assets.interiorTextures['rimworld_plant.png'];

  const occupantCount = Math.max(1, zone.occupant_ids.length);
  const stationCount = Math.min(
    occupantCount,
    rect.w > rect.h * 1.3 || zone.grid_w > 1 ? 2 : 1,
  );
  const laneY = rect.y + rect.h * 0.38;

  for (let i = 0; i < stationCount; i += 1) {
    const ratio = stationCount === 1 ? 0.5 : i === 0 ? 0.3 : 0.7;
    const x = rect.x + rect.w * ratio;

    placeSprite(props, deskTex, x, laneY + 16, DESK_PROP_SCALE * 0.8);

    slots.push({
      x,
      y: laneY + 42,
    });
  }

  if (plantTex) {
    placeSprite(props, plantTex, rect.x + rect.w * 0.85, laneY - 10, 0.12);
  }

  return {
    props,
    slots: fillSlots(slots, rect, occupantCount),
    homeAnchor: slots[0]
      ? {
        x: slots[0].x,
        y: laneY + 18,
      }
      : undefined,
  };
}

function buildMeetingProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  const props: Sprite[] = [];
  const slots: Array<{ x: number; y: number }> = [];
  const tableTex =
    assets.interiorTextures['desk_surface_grey.png'] ?? assets.interiorTextures['cabinet_storage_grey.png'];

  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const tableSegments = clamp(Math.round(rect.w / 155), 1, 3);

  for (let i = 0; i < tableSegments; i += 1) {
    const offset = (i - (tableSegments - 1) / 2) * 44;
    placeSprite(props, tableTex, centerX + offset, centerY + 6, DESK_PROP_SCALE * 1.06);
  }

  const occupantCount = Math.max(1, zone.occupant_ids.length);
  const seatPattern =
    occupantCount === 1
      ? [{ x: centerX, y: centerY + rect.h * 0.2 }]
      : occupantCount === 2
        ? [
          { x: centerX - rect.w * 0.2, y: centerY + rect.h * 0.16 },
          { x: centerX + rect.w * 0.2, y: centerY + rect.h * 0.16 },
        ]
        : [
          { x: centerX - rect.w * 0.22, y: centerY + rect.h * 0.16 },
          { x: centerX, y: centerY + rect.h * 0.22 },
          { x: centerX + rect.w * 0.22, y: centerY + rect.h * 0.16 },
        ];

  slots.push(...fillSlots(seatPattern, rect, occupantCount));

  return { props, slots };
}

function buildReviewProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  const props: Sprite[] = [];
  const slots: Array<{ x: number; y: number }> = [];

  const serverTex = assets.interiorTextures['rw_server.png'];
  const deskTex = assets.interiorTextures['rw_desk.png'];

  placeSprite(props, serverTex, rect.x + 36, rect.y + rect.h * 0.45, DESK_PROP_SCALE * 0.5);
  placeSprite(props, serverTex, rect.x + rect.w - 36, rect.y + rect.h * 0.45, DESK_PROP_SCALE * 0.5);
  placeSprite(props, deskTex, rect.x + rect.w * 0.48, rect.y + rect.h * 0.65, DESK_PROP_SCALE * 0.7);

  const occupantCount = Math.max(1, zone.occupant_ids.length);
  slots.push(
    ...fillSlots(
      [
        { x: rect.x + rect.w * 0.36, y: rect.y + rect.h * 0.78 },
        { x: rect.x + rect.w * 0.62, y: rect.y + rect.h * 0.78 },
      ],
      rect,
      occupantCount,
    ),
  );

  return { props, slots };
}

function buildRestProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  const props: Sprite[] = [];
  const slots: Array<{ x: number; y: number }> = [];

  const bedTex = assets.interiorTextures['rw_bed.png'];

  const bedCount = rect.w > 170 ? 2 : 1;
  for (let i = 0; i < bedCount; i += 1) {
    const ratio = bedCount === 1 ? 0.52 : i === 0 ? 0.34 : 0.72;
    const x = rect.x + rect.w * ratio;
    const y = rect.y + rect.h * 0.56;

    placeSprite(props, bedTex, x, y, DESK_PROP_SCALE * 0.8);
    slots.push({ x, y: rect.y + rect.h * 0.82 });
  }

  return {
    props,
    slots: fillSlots(slots, rect, Math.max(1, zone.occupant_ids.length)),
  };
}

function buildRebootProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  const props: Sprite[] = [];
  const slots: Array<{ x: number; y: number }> = [];

  const serverTex = assets.interiorTextures['rw_server.png'];

  placeSprite(props, serverTex, rect.x + 36, rect.y + rect.h * 0.45, DESK_PROP_SCALE * 0.55);
  placeSprite(props, serverTex, rect.x + rect.w - 36, rect.y + rect.h * 0.45, DESK_PROP_SCALE * 0.55);
  placeSprite(props, serverTex, rect.x + rect.w / 2, rect.y + rect.h * 0.45, DESK_PROP_SCALE * 0.55);

  const occupantCount = Math.max(1, zone.occupant_ids.length);
  slots.push(
    ...fillSlots(
      occupantCount === 1
        ? [{ x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.82 }]
        : [
          { x: rect.x + rect.w * 0.38, y: rect.y + rect.h * 0.82 },
          { x: rect.x + rect.w * 0.62, y: rect.y + rect.h * 0.82 },
        ],
      rect,
      occupantCount,
    ),
  );

  return { props, slots };
}

function buildOpsSharedProps(
  zone: ZoneSnapshot,
  rect: ZoneRect,
  assets: LoadedAssets,
): ZonePropResult {
  if (isMeetingZone(zone) && zone.zone_id === 'meeting-zone') {
    return buildMeetingProps(zone, rect, assets);
  }
  if (isReviewZone(zone)) {
    return buildReviewProps(zone, rect, assets);
  }
  if (isRestZone(zone)) {
    return buildRestProps(zone, rect, assets);
  }
  if (isRebootZone(zone)) {
    return buildRebootProps(zone, rect, assets);
  }

  return buildReviewProps(zone, rect, assets);
}

function buildZoneVisual(
  zone: ZoneSnapshot,
  grid: GridMetrics,
  assets: LoadedAssets,
  agents: Map<string, WorldAgent>,
): ZoneBuildResult {
  const rect = toSceneRect(zone, grid);
  const background = new Container();
  background.position.set(rect.x, rect.y);
  const palette = getRoomPalette(zone);
  const doorway = buildRoomShell(background, zone, rect, assets, palette);

  const label = new Text({
    text: getZoneShortLabel(zone),
    style: new TextStyle({
      fontSize: 22,
      fill: 0xffffff,
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontWeight: '900',
      letterSpacing: 2,
      stroke: { color: 0x000000, width: 4, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.5, blur: 2, distance: 2 }
    }),
    resolution: 4,
  });

  label.anchor.set(0.5, 0);
  label.position.set(rect.w / 2, zone.kind === 'desk' ? -24 : 8);
  label.alpha = 0.95;
  background.addChild(label);

  const props = zone.kind === 'desk' ? buildDeskProps(zone, rect, assets) : buildOpsSharedProps(zone, rect, assets);

  // Removed homeMat to reduce visual stacking

  return {
    bg: background,
    props: props.props,
    slots: props.slots,
  };
}

function drawOfficeBackdrop(graphics: Graphics, zones: ZoneSnapshot[], grid: GridMetrics): void {
  graphics.clear();

  if (zones.length === 0) {
    return;
  }

  let maxX = 0;
  let maxY = 0;
  for (const zone of zones) {
      const cell = getZoneCell(zone);
      maxX = Math.max(maxX, cell.x + cell.w);
      maxY = Math.max(maxY, cell.y + cell.h);
  }

  const facilityMargin = 2;
  const facW = (maxX + facilityMargin * 2) * grid.cellW;
  const facH = (maxY + facilityMargin * 2) * grid.cellH;
  const facX = grid.offsetX - facilityMargin * grid.cellW;
  const facY = grid.offsetY - facilityMargin * grid.cellH;

  const facilityColor = 0x6e7889; // Deep concrete color
  const facilityBorder = 0x5a6373;

  graphics.rect(facX, facY, facW, facH).fill({ color: facilityColor, alpha: 1 });
  graphics.rect(facX, facY, facW, facH).stroke({
    color: facilityBorder,
    width: 6,
    alpha: 1,
    alignment: 0,
  });
}

function agentSlotPixel(zone: ZoneSnapshot, slotIdx: number, total: number, grid: GridMetrics): { x: number; y: number } {
  const rect = toSceneRect(zone, grid);
  const count = Math.max(1, total);
  const cols = clamp(Math.ceil(Math.sqrt(count)), 1, 4);
  const rows = Math.ceil(count / cols);

  const col = slotIdx % cols;
  const row = Math.floor(slotIdx / cols);

  const insetX = Math.min(36, rect.w * 0.22);
  const insetY = Math.min(28, rect.h * 0.2);

  const usableW = Math.max(20, rect.w - insetX * 2);
  const usableH = Math.max(20, rect.h - insetY * 2);

  const stepX = cols === 1 ? 0 : usableW / (cols - 1);
  const stepY = rows === 1 ? 0 : usableH / (rows - 1);

  return {
    x: rect.x + insetX + col * stepX,
    y: rect.y + insetY + row * stepY + 28,
  };
}

function buildAgentMeta(
  agent: WorldAgent,
  currentZone: ZoneSnapshot | undefined,
  homeZone: ZoneSnapshot | undefined,
): AgentSpriteMeta {
  const atHome = Boolean(homeZone && currentZone && homeZone.zone_id === currentZone.zone_id);
  const roleLabel = agent.kind === 'lead' ? 'LEAD' : getZoneShortLabel(homeZone ?? currentZone ?? {
    zone_id: agent.agent_id,
    label: agent.display_name,
    kind: 'desk',
    grid_x: 0,
    grid_y: 0,
    grid_w: 1,
    grid_h: 1,
    occupant_ids: [],
  });

  let locationLabel = 'ROAM';
  if (currentZone) {
    if (atHome) {
      locationLabel = 'HOME';
    } else if (isMeetingZone(currentZone) && currentZone.zone_id === 'meeting-zone') {
      locationLabel = 'MEET';
    } else if (isReviewZone(currentZone)) {
      locationLabel = 'REVIEW';
    } else if (isRestZone(currentZone)) {
      locationLabel = 'REST';
    } else if (isRebootZone(currentZone)) {
      locationLabel = 'REBOOT';
    } else {
      locationLabel = getZoneShortLabel(currentZone);
    }
  }

  return {
    roleLabel,
    locationLabel,
    atHome,
    accentColor: getZoneAccent(homeZone ?? currentZone ?? {
      zone_id: 'meeting-zone',
      label: 'Meeting Zone',
      kind: 'shared',
      grid_x: 0,
      grid_y: 0,
      grid_w: 1,
      grid_h: 1,
      occupant_ids: [],
    }),
  };
}

function drawWatchEdges(
  graphics: Graphics,
  edges: WatchEdgeSnapshot[],
  sprites: Map<string, AgentSprite>,
  selectedAgentId: string | null,
): void {
  graphics.clear();

  for (const edge of edges) {
    const from = sprites.get(edge.from_agent_id);
    const to = sprites.get(edge.to_agent_id);
    if (!from || !to) {
      continue;
    }

    const startX = from.container.x;
    const startY = from.container.y - 24;
    const endX = to.container.x;
    const endY = to.container.y - 24;

    const arcDir = stableHash(`${edge.from_agent_id}:${edge.to_agent_id}`) % 2 === 0 ? 1 : -1;
    const ctrlX = (startX + endX) / 2 + arcDir * clamp(Math.abs(endY - startY) * 0.5, 18, 62);
    const ctrlY = (startY + endY) / 2 - clamp(Math.abs(endX - startX) * 0.22, 18, 74);

    const color = SEVERITY_COLORS[edge.risk_level] ?? 0x60a5fa;
    const highlighted =
      selectedAgentId !== null &&
      (edge.from_agent_id === selectedAgentId || edge.to_agent_id === selectedAgentId);

    const alpha = highlighted ? 0.35 : edge.risk_level === 'normal' ? 0.04 : 0.08;

    graphics.moveTo(startX, startY);
    graphics.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    graphics.stroke({ color, width: highlighted ? 1.5 : 0.8, alpha });

    if (highlighted || edge.risk_level !== 'normal') {
      const direction = Math.atan2(endY - ctrlY, endX - ctrlX);
      const head = highlighted ? 5 : 4;
      const leftX = endX - Math.cos(direction - 0.4) * head;
      const leftY = endY - Math.sin(direction - 0.4) * head;
      const rightX = endX - Math.cos(direction + 0.4) * head;
      const rightY = endY - Math.sin(direction + 0.4) * head;

      graphics.moveTo(endX, endY);
      graphics.lineTo(leftX, leftY);
      graphics.lineTo(rightX, rightY);
      graphics.lineTo(endX, endY);
      graphics.fill({ color, alpha: alpha * 0.6 });
    }
  }
}

function trailPoint(
  entry: TrailEntry,
  index: number,
  total: number,
  anchor: { x: number; y: number },
  zones: Map<string, ZoneSnapshot>,
  grid: GridMetrics,
): { x: number; y: number } {
  if (entry.location) {
    const zone = zones.get(entry.location);
    if (zone) {
      const center = zoneCenter(zone, grid);
      const drift = (index - (total - 1) / 2) * 10;
      return {
        x: center.x + drift,
        y: center.y + 12,
      };
    }
  }

  const angle = -Math.PI / 2 + ((index + 1) / (total + 1)) * Math.PI;
  const radius = 32 + index * 14;
  return {
    x: anchor.x + Math.cos(angle) * radius,
    y: anchor.y + Math.sin(angle) * (radius * 0.62) - 12,
  };
}

function drawEventTrail(
  graphics: Graphics,
  world: WorldState,
  selectedAgentId: string | null,
  sprites: Map<string, AgentSprite>,
  zones: Map<string, ZoneSnapshot>,
  grid: GridMetrics,
): void {
  graphics.clear();

  if (!selectedAgentId) {
    return;
  }

  const selected = world.agents.get(selectedAgentId);
  const selectedSprite = sprites.get(selectedAgentId);
  if (!selected || !selectedSprite || selected.recent_trail.length === 0) {
    return;
  }

  const start = { x: selectedSprite.container.x, y: selectedSprite.container.y - 26 };
  const points = [start];

  for (let i = 0; i < selected.recent_trail.length; i += 1) {
    points.push(trailPoint(selected.recent_trail[i], i, selected.recent_trail.length, start, zones, grid));
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const event = selected.recent_trail[Math.min(i, selected.recent_trail.length - 1)];
    const color = event ? SEVERITY_COLORS[event.severity] : SEVERITY_COLORS.normal;
    const alpha = 0.18 + (i / points.length) * 0.22;

    graphics.moveTo(points[i].x, points[i].y);
    graphics.lineTo(points[i + 1].x, points[i + 1].y);
    graphics.stroke({ color, width: 1.6, alpha });

    graphics.circle(points[i + 1].x, points[i + 1].y, 2.8).fill({ color, alpha: alpha + 0.12 });
  }
}

export function OfficeCanvasRenderer() {
  const [viewportVersion, setViewportVersion] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  const tweenMgr = useRef(new TweenManager());
  const agentSprites = useRef<Map<string, AgentSprite>>(new Map());
  const agentCancels = useRef<Map<string, () => void>>(new Map());

  const assetsRef = useRef<LoadedAssets | null>(null);
  const zoneLayerRef = useRef<Container | null>(null);
  const objectLayerRef = useRef<Container | null>(null);
  const relationGraphicsRef = useRef<Graphics | null>(null);
  const trailGraphicsRef = useRef<Graphics | null>(null);
  const backdropGraphicsRef = useRef<Graphics | null>(null);

  const lightingRef = useRef<LightingSystem | null>(null);
  const floorSpriteRef = useRef<TilingSprite | null>(null);
  const vignetteRef = useRef<Graphics | null>(null);

  const zonePropsRef = useRef<Sprite[]>([]);
  const zoneSlotsRef = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());
  const zoneSignatureRef = useRef('');
  const initializedRef = useRef(false);

  const { world, selectedAgentId, setSelectedAgentId } = useWorld();

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setViewportVersion((value) => value + 1);
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container || initializedRef.current) {
      return;
    }

    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      return;
    }

    initializedRef.current = true;

    const app = new Application();

    let destroyed = false;

    (async () => {
      await app.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (destroyed) {
        try {
          await app.destroy(true);
        } catch {
          // no-op: renderer may be partially initialized while unmounting
        }
        return;
      }

      container.appendChild(app.canvas);
      appRef.current = app;

      const assets = await loadGameAssets();
      if (destroyed) {
        return;
      }

      assetsRef.current = assets;

      const groundLayer = new Container();
      const zoneLayer = new Container();
      const trailLayer = new Container();
      const relationLayer = new Container();
      const objectLayer = new Container();
      objectLayer.sortableChildren = true;
      const lightLayer = new Container();
      const fxLayer = new Container();

      app.stage.addChild(groundLayer, zoneLayer, trailLayer, relationLayer, objectLayer, lightLayer, fxLayer);

      zoneLayerRef.current = zoneLayer;
      objectLayerRef.current = objectLayer;

      const floorTexture = assets.tilesetTextures['dark_vent_tiles.png'] ?? assets.wallAndFloorBase;
      if (floorTexture && floorTexture.width > 1) {
        const floor = new TilingSprite({
          texture: floorTexture,
          width: app.screen.width,
          height: app.screen.height,
        });
        floor.tileScale.set(1.25);
        floor.alpha = 0.24;
        groundLayer.addChild(floor);
        floorSpriteRef.current = floor;
      }

      const vignette = new Graphics();
      groundLayer.addChild(vignette);
      vignetteRef.current = vignette;

      const backdrop = new Graphics();
      groundLayer.addChild(backdrop);
      backdropGraphicsRef.current = backdrop;

      const trailGraphics = new Graphics();
      trailLayer.addChild(trailGraphics);
      trailGraphicsRef.current = trailGraphics;

      const relationGraphics = new Graphics();
      relationLayer.addChild(relationGraphics);
      relationGraphicsRef.current = relationGraphics;

      const lighting = new LightingSystem(app.screen.width, app.screen.height);
      lightLayer.addChild(lighting.lightingLayer);
      fxLayer.addChild(lighting.fxLayer);
      lightingRef.current = lighting;

      app.ticker.add((ticker) => {
        tweenMgr.current.update(ticker);
        for (const sprite of agentSprites.current.values()) {
          sprite.container.zIndex = sprite.container.y;
          sprite.tick(ticker.deltaMS);
        }
      });
    })();

    return () => {
      destroyed = true;
      initializedRef.current = false;

      agentSprites.current.forEach((sprite) => sprite.destroy());
      agentSprites.current.clear();
      agentCancels.current.clear();
      zonePropsRef.current = [];
      zoneSlotsRef.current.clear();

      tweenMgr.current.clear();

      lightingRef.current?.destroy();
      lightingRef.current = null;

      floorSpriteRef.current = null;
      vignetteRef.current = null;

      if (appRef.current) {
        try {
          appRef.current.destroy(true);
        } catch {
          // no-op: renderer may have failed before fully initialized
        }
        appRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const assets = assetsRef.current;
    const zoneLayer = zoneLayerRef.current;
    const objectLayer = objectLayerRef.current;
    const lighting = lightingRef.current;
    const relationGraphics = relationGraphicsRef.current;
    const trailGraphics = trailGraphicsRef.current;
    const backdropGraphics = backdropGraphicsRef.current;

    if (!app || !assets || !zoneLayer || !objectLayer || !world) {
      return;
    }

    if (floorSpriteRef.current) {
      floorSpriteRef.current.width = app.screen.width;
      floorSpriteRef.current.height = app.screen.height;
      floorSpriteRef.current.tilePosition.x = app.screen.width * 0.12;
      floorSpriteRef.current.tilePosition.y = app.screen.height * 0.08;
    }

    if (vignetteRef.current) {
      const vignette = vignetteRef.current;
      vignette.clear();
      vignette.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x566d46, alpha: 1 });
      vignette.rect(6, 6, app.screen.width - 12, app.screen.height - 12).stroke({
        color: 0x485c3b,
        width: 1,
        alpha: 0.28,
      });
    }

    const grid = calcGrid(world.zones, app.screen.width, app.screen.height);

    if (backdropGraphics) {
      drawOfficeBackdrop(backdropGraphics, world.zones, grid);
    }

    const currentZoneSignature = zoneSignature(world.zones, grid);
    if (zoneSignatureRef.current !== currentZoneSignature) {
      zoneSignatureRef.current = currentZoneSignature;

      zoneLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      zonePropsRef.current.forEach((prop) => {
        objectLayer.removeChild(prop);
        prop.destroy();
      });
      zonePropsRef.current = [];
      zoneSlotsRef.current.clear();

      for (const zone of world.zones) {
        const built = buildZoneVisual(zone, grid, assets, world.agents);
        zoneLayer.addChild(built.bg);
        zoneSlotsRef.current.set(zone.zone_id, built.slots);
        for (const prop of built.props) {
          objectLayer.addChild(prop);
          zonePropsRef.current.push(prop);
        }
      }
    }

    const zones = new Map(world.zones.map((zone) => [zone.zone_id, zone]));
    const homeZoneByAgent = new Map<string, ZoneSnapshot>();
    for (const zone of world.zones) {
      if (zone.home_agent_id) {
        homeZoneByAgent.set(zone.home_agent_id, zone);
      }
    }

    const seenAgents = new Set<string>();

    for (const [agentId, agent] of world.agents) {
      seenAgents.add(agentId);

      const zone = zones.get(agent.zone);
      const occupants = zone?.occupant_ids ?? [];
      const slotIdx = Math.max(0, occupants.indexOf(agentId));
      const zoneSlots = zone ? zoneSlotsRef.current.get(zone.zone_id) ?? [] : [];
      const targetPos = zone
        ? zoneSlots[slotIdx] ?? agentSlotPixel(zone, slotIdx, occupants.length, grid)
        : {
          x: app.screen.width * 0.2,
          y: app.screen.height * 0.75,
        };
      const homeZone = homeZoneByAgent.get(agentId);
      const meta = buildAgentMeta(agent, zone, homeZone);

      let sprite = agentSprites.current.get(agentId);

      if (!sprite) {
        sprite = createAgentSprite(agent, assets, meta);
        sprite.container.position.set(targetPos.x, targetPos.y);

        objectLayer.addChild(sprite.container);
        agentSprites.current.set(agentId, sprite);
      }

      sprite.container.removeAllListeners('pointerdown');
      sprite.container.on('pointerdown', () => {
        setSelectedAgentId(selectedAgentId === agentId ? null : agentId);
      });

      const dx = Math.abs(sprite.container.x - targetPos.x);
      const dy = Math.abs(sprite.container.y - targetPos.y);
      if (dx > 3 || dy > 3) {
        agentCancels.current.get(agentId)?.();
        const cancel = tweenMgr.current.moveTo(sprite.container, targetPos.x, targetPos.y, 680);
        agentCancels.current.set(agentId, cancel);
      }

      sprite.sync(agent, meta, app.ticker);
      sprite.setSelected(agentId === selectedAgentId);
    }

    for (const [agentId, sprite] of agentSprites.current) {
      if (seenAgents.has(agentId)) {
        continue;
      }
      sprite.destroy();
      agentSprites.current.delete(agentId);
      agentCancels.current.delete(agentId);
    }

    if (relationGraphics) {
      drawWatchEdges(relationGraphics, world.watch_edges, agentSprites.current, selectedAgentId);
    }

    if (trailGraphics) {
      drawEventTrail(trailGraphics, world, selectedAgentId, agentSprites.current, zones, grid);
    }

    if (lighting) {
      lighting.resize(app.screen.width, app.screen.height);
      lighting.syncAgents(Array.from(world.agents.values()), (id) => {
        const sprite = agentSprites.current.get(id);
        if (!sprite) {
          return null;
        }
        return {
          x: sprite.container.x,
          y: sprite.container.y,
        };
      });
    }
  }, [world, selectedAgentId, setSelectedAgentId, viewportVersion]);

  return (
    <div
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        overflow: 'hidden',
        background: 'transparent',
      }}
    />
  );
}
