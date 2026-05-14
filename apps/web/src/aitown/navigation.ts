import type { AiTownGateway, AiTownSceneModel, SceneAgent, ScenePoint } from './types';

export type AgentNavigationRoutePoint = ScenePoint & {
  kind: 'home' | 'zone' | 'gateway-entry';
  mapId: string;
  gatewayId?: string;
  targetMapId?: string;
};

function routePointKey(point: ScenePoint) {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function zoneAnchorToPixel(zone: AiTownSceneModel['zones'][number], tileDim: number): ScenePoint {
  return {
    x: zone.anchor.x * tileDim,
    y: zone.anchor.y * tileDim
  };
}

export function resolveGatewayArrival(gateway: AiTownGateway) {
  return {
    mapId: gateway.toMapId,
    x: gateway.arrival.x,
    y: gateway.arrival.y
  };
}

export function findTriggeredGateway(
  mapId: string,
  point: ScenePoint,
  gateways: AiTownGateway[]
) {
  return (
    gateways.find(
      (gateway) =>
        gateway.fromMapId === mapId &&
        Math.hypot(gateway.entry.x - point.x, gateway.entry.y - point.y) <= gateway.triggerRadius
    ) ?? null
  );
}

export function resolveAgentNavigationRoute(
  agent: SceneAgent,
  scene: AiTownSceneModel
): AgentNavigationRoutePoint[] {
  const mapId = agent.mapId ?? scene.map.id ?? '';
  const tileDim = scene.map.tileDim;
  const home: AgentNavigationRoutePoint = {
    ...agent.position,
    kind: 'home',
    mapId
  };
  const seen = new Set([routePointKey(home)]);
  const route: AgentNavigationRoutePoint[] = [home];

  for (const zone of scene.zones) {
    const point = zoneAnchorToPixel(zone, tileDim);
    const key = routePointKey(point);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    route.push({
      ...point,
      kind: 'zone',
      mapId
    });
  }

  for (const gateway of scene.gateways ?? []) {
    if (gateway.fromMapId !== mapId) {
      continue;
    }

    const key = routePointKey(gateway.entry);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    route.push({
      ...gateway.entry,
      kind: 'gateway-entry',
      mapId,
      gatewayId: gateway.gatewayId,
      targetMapId: gateway.toMapId
    });
  }

  return route;
}
