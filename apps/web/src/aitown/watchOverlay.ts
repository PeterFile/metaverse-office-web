import type { AiTownSceneModel, ScenePoint, SceneWatchEdge } from './types';

const WATCH_EDGE_ANCHOR_Y_OFFSET = -10;
const DEFAULT_WATCH_EDGE_ENDPOINT_INSET = 14;
const MIN_WATCH_EDGE_SEGMENT_LENGTH = 10;

export interface SceneWatchOverlaySegment {
  fromAgentId: string;
  toAgentId: string;
  start: ScenePoint;
  end: ScenePoint;
  watchMode: SceneWatchEdge['watchMode'];
  riskLevel: SceneWatchEdge['riskLevel'];
}

export function resolveWatchOverlayAgentIds(
  selectedAgentId: string | null,
  watchEdges: SceneWatchEdge[]
) {
  const agentIds = new Set<string>();

  if (!selectedAgentId) {
    return agentIds;
  }

  agentIds.add(selectedAgentId);

  for (const edge of watchEdges) {
    agentIds.add(edge.fromAgentId);
    agentIds.add(edge.toAgentId);
  }

  return agentIds;
}

function resolveWatchAnchor(point: ScenePoint) {
  return {
    x: point.x,
    y: point.y + WATCH_EDGE_ANCHOR_Y_OFFSET
  };
}

function resolveWatchEndpointInset(distance: number) {
  return Math.min(
    DEFAULT_WATCH_EDGE_ENDPOINT_INSET,
    Math.max(0, distance / 2 - MIN_WATCH_EDGE_SEGMENT_LENGTH / 2)
  );
}

export function resolveWatchOverlaySegments(
  scene: Pick<AiTownSceneModel, 'agents' | 'selectedAgentId' | 'watchEdges'>
): SceneWatchOverlaySegment[] {
  if (!scene.selectedAgentId || scene.watchEdges.length === 0) {
    return [];
  }

  const positionsByAgentId = new Map(scene.agents.map((agent) => [agent.agentId, agent.position]));
  const segments: SceneWatchOverlaySegment[] = [];

  for (const edge of scene.watchEdges) {
    const fromPoint = positionsByAgentId.get(edge.fromAgentId);
    const toPoint = positionsByAgentId.get(edge.toAgentId);

    if (!fromPoint || !toPoint) {
      continue;
    }

    const fromAnchor = resolveWatchAnchor(fromPoint);
    const toAnchor = resolveWatchAnchor(toPoint);
    const deltaX = toAnchor.x - fromAnchor.x;
    const deltaY = toAnchor.y - fromAnchor.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (!Number.isFinite(distance) || distance < MIN_WATCH_EDGE_SEGMENT_LENGTH) {
      continue;
    }

    const endpointInset = resolveWatchEndpointInset(distance);

    if (distance < endpointInset * 2) {
      continue;
    }

    const unitX = deltaX / distance;
    const unitY = deltaY / distance;

    segments.push({
      fromAgentId: edge.fromAgentId,
      toAgentId: edge.toAgentId,
      start: {
        x: fromAnchor.x + unitX * endpointInset,
        y: fromAnchor.y + unitY * endpointInset
      },
      end: {
        x: toAnchor.x - unitX * endpointInset,
        y: toAnchor.y - unitY * endpointInset
      },
      watchMode: edge.watchMode,
      riskLevel: edge.riskLevel
    });
  }

  return segments;
}
