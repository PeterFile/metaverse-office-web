import type { WorldAgent, WorldState } from '../world/types';

import { CHARACTER_KEYS } from './characters';
import { AI_TOWN_GENERATED_MAPS, AI_TOWN_GATEWAYS, AI_TOWN_MAP_BY_ID, DEFAULT_AI_TOWN_MAP_ID, GENTLE_MAP } from './mapData';
import type {
  AiTownSceneModel,
  CharacterKey,
  Facing,
  RolePawnKey,
  ScenePoint,
  SceneWatchEdge,
  SceneZone
} from './types';

const DESK_ANCHORS: ScenePoint[] = [
  { x: 9.5, y: 11.5 },
  { x: 15.5, y: 7.5 },
  { x: 13.5, y: 24.5 },
  { x: 20.5, y: 25.5 },
  { x: 28.5, y: 24.5 },
  { x: 34.5, y: 13.5 },
  { x: 37.5, y: 24.5 },
  { x: 30.5, y: 8.5 }
];

const SHARED_ANCHORS: ScenePoint[] = [
  { x: 14.5, y: 10.5 },
  { x: 31.5, y: 18.5 },
  { x: 16.5, y: 21.5 },
  { x: 26.5, y: 22.5 }
];

const FIXED_SHARED_ZONE_ANCHORS: Record<string, ScenePoint> = {
  'meeting-zone': { x: 20.5, y: 14.5 },
  'review-zone': { x: 17.5, y: 18.5 },
  'rest-zone': { x: 24.5, y: 18.5 },
  'focus-booth': { x: 11.5, y: 15.5 },
  'reboot-zone': { x: 29.5, y: 14.5 },
  'handoff-hub': { x: 21.5, y: 9.5 },
  'war-room': { x: 27.5, y: 9.5 }
};

function hasFixedSharedZoneAnchor(zoneId: string) {
  return Object.hasOwn(FIXED_SHARED_ZONE_ANCHORS, zoneId);
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return hash >>> 0;
}

function compareZoneAssignment(left: SceneZone, right: SceneZone) {
  return (
    left.label.localeCompare(right.label) ||
    left.zoneId.localeCompare(right.zoneId)
  );
}

function assignAnchors(zones: SceneZone[], anchors: ScenePoint[]) {
  return new Map(
    [...zones]
      .sort(compareZoneAssignment)
      .map((zone, index) => [zone.zoneId, anchors[index % anchors.length]])
  );
}

function toPixel(point: ScenePoint) {
  return {
    x: point.x * GENTLE_MAP.tileDim,
    y: point.y * GENTLE_MAP.tileDim
  };
}

function layoutZoneOccupant(anchor: ScenePoint, index: number, total: number): ScenePoint {
  const columns = Math.min(3, Math.max(1, total));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const xOffset = (column - (columns - 1) / 2) * 0.9;
  const yOffset = row * 0.8;

  return {
    x: anchor.x + xOffset,
    y: anchor.y + yOffset
  };
}

function agentFacing(agentId: string): Facing {
  const directions: Facing[] = ['down', 'left', 'right', 'up'];
  return directions[stableHash(agentId) % directions.length];
}

function agentCharacter(agentId: string): CharacterKey {
  return CHARACTER_KEYS[stableHash(agentId) % CHARACTER_KEYS.length];
}

function agentRolePawn(agent: WorldAgent): RolePawnKey | undefined {
  const roleKey = `${agent.agent_id} ${agent.display_name}`.toLowerCase();

  if (agent.kind === 'lead' || roleKey.includes('lead')) {
    return 'lead';
  }
  if (roleKey.includes('protocol')) {
    return 'protocol_eng';
  }
  if (roleKey.includes('tokenomics')) {
    return 'tokenomics';
  }
  if (roleKey.includes('market')) {
    return 'market_intel';
  }
  if (roleKey.includes('product') || roleKey.includes('pmf')) {
    return 'product_pmf';
  }
  if (roleKey.includes('growth')) {
    return 'growth';
  }
  if (roleKey.includes('app')) {
    return 'app_eng';
  }

  return undefined;
}

function agentMapId(agent: WorldAgent) {
  return agent.current_map_id || DEFAULT_AI_TOWN_MAP_ID;
}

function findFallbackZone(agent: WorldAgent, zones: SceneZone[]) {
  const directMatch = zones.find((zone) => zone.zoneId === agent.zone);
  if (directMatch) {
    return directMatch;
  }

  if (agent.raw_location) {
    const rawMatch = zones.find((zone) => zone.zoneId === agent.raw_location);
    if (rawMatch) {
      return rawMatch;
    }
  }

  const homeDeskId = agent.kind === 'lead' ? 'lead-desk' : `desk-${agent.agent_id}`;
  const homeDesk = zones.find((zone) => zone.zoneId === homeDeskId);
  if (homeDesk) {
    return homeDesk;
  }

  return zones.find((zone) => zone.kind === 'shared') ?? zones[0] ?? null;
}

function resolveSharedZoneAnchor(zoneId: string, sharedAssignments: Map<string, ScenePoint>) {
  return hasFixedSharedZoneAnchor(zoneId)
    ? FIXED_SHARED_ZONE_ANCHORS[zoneId]
    : sharedAssignments.get(zoneId) ?? SHARED_ANCHORS[0];
}

export function adaptWorldToScene(
  world: WorldState,
  selectedAgentId: string | null,
  activeCorrelationId: string | null = null,
  correlationParticipantAgentIds: string[] = []
): AiTownSceneModel {
  const map = AI_TOWN_MAP_BY_ID.get(DEFAULT_AI_TOWN_MAP_ID) ?? GENTLE_MAP;
  const sceneZones: SceneZone[] = world.zones.map((zone) => ({
    zoneId: zone.zone_id,
    label: zone.label,
    kind: zone.kind,
    anchor: { x: 0, y: 0 },
    occupantIds: zone.occupant_ids
  }));

  const deskAssignments = assignAnchors(
    sceneZones.filter((zone) => zone.kind === 'desk'),
    DESK_ANCHORS
  );
  const sharedAssignments = assignAnchors(
    sceneZones.filter((zone) => zone.kind === 'shared' && !hasFixedSharedZoneAnchor(zone.zoneId)),
    SHARED_ANCHORS
  );

  const zones = sceneZones.map((zone) => ({
    ...zone,
    anchor:
      zone.kind === 'desk'
        ? deskAssignments.get(zone.zoneId) ?? DESK_ANCHORS[0]
        : resolveSharedZoneAnchor(zone.zoneId, sharedAssignments)
  }));

  const agents = [...world.agents.values()].map((agent) => {
    const zone = findFallbackZone(agent, zones);
    const occupantIds = zone?.occupantIds.includes(agent.agent_id)
      ? zone.occupantIds
      : [...(zone?.occupantIds ?? []), agent.agent_id];
    const occupantIndex = occupantIds.indexOf(agent.agent_id);
    const laidOut =
      zone && occupantIndex >= 0
        ? layoutZoneOccupant(zone.anchor, occupantIndex, occupantIds.length)
        : { x: 20.5, y: 15.5 };

    return {
      agentId: agent.agent_id,
      displayName: agent.display_name,
      kind: agent.kind,
      zoneId: agent.zone,
      mapId: agentMapId(agent),
      position: toPixel(laidOut),
      characterKey: agentCharacter(agent.agent_id),
      rolePawnKey: agentRolePawn(agent),
      facing: agentFacing(agent.agent_id),
      phase: agent.phase,
      severity: agent.severity,
      selected: agent.agent_id === selectedAgentId,
      activeTask: agent.active_task,
      rawLocation: agent.raw_location,
      rebootRecommended: agent.reboot_recommended,
      openAlertCount: agent.open_alert_count,
      hasOpenIncidents: agent.has_open_incidents,
      runtimeFreshnessSeverity: agent.staleness?.severity ?? null,
      sourceEvidenceHealthStatus: agent.source_evidence_health_status ?? null
    };
  });

  const sceneAgentIds = new Set(agents.map((agent) => agent.agentId));
  const visibleCorrelationParticipantAgentIds =
    activeCorrelationId === null
      ? []
      : correlationParticipantAgentIds.filter(
          (agentId, index, list) => sceneAgentIds.has(agentId) && list.indexOf(agentId) === index
        );
  const watchEdges: SceneWatchEdge[] = selectedAgentId
    ? world.watch_edges
        .filter(
          (edge) =>
            (edge.from_agent_id === selectedAgentId || edge.to_agent_id === selectedAgentId) &&
            sceneAgentIds.has(edge.from_agent_id) &&
            sceneAgentIds.has(edge.to_agent_id)
        )
        .map((edge) => ({
          fromAgentId: edge.from_agent_id,
          toAgentId: edge.to_agent_id,
          watchMode: edge.watch_mode,
          riskLevel: edge.risk_level
        }))
    : [];

  return {
    map,
    maps: AI_TOWN_GENERATED_MAPS,
    gateways: AI_TOWN_GATEWAYS,
    zones,
    agents,
    watchEdges,
    selectedAgentId,
    activeCorrelationId,
    correlationParticipantAgentIds: visibleCorrelationParticipantAgentIds,
    pixelWidth: map.pixelWidth ?? map.width * map.tileDim,
    pixelHeight: map.pixelHeight ?? map.height * map.tileDim
  };
}
