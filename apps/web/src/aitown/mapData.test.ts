import { describe, expect, it } from 'vitest';

import {
  AI_TOWN_GENERATED_MAPS,
  AI_TOWN_GATEWAYS,
  DEFAULT_AI_TOWN_MAP_ID
} from './mapData';

const REQUIRED_LAYER_KEYS = [
  'groundBase',
  'dressedRef',
  'propPack',
  'propsTransparent',
  'collision',
  'regions',
  'preview'
] as const;

describe('AI Town generated map data', () => {
  it('uses the generated layered maps as the primary visual baseline', () => {
    expect(DEFAULT_AI_TOWN_MAP_ID).toBe('neon-commercial-district');
    expect(AI_TOWN_GENERATED_MAPS).toHaveLength(11);

    for (const map of AI_TOWN_GENERATED_MAPS) {
      expect(map.renderMode).toBe('layered-raster');
      expect(map.tileSetUrl).not.toContain('/ai-town/assets/');
      expect(map.pixelWidth).toBeGreaterThan(1000);
      expect(map.pixelHeight).toBeGreaterThan(1000);
      expect(map.ySortProps.length).toBeGreaterThan(0);

      for (const layerKey of REQUIRED_LAYER_KEYS) {
        expect(map.layerUrls[layerKey]).toBe(
          `/assets/generated/maps/${map.id}/${map.id}_${layerKey.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}.webp`
        );
      }
    }
  });

  it('defines clear bidirectional gateways between generated maps', () => {
    const mapIds = new Set(AI_TOWN_GENERATED_MAPS.map((map) => map.id));
    const connectedMapIds = new Set<string>();

    for (const gateway of AI_TOWN_GATEWAYS) {
      expect(mapIds.has(gateway.fromMapId)).toBe(true);
      expect(mapIds.has(gateway.toMapId)).toBe(true);
      expect(gateway.fromMapId).not.toBe(gateway.toMapId);
      expect(gateway.entry.x).toBeGreaterThanOrEqual(0);
      expect(gateway.entry.y).toBeGreaterThanOrEqual(0);
      expect(gateway.arrival.x).toBeGreaterThanOrEqual(0);
      expect(gateway.arrival.y).toBeGreaterThanOrEqual(0);
      expect(gateway.triggerRadius).toBeGreaterThan(0);
      connectedMapIds.add(gateway.fromMapId);

      const reverseGateway = AI_TOWN_GATEWAYS.find(
        (candidate) =>
          candidate.fromMapId === gateway.toMapId &&
          candidate.toMapId === gateway.fromMapId &&
          candidate.arrival.x === gateway.entry.x &&
          candidate.arrival.y === gateway.entry.y
      );
      expect(reverseGateway).toBeDefined();
    }

    expect(connectedMapIds).toEqual(mapIds);
  });
});
