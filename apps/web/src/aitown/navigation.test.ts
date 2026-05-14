import { describe, expect, it } from 'vitest';

import {
  findTriggeredGateway,
  resolveAgentNavigationRoute,
  resolveGatewayArrival
} from './navigation';
import type { AiTownSceneModel, SceneAgent } from './types';

function makeAgent(overrides: Partial<SceneAgent> = {}): SceneAgent {
  return {
    agentId: 'app-engineering',
    displayName: 'App Engineering Agent',
    kind: 'employee',
    zoneId: 'delivery-desk',
    mapId: 'map-a',
    position: { x: 100, y: 100 },
    characterKey: 'f1',
    rolePawnKey: 'app_eng',
    facing: 'down',
    phase: 'active',
    severity: 'normal',
    selected: true,
    activeTask: 'Move through gateway',
    rawLocation: 'delivery-desk',
    rebootRecommended: false,
    openAlertCount: 0,
    hasOpenIncidents: false,
    ...overrides
  };
}

function makeScene(): AiTownSceneModel {
  const mapA = {
    id: 'map-a',
    label: 'Map A',
    renderMode: 'layered-raster' as const,
    width: 40,
    height: 30,
    pixelWidth: 1280,
    pixelHeight: 960,
    tileSetUrl: '',
    tileSetDimX: 0,
    tileSetDimY: 0,
    tileDim: 32,
    bgTiles: [],
    objectTiles: [],
    animatedSprites: [],
    layerUrls: {
      groundBase: '/assets/generated/maps/map-a/map-a_ground_base.webp',
      dressedRef: '/assets/generated/maps/map-a/map-a_dressed_ref.webp',
      propPack: '/assets/generated/maps/map-a/map-a_prop_pack.webp',
      propsTransparent: '/assets/generated/maps/map-a/map-a_props_transparent.webp',
      collision: '/assets/generated/maps/map-a/map-a_collision.webp',
      regions: '/assets/generated/maps/map-a/map-a_regions.webp',
      preview: '/assets/generated/maps/map-a/map-a_preview.webp'
    },
    ySortProps: []
  };
  const mapB = {
    ...mapA,
    id: 'map-b',
    label: 'Map B',
    layerUrls: {
      groundBase: '/assets/generated/maps/map-b/map-b_ground_base.webp',
      dressedRef: '/assets/generated/maps/map-b/map-b_dressed_ref.webp',
      propPack: '/assets/generated/maps/map-b/map-b_prop_pack.webp',
      propsTransparent: '/assets/generated/maps/map-b/map-b_props_transparent.webp',
      collision: '/assets/generated/maps/map-b/map-b_collision.webp',
      regions: '/assets/generated/maps/map-b/map-b_regions.webp',
      preview: '/assets/generated/maps/map-b/map-b_preview.webp'
    }
  };

  return {
    map: mapA,
    maps: [mapA, mapB],
    gateways: [
      {
        gatewayId: 'map-a-to-map-b',
        label: 'A to B',
        fromMapId: 'map-a',
        toMapId: 'map-b',
        entry: { x: 1180, y: 520 },
        arrival: { x: 120, y: 520 },
        triggerRadius: 34
      }
    ],
    zones: [
      {
        zoneId: 'delivery-desk',
        label: 'Delivery Desk',
        kind: 'desk',
        anchor: { x: 10, y: 10 },
        occupantIds: ['app-engineering']
      },
      {
        zoneId: 'market-hub',
        label: 'Market Hub',
        kind: 'shared',
        anchor: { x: 22, y: 16 },
        occupantIds: []
      }
    ],
    agents: [makeAgent()],
    watchEdges: [],
    selectedAgentId: 'app-engineering',
    activeCorrelationId: null,
    correlationParticipantAgentIds: [],
    pixelWidth: mapA.pixelWidth,
    pixelHeight: mapA.pixelHeight
  };
}

describe('AI Town navigation', () => {
  it('adds same-map zones and outbound gateways to an agent route', () => {
    const scene = makeScene();
    const route = resolveAgentNavigationRoute(scene.agents[0]!, scene);

    expect(route.map((point) => point.kind)).toEqual(['home', 'zone', 'zone', 'gateway-entry']);
    expect(route.at(-1)).toMatchObject({
      kind: 'gateway-entry',
      mapId: 'map-a',
      gatewayId: 'map-a-to-map-b',
      targetMapId: 'map-b',
      x: 1180,
      y: 520
    });
  });

  it('resolves gateway arrival points and trigger radius checks', () => {
    const scene = makeScene();
    const gateway = scene.gateways![0]!;

    expect(resolveGatewayArrival(gateway)).toEqual({
      mapId: 'map-b',
      x: 120,
      y: 520
    });
    expect(findTriggeredGateway('map-a', { x: 1170, y: 520 }, scene.gateways!)).toBe(gateway);
    expect(findTriggeredGateway('map-a', { x: 900, y: 520 }, scene.gateways!)).toBeNull();
  });
});
