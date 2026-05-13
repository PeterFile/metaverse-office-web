import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Application,
  AnimatedSprite,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type Ticker
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';

import { loadAiTownAssets } from './assetLoader';
import type { AiTownSceneModel, Facing, SceneAgent, ScenePoint } from './types';
import {
  DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE,
  DEFAULT_MAX_VIEWPORT_SCALE,
  createViewportInspector,
  moveViewportCornerAfterScreenDrag,
  resolveViewportClampOptions,
  resolveViewportEntryCenter,
  resolveViewportSafeAreaCenterBias,
  resolveViewportScaleBounds,
  resolveViewportWheelGestureDisposition,
  shouldBlockViewportPointerInput,
  shouldDeferViewportPointerGestureToBrowser,
  type ViewportClampPadding,
  type ViewportInputCapabilities,
  type ViewportInspector
} from './viewport';
import { isViewportClampPaddingMutationContributor, resolveViewportClampPadding } from './viewportClampPadding';
import { resolveSceneAgentStatusBadge } from './agentStatusBadge';
import {
  resolveWatchOverlayAgentEmphasisById,
  resolveWatchOverlayCaptionItems,
  resolveWatchOverlaySegments,
  type WatchOverlayAgentEmphasis
} from './watchOverlay';

const SEVERITY_COLORS = {
  normal: 0x8ed16f,
  yellow: 0xf8d34b,
  orange: 0xff9551,
  red: 0xf26767
} as const;

const nameLabelStyle = new TextStyle({
  fontFamily: '"VCR OSD Mono", monospace',
  fontSize: 8,
  fill: 0xffffff,
  stroke: { color: 0x20162a, width: 3, join: 'round' }
});

const statusBadgeStyle = new TextStyle({
  fontFamily: '"VCR OSD Mono", monospace',
  fontSize: 8,
  fill: 0xf9f5d7,
  stroke: { color: 0x20162a, width: 3, join: 'round' }
});

const WATCH_PARTICIPANT_HIGHLIGHT_COLOR = 0xffd785;
const CORRELATION_PARTICIPANT_HIGHLIGHT_COLOR = 0x8be9d5;
const AGENT_MOTION_MAX_FRAMES_PER_SECOND = 12;
const AGENT_MOTION_MAX_DELTA_SECONDS = 0.12;
const AGENT_MOTION_FRAME_INTERVAL_SECONDS = 1 / AGENT_MOTION_MAX_FRAMES_PER_SECOND;
const AGENT_MOTION_RUN_DISTANCE_PX = 128;
const AGENT_MOTION_RUN_SPEED_MULTIPLIER = 1.55;
const AGENT_MOTION_MIN_PATROL_DISTANCE_PX = 48;
const AGENT_MOTION_MAX_WAYPOINT_ADVANCES_PER_FRAME = 4;
const VIEWPORT_DRAG_START_THRESHOLD_PX = 4;

type AgentMotionProfile = {
  seed: number;
  speedPixelsPerSecond: number;
  animationSpeed: number;
  arrivalDistance: number;
};

type AgentSpriteContainer = Container & {
  agentCharacter?: AnimatedSprite;
  agentCharacterTextures?: Record<Facing, Texture[]>;
};

type AgentMotionState = {
  agentId: string;
  container: AgentSpriteContainer;
  homeX: number;
  homeY: number;
  visualX: number;
  visualY: number;
  targetX: number;
  targetY: number;
  route: ScenePoint[];
  routeKey: string;
  routeIndex: number;
  elapsedSeconds: number;
  profile: AgentMotionProfile;
  facing: Facing;
  animationFacing: Facing;
  homeChangedThisFrame: boolean;
};

function resolveWatchModeLabel(watchMode: 'lead' | 'peer') {
  return watchMode === 'lead' ? 'Lead watch' : 'Peer watch';
}

function resolveAgentWorldLabel(displayName: string, fallbackId: string) {
  const cleanedDisplayName = displayName.trim().replace(/\s+agent$/i, '').trim();
  const source = cleanedDisplayName || fallbackId.trim() || 'Agent';
  const [firstToken = 'Agent'] = source.split(/[\s_-]+/).filter(Boolean);

  return firstToken.length > 8 ? firstToken.slice(0, 8) : firstToken;
}

function hashAgentMotionKey(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function deriveAgentMotionUnit(seed: number, salt: number) {
  let value = (seed + Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;

  return (value >>> 0) / 0xffffffff;
}

function resolveAgentAnimationSpeed(agent: SceneAgent) {
  if (agent.phase === 'sleeping') {
    return 0.025;
  }

  if (agent.phase === 'blocked' || agent.phase === 'reboot_recommended' || agent.phase === 'rebooting') {
    return 0.035;
  }

  if (agent.severity === 'red') {
    return 0.045;
  }

  if (agent.phase === 'active' || agent.phase === 'reviewing' || agent.phase === 'handoff_active') {
    return 0.09;
  }

  return 0.07;
}

function resolveAgentMotionProfile(agent: SceneAgent): AgentMotionProfile {
  const seed = hashAgentMotionKey(`${agent.agentId}:${agent.phase}:${agent.severity}`);
  const severitySpeedScale = {
    normal: 1,
    yellow: 0.92,
    orange: 0.76,
    red: 0.52
  }[agent.severity];
  const unit = (salt: number) => deriveAgentMotionUnit(seed, salt);
  const criticalPhase = agent.phase === 'blocked' || agent.phase === 'reboot_recommended' || agent.phase === 'rebooting';
  let speedPixelsPerSecond = 38 + unit(1) * 8;

  if (agent.phase === 'active' || agent.phase === 'reviewing' || agent.phase === 'handoff_active') {
    speedPixelsPerSecond = 56 + unit(1) * 10;
  } else if (agent.phase === 'handoff_pending' || agent.phase === 'handoff_done' || agent.phase === 'recovered') {
    speedPixelsPerSecond = 44 + unit(1) * 8;
  } else if (agent.phase === 'waiting' || agent.phase === 'idle' || agent.phase === 'unknown') {
    speedPixelsPerSecond = 30 + unit(1) * 6;
  } else if (agent.phase === 'sleeping') {
    speedPixelsPerSecond = 12 + unit(1) * 3;
  }

  if (criticalPhase) {
    speedPixelsPerSecond = 20 + unit(1) * 5;
    if (agent.rebootRecommended) {
      speedPixelsPerSecond *= 0.75;
    }
  }

  return {
    seed,
    speedPixelsPerSecond: speedPixelsPerSecond * severitySpeedScale,
    animationSpeed: resolveAgentAnimationSpeed(agent),
    arrivalDistance: 0.25
  };
}

function resolveAgentTravelSpeed(profile: AgentMotionProfile, distanceToTarget: number) {
  return distanceToTarget >= AGENT_MOTION_RUN_DISTANCE_PX
    ? profile.speedPixelsPerSecond * AGENT_MOTION_RUN_SPEED_MULTIPLIER
    : profile.speedPixelsPerSecond;
}

function resolveAgentTravelFacing(deltaX: number, deltaY: number, fallback: Facing): Facing {
  if (Math.hypot(deltaX, deltaY) <= 0.0001) {
    return fallback;
  }

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? 'right' : 'left';
  }

  return deltaY >= 0 ? 'down' : 'up';
}

function syncAgentCharacterAnimation(
  state: AgentMotionState,
  moving: boolean,
  deltaX: number,
  deltaY: number,
  travelSpeed: number
) {
  const character = state.container.agentCharacter;
  const characterTextures = state.container.agentCharacterTextures;

  if (!character || !characterTextures) {
    return;
  }

  const nextFacing = moving ? resolveAgentTravelFacing(deltaX, deltaY, state.facing) : state.facing;
  const textures = characterTextures[nextFacing] ?? characterTextures.down;

  if (state.animationFacing !== nextFacing) {
    character.textures = textures;
    state.animationFacing = nextFacing;
  }

  if (moving) {
    character.animationSpeed =
      travelSpeed >= profileRunSpeedThreshold(state.profile)
        ? Math.max(state.profile.animationSpeed, 0.13)
        : Math.max(state.profile.animationSpeed, 0.08);
    character.play();
    return;
  }

  character.animationSpeed = 0;
  if ('gotoAndStop' in character && typeof character.gotoAndStop === 'function') {
    character.gotoAndStop(1);
  }
}

function profileRunSpeedThreshold(profile: AgentMotionProfile) {
  return profile.speedPixelsPerSecond * AGENT_MOTION_RUN_SPEED_MULTIPLIER * 0.95;
}

function pointsAreClose(left: ScenePoint, right: ScenePoint, tolerance = 0.001) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerance;
}

function routePointKey(point: ScenePoint) {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function serializeAgentMotionRoute(route: ScenePoint[]) {
  return route.map(routePointKey).join('|');
}

function findRouteIndex(route: ScenePoint[], point: ScenePoint) {
  return route.findIndex((candidate) => pointsAreClose(candidate, point));
}

function zoneAnchorToPixel(zone: AiTownSceneModel['zones'][number], tileDim: number): ScenePoint {
  return {
    x: zone.anchor.x * tileDim,
    y: zone.anchor.y * tileDim
  };
}

function compareAgentPatrolCandidates(agent: SceneAgent, left: ScenePoint, right: ScenePoint) {
  const leftScore = deriveAgentMotionUnit(hashAgentMotionKey(`${agent.agentId}:${routePointKey(left)}`), 0);
  const rightScore = deriveAgentMotionUnit(hashAgentMotionKey(`${agent.agentId}:${routePointKey(right)}`), 0);

  return leftScore - rightScore || left.x - right.x || left.y - right.y;
}

function resolveAgentMotionRoute(agent: SceneAgent, scene: AiTownSceneModel): ScenePoint[] {
  const home = { x: agent.position.x, y: agent.position.y };
  const seen = new Set([routePointKey(home)]);
  const candidates: ScenePoint[] = [];

  for (const zone of scene.zones) {
    const candidate = zoneAnchorToPixel(zone, scene.map.tileDim);
    const candidateKey = routePointKey(candidate);
    const distanceFromHome = Math.hypot(candidate.x - home.x, candidate.y - home.y);

    if (seen.has(candidateKey) || distanceFromHome < AGENT_MOTION_MIN_PATROL_DISTANCE_PX) {
      continue;
    }

    seen.add(candidateKey);
    candidates.push(candidate);
  }

  candidates.sort((left, right) => compareAgentPatrolCandidates(agent, left, right));

  return [home, ...candidates.slice(0, 3)];
}

function createAgentMotionState(
  agent: SceneAgent,
  scene: AiTownSceneModel,
  container: AgentSpriteContainer,
  previousState?: AgentMotionState
): AgentMotionState {
  const profile = resolveAgentMotionProfile(agent);
  const route = resolveAgentMotionRoute(agent, scene);
  const routeKey = serializeAgentMotionRoute(route);
  const canReusePreviousState = previousState?.agentId === agent.agentId;
  const homeChangedThisFrame =
    canReusePreviousState && (previousState.homeX !== agent.position.x || previousState.homeY !== agent.position.y);
  const canReuseTarget =
    canReusePreviousState &&
    !homeChangedThisFrame &&
    previousState.routeKey === routeKey &&
    previousState.profile.seed === profile.seed;
  const visualX = canReusePreviousState ? previousState.visualX : agent.position.x;
  const visualY = canReusePreviousState ? previousState.visualY : agent.position.y;
  const initialTarget =
    homeChangedThisFrame || route.length === 1
      ? route[0]
      : canReuseTarget
        ? { x: previousState.targetX, y: previousState.targetY }
        : route[1];
  const initialRouteIndex =
    canReuseTarget
      ? Math.max(0, findRouteIndex(route, initialTarget))
      : homeChangedThisFrame || route.length === 1
        ? 0
        : 1;
  const state = {
    agentId: agent.agentId,
    container,
    homeX: agent.position.x,
    homeY: agent.position.y,
    visualX,
    visualY,
    targetX: initialTarget.x,
    targetY: initialTarget.y,
    route,
    routeKey,
    routeIndex: initialRouteIndex,
    elapsedSeconds: canReusePreviousState ? previousState.elapsedSeconds : 0,
    profile,
    facing: agent.facing,
    animationFacing: agent.facing,
    homeChangedThisFrame
  };

  container.position.set(state.visualX, state.visualY);
  container.zIndex = state.visualY;
  const deltaX = state.targetX - state.visualX;
  const deltaY = state.targetY - state.visualY;
  const distanceToTarget = Math.hypot(deltaX, deltaY);
  syncAgentCharacterAnimation(
    state,
    distanceToTarget > state.profile.arrivalDistance,
    deltaX,
    deltaY,
    resolveAgentTravelSpeed(state.profile, distanceToTarget)
  );

  return state;
}

function advanceAgentMotionWaypoint(state: AgentMotionState) {
  if (state.route.length <= 1) {
    return false;
  }

  for (let attempts = 0; attempts < AGENT_MOTION_MAX_WAYPOINT_ADVANCES_PER_FRAME; attempts += 1) {
    state.routeIndex = (state.routeIndex + 1) % state.route.length;
    const nextTarget = state.route[state.routeIndex];
    state.targetX = nextTarget.x;
    state.targetY = nextTarget.y;

    if (Math.hypot(state.targetX - state.visualX, state.targetY - state.visualY) > state.profile.arrivalDistance) {
      return true;
    }
  }

  return false;
}

function applyAgentMotionFrame(states: AgentMotionState[], deltaSeconds: number) {
  const safeDeltaSeconds = Number.isFinite(deltaSeconds)
    ? Math.min(Math.max(deltaSeconds, 0), AGENT_MOTION_MAX_DELTA_SECONDS)
    : 1 / 60;

  for (const state of states) {
    state.elapsedSeconds += safeDeltaSeconds;
    let deltaX = state.targetX - state.visualX;
    let deltaY = state.targetY - state.visualY;
    let distanceToTarget = Math.hypot(deltaX, deltaY);

    if (distanceToTarget <= state.profile.arrivalDistance) {
      state.visualX = state.targetX;
      state.visualY = state.targetY;
      state.homeChangedThisFrame = false;
      const hasNextWaypoint = advanceAgentMotionWaypoint(state);
      deltaX = state.targetX - state.visualX;
      deltaY = state.targetY - state.visualY;
      distanceToTarget = Math.hypot(deltaX, deltaY);
      state.container.position.set(state.visualX, state.visualY);
      state.container.zIndex = state.visualY;

      if (!hasNextWaypoint || distanceToTarget <= state.profile.arrivalDistance) {
        syncAgentCharacterAnimation(state, false, 0, 0, 0);
        continue;
      }
    }

    const travelSpeed = resolveAgentTravelSpeed(state.profile, distanceToTarget);
    const stepDistance = Math.min(travelSpeed * safeDeltaSeconds, distanceToTarget);
    state.visualX += (deltaX / distanceToTarget) * stepDistance;
    state.visualY += (deltaY / distanceToTarget) * stepDistance;

    const remainingDistance = Math.hypot(state.targetX - state.visualX, state.targetY - state.visualY);
    if (remainingDistance <= state.profile.arrivalDistance) {
      state.visualX = state.targetX;
      state.visualY = state.targetY;
      const hasNextWaypoint = advanceAgentMotionWaypoint(state);
      const nextDeltaX = state.targetX - state.visualX;
      const nextDeltaY = state.targetY - state.visualY;
      const nextDistance = Math.hypot(nextDeltaX, nextDeltaY);
      syncAgentCharacterAnimation(
        state,
        hasNextWaypoint && nextDistance > state.profile.arrivalDistance,
        nextDeltaX,
        nextDeltaY,
        resolveAgentTravelSpeed(state.profile, nextDistance)
      );
    } else {
      syncAgentCharacterAnimation(state, true, deltaX, deltaY, travelSpeed);
    }
    state.homeChangedThisFrame = false;

    state.container.position.set(state.visualX, state.visualY);
    state.container.zIndex = state.visualY;
  }
}

function resolveActiveCorrelationOverlayParticipants(scene: AiTownSceneModel) {
  if (!scene.activeCorrelationId) {
    return [];
  }

  const participantIds = new Set(scene.correlationParticipantAgentIds);

  return scene.agents.filter((agent) => participantIds.has(agent.agentId));
}

function createWatchOverlay(scene: AiTownSceneModel) {
  const container = new Container();
  container.eventMode = 'none';

  for (const segment of resolveWatchOverlaySegments(scene)) {
    const { start, end } = segment;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;
    const lineWidth = segment.watchMode === 'lead' ? 3 : 2;
    const color = SEVERITY_COLORS[segment.riskLevel];
    const alpha = segment.watchMode === 'lead' ? 0.9 : 0.72;
    const arrowSize = Math.min(segment.watchMode === 'lead' ? 8 : 6, Math.max(4, distance / 2));
    const arrowBack = {
      x: end.x - unitX * arrowSize,
      y: end.y - unitY * arrowSize
    };
    const arrowSpread = arrowSize * 0.6;

    const path = new Graphics();
    path.moveTo(start.x, start.y);
    path.lineTo(end.x, end.y);
    path.stroke({
      color: 0x20162a,
      width: lineWidth + 3,
      alpha: 0.32
    });
    path.moveTo(start.x, start.y);
    path.lineTo(end.x, end.y);
    path.stroke({
      color,
      width: lineWidth,
      alpha
    });
    path.moveTo(end.x, end.y);
    path.lineTo(
      arrowBack.x + perpendicularX * arrowSpread,
      arrowBack.y + perpendicularY * arrowSpread
    );
    path.stroke({
      color,
      width: lineWidth,
      alpha
    });
    path.moveTo(end.x, end.y);
    path.lineTo(
      arrowBack.x - perpendicularX * arrowSpread,
      arrowBack.y - perpendicularY * arrowSpread
    );
    path.stroke({
      color,
      width: lineWidth,
      alpha
    });

    const endpoints = new Graphics();
    endpoints.circle(start.x, start.y, segment.watchMode === 'lead' ? 3 : 2.5).fill({
      color,
      alpha: 0.82
    });
    endpoints.circle(end.x, end.y, segment.watchMode === 'lead' ? 4 : 3).fill({
      color,
      alpha: 1
    });
    endpoints.circle(end.x, end.y, segment.watchMode === 'lead' ? 6 : 5).stroke({
      color,
      width: 1,
      alpha: 0.58
    });

    const edgeContainer = new Container();
    edgeContainer.eventMode = 'none';
    edgeContainer.addChild(path, endpoints);
    container.addChild(edgeContainer);
  }

  return container;
}

function buildTileTextures(
  texture: Texture,
  tileDim: number,
  tileSetDimX: number,
  tileSetDimY: number
) {
  const textures: Texture[] = [];
  const columns = Math.floor(tileSetDimX / tileDim);
  const rows = Math.floor(tileSetDimY / tileDim);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      textures.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle(x * tileDim, y * tileDim, tileDim, tileDim)
        })
      );
    }
  }

  return textures;
}

function buildStaticMap(
  scene: AiTownSceneModel,
  tileTexture: Texture,
  animationSheets: Record<string, { animations: Record<string, Texture[]> }>
) {
  const map = scene.map;
  const container = new Container();
  const tileTextures = buildTileTextures(tileTexture, map.tileDim, map.tileSetDimX, map.tileSetDimY);
  const allLayers = [...map.bgTiles, ...map.objectTiles];
  const screenWidth = map.bgTiles[0]?.length ?? 0;
  const screenHeight = map.bgTiles[0]?.[0]?.length ?? 0;

  for (const layer of allLayers) {
    const layerContainer = new Container();

    for (let x = 0; x < screenWidth; x += 1) {
      for (let y = 0; y < screenHeight; y += 1) {
        const tileIndex = layer[x]?.[y] ?? -1;

        if (tileIndex < 0) {
          continue;
        }

        const tile = tileTextures[tileIndex];

        if (!tile) {
          continue;
        }

        const sprite = new Sprite(tile);
        sprite.x = x * map.tileDim;
        sprite.y = y * map.tileDim;
        layerContainer.addChild(sprite);
      }
    }

    container.addChild(layerContainer);
  }

  const animationLayers = new Map<number, Container>();
  for (const sprite of map.animatedSprites) {
    const spritesheet = animationSheets[sprite.sheet];
    const textures = spritesheet?.animations[sprite.animation];

    if (!textures) {
      continue;
    }

    const animation = new AnimatedSprite(textures);
    animation.animationSpeed = 0.1;
    animation.x = sprite.x;
    animation.y = sprite.y;
    animation.width = sprite.w;
    animation.height = sprite.h;
    animation.play();

    const animationLayer = animationLayers.get(sprite.layer) ?? new Container();
    animationLayer.addChild(animation);
    animationLayers.set(sprite.layer, animationLayer);
  }

  for (const [layerIndex, animationLayer] of [...animationLayers.entries()].sort((left, right) => left[0] - right[0])) {
    const insertionIndex = Math.min(layerIndex, container.children.length);
    container.addChildAt(animationLayer, insertionIndex);
  }

  container.eventMode = 'static';
  container.hitArea = new Rectangle(0, 0, scene.pixelWidth, scene.pixelHeight);

  return container;
}

function createAgentStatusBadge(agent: SceneAgent) {
  const badge = resolveSceneAgentStatusBadge(agent);

  if (!badge) {
    return null;
  }

  const container = new Container();
  const background = new Graphics();
  const left = -badge.width / 2;
  const top = -badge.height / 2;

  background.roundRect(left, top, badge.width, badge.height, 5).fill({
    color: agent.selected ? 0x36232c : 0x251a28,
    alpha: 0.94
  });
  background.roundRect(left, top, badge.width, badge.height, 5).stroke({
    color: agent.selected ? 0xffd785 : 0xd7c0a1,
    width: 1,
    alpha: 0.88
  });

  const label = new Text({
    text: badge.text,
    style: statusBadgeStyle,
    resolution: 2
  });
  label.anchor.set(0.5, 0.5);

  container.position.set(badge.offsetX, badge.offsetY);
  container.eventMode = 'none';
  container.addChild(background, label);

  return container;
}

function createAgentSprite(
  agent: SceneAgent,
  emphasis: WatchOverlayAgentEmphasis | 'none',
  correlationHighlighted: boolean,
  onSelect: (agentId: string | null) => void,
  characterTextures: Record<Facing, Texture[]>
) {
  const container = new Container() as AgentSpriteContainer;
  container.position.set(agent.position.x, agent.position.y);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.zIndex = agent.position.y;
  container.hitArea = new Rectangle(-24, -32, 48, 56);
  container.agentCharacterTextures = characterTextures;

  const severityColor = SEVERITY_COLORS[agent.severity];
  const emphasized = emphasis !== 'none';
  const selected = emphasis === 'selected' || agent.selected;
  const auraRadiusX = selected ? 16 : emphasized ? 14 : 13;
  const auraRadiusY = selected ? 9 : emphasized ? 8 : 7;

  const shadow = new Graphics();
  shadow.ellipse(0, 8, 10, 5).fill({ color: 0x000000, alpha: 0.25 });

  const correlationSpotlight = new Graphics();
  if (correlationHighlighted) {
    correlationSpotlight.ellipse(0, 8, selected ? 22 : emphasized ? 21 : 20, selected ? 13 : emphasized ? 12 : 11).fill({
      color: CORRELATION_PARTICIPANT_HIGHLIGHT_COLOR,
      alpha: selected ? 0.14 : emphasized ? 0.16 : 0.2
    });
    correlationSpotlight.ellipse(
      0,
      8,
      selected ? 24.5 : emphasized ? 23.5 : 22.5,
      selected ? 14.5 : emphasized ? 13.5 : 12.5
    ).stroke({
      color: CORRELATION_PARTICIPANT_HIGHLIGHT_COLOR,
      width: selected ? 2 : 1.5,
      alpha: selected ? 0.5 : 0.62
    });
  }

  const aura = new Graphics();
  aura.ellipse(0, 8, auraRadiusX, auraRadiusY).fill({
    color: severityColor,
    alpha: selected ? 0.24 : emphasized ? 0.16 : 0.1
  });
  aura.ellipse(0, 8, auraRadiusX, auraRadiusY).stroke({
    color: severityColor,
    width: selected ? 2 : emphasized ? 1.5 : 1,
    alpha: 0.9
  });

  const emphasisRing = new Graphics();
  if (emphasized) {
    emphasisRing.ellipse(0, 8, selected ? 18 : 15.5, selected ? 10.5 : 8.5).stroke({
      color: WATCH_PARTICIPANT_HIGHLIGHT_COLOR,
      width: selected ? 2 : 1.5,
      alpha: selected ? 0.82 : 0.56
    });
  }

  const character = new AnimatedSprite(characterTextures[agent.facing] ?? characterTextures.down);
  character.anchor.set(0.5, 1);
  character.y = 10;
  character.scale.set(1.1);
  character.animationSpeed = 0;
  if ('gotoAndStop' in character && typeof character.gotoAndStop === 'function') {
    character.gotoAndStop(1);
  }
  container.agentCharacter = character;

  const nameLabel = new Text({
    text: resolveAgentWorldLabel(agent.displayName, agent.agentId),
    style: nameLabelStyle,
    resolution: 2
  });
  nameLabel.anchor.set(0.5, 1);
  nameLabel.y = -12;

  const statusDot = new Graphics();
  statusDot.circle(-22, -18, 3).fill({
    color: severityColor,
    alpha: 1
  });
  const statusBadge = createAgentStatusBadge(agent);

  container.on('pointertap', (event) => {
    event.stopPropagation();
    onSelect(agent.agentId);
  });

  container.addChild(shadow, correlationSpotlight, aura, emphasisRing, character, statusDot, nameLabel);
  if (statusBadge) {
    container.addChild(statusBadge);
  }

  return container;
}

type WorldSceneProps = {
  scene: AiTownSceneModel;
  onSelectAgent: (agentId: string | null) => void;
  resetViewSignal?: number;
  agentFocusRequest?: {
    agentId: string;
    requestId: number;
  } | null;
  zoneFocusRequest?: {
    zoneId: string;
    requestId: number;
  } | null;
  showActiveCorrelationOverlay?: boolean;
};

type CenteredAgentState = {
  agentId: string;
  x: number;
  y: number;
};

type DirectFocusedAgentState = CenteredAgentState & {
  homeX: number;
  homeY: number;
};
type AgentFocusTarget = CenteredAgentState & {
  homeX: number;
  homeY: number;
};

export default function WorldScene({
  scene,
  onSelectAgent,
  resetViewSignal = 0,
  agentFocusRequest = null,
  zoneFocusRequest = null,
  showActiveCorrelationOverlay = true
}: WorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const zoneLayerRef = useRef<Container | null>(null);
  const watchLayerRef = useRef<Container | null>(null);
  const agentLayerRef = useRef<Container | null>(null);
  const agentMotionStatesRef = useRef<AgentMotionState[]>([]);
  const onSelectAgentRef = useRef(onSelectAgent);
  const lastCenteredAgentRef = useRef<CenteredAgentState | null>(null);
  const selectedAgentRef = useRef<CenteredAgentState | null>(null);
  const selectedAgentFollowRef = useRef(false);
  const selectedAgentDirectFocusRef = useRef<DirectFocusedAgentState | null>(null);
  const selectedAgentManualReselectRef = useRef(false);
  const selectedAgentManualReselectEligibleRef = useRef(false);
  const selectedAgentManualReselectLayoutChangedRef = useRef(false);
  const selectedAgentManualReselectGeometryRef = useRef<{
    scale: number;
    clampPadding: ViewportClampPadding;
  } | null>(null);
  const currentSelectedHasWatchOverlayRef = useRef(false);
  const lastSelectionAgentIdRef = useRef<string | null>(null);
  const lastSelectionHadWatchOverlayRef = useRef(false);
  const suppressSelectedAgentFollowResetRef = useRef(false);
  const suppressSceneTapRef = useRef(false);
  const clampPaddingRef = useRef<ViewportClampPadding>({ left: 0, top: 0, right: 0 });
  const viewportInspectorRef = useRef<ViewportInspector | null>(null);
  const resetViewportToContextDefaultRef = useRef<(() => void) | null>(null);
  const appliedResetViewSignalRef = useRef(resetViewSignal);
  const appliedAgentFocusRequestIdRef = useRef<number | null>(null);
  const appliedZoneFocusRequestIdRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const watchOverlayCaptionItems = resolveWatchOverlayCaptionItems(scene);
  const currentSelectedHasWatchOverlay = watchOverlayCaptionItems.length > 0;
  currentSelectedHasWatchOverlayRef.current = currentSelectedHasWatchOverlay;
  const showWatchOverlayCaption = ready && !loadError && watchOverlayCaptionItems.length > 0;
  const selectedSceneAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
  const activeCorrelationOverlayParticipants = resolveActiveCorrelationOverlayParticipants(scene);
  const showSceneCorrelationOverlay =
    showActiveCorrelationOverlay && ready && !loadError && scene.activeCorrelationId !== null;
  selectedAgentRef.current = selectedSceneAgent
    ? {
        agentId: selectedSceneAgent.agentId,
        x: selectedSceneAgent.position.x,
        y: selectedSceneAgent.position.y
      }
    : null;
  const selectedAgentLabel = selectedSceneAgent?.displayName ?? 'Selected agent';

  const moveViewportCenterIntoSafeArea = (viewport: Viewport, x: number, y: number) => {
    const safeAreaCenterBias = resolveViewportSafeAreaCenterBias(
      viewport.scale.x,
      clampPaddingRef.current
    );

    viewport.moveCenter(x + safeAreaCenterBias.x, y + safeAreaCenterBias.y);
  };

  const moveViewportCenterDirectly = (viewport: Viewport, x: number, y: number) => {
    viewport.moveCenter(x, y);
  };

  const snapshotCurrentClampPadding = () => ({
    left: clampPaddingRef.current.left ?? 0,
    top: clampPaddingRef.current.top ?? 0,
    right: clampPaddingRef.current.right ?? 0
  });

  const rememberSelectedAgentState = (selectedAgent: CenteredAgentState) => {
    lastCenteredAgentRef.current = {
      agentId: selectedAgent.agentId,
      x: selectedAgent.x,
      y: selectedAgent.y
    };
  };

  const stopSelectedAgentFollowState = () => {
    selectedAgentFollowRef.current = false;
    selectedAgentDirectFocusRef.current = null;
  };

  const clearSelectedAgentFollowState = () => {
    selectedAgentFollowRef.current = false;
    selectedAgentManualReselectRef.current = false;
    selectedAgentManualReselectEligibleRef.current = false;
    selectedAgentManualReselectLayoutChangedRef.current = false;
    selectedAgentManualReselectGeometryRef.current = null;
    lastCenteredAgentRef.current = null;
    selectedAgentDirectFocusRef.current = null;
  };

  const markSelectedAgentFollowState = (selectedAgent: CenteredAgentState) => {
    selectedAgentFollowRef.current = true;
    selectedAgentDirectFocusRef.current = null;
    selectedAgentManualReselectRef.current = false;
    selectedAgentManualReselectEligibleRef.current = false;
    selectedAgentManualReselectLayoutChangedRef.current = false;
    selectedAgentManualReselectGeometryRef.current = null;
    rememberSelectedAgentState(selectedAgent);
  };

  const markAgentDirectFocusState = (focusTarget: AgentFocusTarget) => {
    selectedAgentFollowRef.current = true;
    selectedAgentManualReselectRef.current = false;
    selectedAgentManualReselectEligibleRef.current = false;
    selectedAgentManualReselectLayoutChangedRef.current = false;
    selectedAgentManualReselectGeometryRef.current = null;
    lastCenteredAgentRef.current = {
      agentId: focusTarget.agentId,
      x: focusTarget.homeX,
      y: focusTarget.homeY
    };
    selectedAgentDirectFocusRef.current = {
      agentId: focusTarget.agentId,
      x: focusTarget.x,
      y: focusTarget.y,
      homeX: focusTarget.homeX,
      homeY: focusTarget.homeY
    };
  };

  const resolveCurrentAgentFocusTarget = (agent: SceneAgent): AgentFocusTarget => {
    const motionState = agentMotionStatesRef.current.find((state) => state.agentId === agent.agentId);
    const motionStateMatchesAgentHome =
      motionState?.homeX === agent.position.x && motionState.homeY === agent.position.y;
    const visualFocusIsCurrent = motionStateMatchesAgentHome && !motionState?.homeChangedThisFrame;
    const visualX = visualFocusIsCurrent ? motionState?.container.x : undefined;
    const visualY = visualFocusIsCurrent ? motionState?.container.y : undefined;

    return {
      agentId: agent.agentId,
      x: typeof visualX === 'number' && Number.isFinite(visualX) ? visualX : agent.position.x,
      y: typeof visualY === 'number' && Number.isFinite(visualY) ? visualY : agent.position.y,
      homeX: agent.position.x,
      homeY: agent.position.y
    };
  };

  const directFocusMatchesCurrentGeometry = (
    directFocus: DirectFocusedAgentState | null,
    selectedAgent: CenteredAgentState
  ) => {
    return (
      !!directFocus &&
      directFocus.agentId === selectedAgent.agentId &&
      directFocus.homeX === selectedAgent.x &&
      directFocus.homeY === selectedAgent.y
    );
  };

  useEffect(() => {
    onSelectAgentRef.current = onSelectAgent;
  }, [onSelectAgent]);

  useLayoutEffect(() => {
    const previousSelectedAgentId = lastSelectionAgentIdRef.current;
    const currentSelectedAgentId = selectedSceneAgent?.agentId ?? null;

    if (previousSelectedAgentId && currentSelectedAgentId === null) {
      selectedAgentDirectFocusRef.current = null;
      if (selectedAgentFollowRef.current) {
        selectedAgentManualReselectRef.current = false;
        selectedAgentManualReselectEligibleRef.current = false;
        selectedAgentManualReselectLayoutChangedRef.current = false;
        selectedAgentManualReselectGeometryRef.current = null;
      } else if (!selectedAgentManualReselectRef.current && viewportRef.current) {
        const manualReselectClampPadding = hostRef.current ? resolveViewportClampPadding(hostRef.current) : clampPaddingRef.current;
        selectedAgentManualReselectRef.current = true;
        selectedAgentManualReselectEligibleRef.current = lastSelectionHadWatchOverlayRef.current;
        selectedAgentManualReselectLayoutChangedRef.current = false;
        selectedAgentManualReselectGeometryRef.current = {
          scale: viewportRef.current.scale.x,
          clampPadding: {
            left: manualReselectClampPadding.left ?? 0,
            top: manualReselectClampPadding.top ?? 0,
            right: manualReselectClampPadding.right ?? 0
          }
        };
      }
    }

    lastSelectionAgentIdRef.current = currentSelectedAgentId;
    lastSelectionHadWatchOverlayRef.current = currentSelectedHasWatchOverlay;
  }, [currentSelectedHasWatchOverlay, selectedSceneAgent?.agentId]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || appRef.current) {
      return undefined;
    }

    setLoadError(null);

    const app = new Application();
    appRef.current = app;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let overlayObserver: MutationObserver | null = null;
    let viewportZoomHandler: (() => void) | null = null;
    let agentMotionTicker: ((ticker: Ticker) => void) | null = null;
    let agentMotionAccumulatorSeconds = 0;
    let activePointerId: number | null = null;
    let activeTouchPointerIds = new Set<number>();
    let initialPointerPosition: { x: number; y: number } | null = null;
    let lastPointerPosition: { x: number; y: number } | null = null;
    let pointerDragged = false;
    let clearActivePointerDrag = (pointerId: number | null | undefined = activePointerId) => {
      if (pointerId !== null && pointerId !== undefined && host.hasPointerCapture(pointerId)) {
        host.releasePointerCapture(pointerId);
      }

      if (pointerDragged) {
        suppressSceneTapRef.current = true;
        window.setTimeout(() => {
          suppressSceneTapRef.current = false;
        }, 0);
      }

      activePointerId = null;
      initialPointerPosition = null;
      lastPointerPosition = null;
      pointerDragged = false;
    };
    let handleHostPointerDown = (_event: PointerEvent) => {};
    let handleHostPointerMove = (_event: PointerEvent) => {};
    let handleHostPointerUp = (_event: PointerEvent) => {};
    const passthroughBrowserZoomShortcut = (event: WheelEvent) => {
      if (
        resolveViewportWheelGestureDisposition({
          ctrlKey: event.ctrlKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ
        }) !== 'browser-default'
      ) {
        return;
      }

      event.stopImmediatePropagation();
    };

    host.addEventListener('wheel', passthroughBrowserZoomShortcut, { passive: false, capture: true });

    void (async () => {
      try {
        await app.init({
          backgroundAlpha: 1,
          backgroundColor: 0x211822,
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1
        });
      } catch (error) {
        if (disposed) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'renderer_init_failed');
        appRef.current = null;
        return;
      }

      if (disposed) {
        try {
          await app.destroy(true);
        } catch {
          // no-op: renderer may be partially initialized while unmounting
        }
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';

      let assets;
      try {
        assets = await loadAiTownAssets();
      } catch (error) {
        if (disposed) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'asset_load_failed');
        try {
          await app.destroy(true);
        } catch {
          // no-op: renderer may be partially initialized while asset load fails
        }
        appRef.current = null;
        return;
      }

      if (disposed) {
        return;
      }

      const viewport = new Viewport({
        screenWidth: host.clientWidth,
        screenHeight: host.clientHeight,
        worldWidth: scene.pixelWidth,
        worldHeight: scene.pixelHeight,
        events: app.renderer.events,
        allowPreserveDragOutside: DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE
      });

      let currentBaseScale = 1;
      let currentMaxScale = DEFAULT_MAX_VIEWPORT_SCALE;

      const resolveViewportInputCapabilities = (): ViewportInputCapabilities => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
          return {};
        }

        return {
          primaryPointerFine: window.matchMedia('(pointer: fine)').matches,
          anyPointerFine: window.matchMedia('(any-pointer: fine)').matches,
          maxTouchPoints: navigator.maxTouchPoints
        };
      };

      const syncViewportConstraints = (hostWidth: number, hostHeight: number, capabilities?: ViewportInputCapabilities) => {
        const clampPadding = resolveViewportClampPadding(host);
        const nextClampPadding: ViewportClampPadding = {
          left: clampPadding.left ?? 0,
          top: clampPadding.top ?? 0,
          right: clampPadding.right ?? 0
        };
        clampPaddingRef.current = nextClampPadding;
        (viewport as Viewport & { clampPadding?: ViewportClampPadding }).clampPadding = nextClampPadding;
        const { minScale, maxScale } = resolveViewportScaleBounds(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          DEFAULT_MAX_VIEWPORT_SCALE,
          capabilities
        );
        viewport.plugins.remove('clamp-zoom');
        viewport.clampZoom({ minScale, maxScale });
        viewport.plugins.remove('clamp');
        viewport.clamp({
          ...resolveViewportClampOptions(
            scene.pixelWidth,
            scene.pixelHeight,
            hostWidth,
            hostHeight,
            viewport.scale.x,
            clampPadding
          ),
          underflow: 'center'
        });

        currentBaseScale = minScale;
        currentMaxScale = maxScale;
        return { minScale, maxScale };
      };

      handleHostPointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          activeTouchPointerIds.add(event.pointerId);
        }

        if (shouldBlockViewportPointerInput(event.pointerType)) {
          return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        if (shouldDeferViewportPointerGestureToBrowser(event.pointerType, activeTouchPointerIds.size)) {
          clearActivePointerDrag();
          return;
        }

        activePointerId = event.pointerId;
        initialPointerPosition = { x: event.clientX, y: event.clientY };
        lastPointerPosition = initialPointerPosition;
        pointerDragged = false;
      };

      handleHostPointerMove = (event: PointerEvent) => {
        if (shouldDeferViewportPointerGestureToBrowser(event.pointerType, activeTouchPointerIds.size)) {
          return;
        }

        if (activePointerId !== event.pointerId || !lastPointerPosition) {
          return;
        }

        if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
          clearActivePointerDrag(event.pointerId);
          return;
        }

        const nextPosition = { x: event.clientX, y: event.clientY };
        const deltaX = nextPosition.x - lastPointerPosition.x;
        const deltaY = nextPosition.y - lastPointerPosition.y;
        const totalDeltaX = nextPosition.x - (initialPointerPosition?.x ?? nextPosition.x);
        const totalDeltaY = nextPosition.y - (initialPointerPosition?.y ?? nextPosition.y);

        lastPointerPosition = nextPosition;

        if (!pointerDragged) {
          if (Math.hypot(totalDeltaX, totalDeltaY) <= VIEWPORT_DRAG_START_THRESHOLD_PX) {
            return;
          }

          pointerDragged = true;
          if (!host.hasPointerCapture(event.pointerId)) {
            host.setPointerCapture(event.pointerId);
          }
        }

        if (!moveViewportCornerAfterScreenDrag(viewport, deltaX, deltaY)) {
          return;
        }

        stopSelectedAgentFollowState();
        if (selectedAgentManualReselectRef.current) {
          selectedAgentManualReselectLayoutChangedRef.current = false;
          selectedAgentManualReselectGeometryRef.current = {
            scale: viewport.scale.x,
            clampPadding: { ...clampPaddingRef.current }
          };
        }
        event.preventDefault();
      };

      handleHostPointerUp = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          activeTouchPointerIds.delete(event.pointerId);
        }

        if (activePointerId !== event.pointerId) {
          return;
        }

        clearActivePointerDrag(event.pointerId);
      };

      const applyViewportLayout = (preserveView = false) => {
        const hostWidth = Math.max(host.clientWidth, 1);
        const hostHeight = Math.max(host.clientHeight, 1);
        const capabilities = resolveViewportInputCapabilities();
        const { baseScale: nextBaseScale } = resolveViewportScaleBounds(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          DEFAULT_MAX_VIEWPORT_SCALE,
          capabilities
        );
        const entryCenter = resolveViewportEntryCenter(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          capabilities
        );
        const previousCenter = preserveView ? viewport.center : entryCenter;
        const previousScale = viewport.scale.x || nextBaseScale;

        app.renderer.resize(hostWidth, hostHeight);
        viewport.resize(hostWidth, hostHeight, scene.pixelWidth, scene.pixelHeight);
        const { minScale, maxScale } = syncViewportConstraints(
          hostWidth,
          hostHeight,
          capabilities
        );
        const targetScale = preserveView ? Math.min(maxScale, Math.max(minScale, previousScale)) : nextBaseScale;
        const lastCenteredAgent = lastCenteredAgentRef.current;
        const selectedAgent = selectedAgentRef.current;
        const shouldRecenterSelectedAgent =
          preserveView &&
          selectedAgentFollowRef.current &&
          !!lastCenteredAgent &&
          !!selectedAgent &&
          lastCenteredAgent.agentId === selectedAgent.agentId &&
          lastCenteredAgent.x === selectedAgent.x &&
          lastCenteredAgent.y === selectedAgent.y;
        const pendingManualReselectGeometry = selectedAgentManualReselectGeometryRef.current;
        const shouldResolvePendingManualReselect =
          preserveView &&
          selectedAgentManualReselectRef.current &&
          selectedAgentManualReselectEligibleRef.current &&
          currentSelectedHasWatchOverlayRef.current &&
          !!lastCenteredAgent &&
          !!selectedAgent &&
          lastCenteredAgent.agentId === selectedAgent.agentId &&
          lastCenteredAgent.x === selectedAgent.x &&
          lastCenteredAgent.y === selectedAgent.y;
        const pendingManualReselectAwaitingHubSheetClose =
          shouldResolvePendingManualReselect && !!host.closest('.aitown-shell')?.querySelector('.aitown-hub-sheet');
        const pendingManualReselectGeometryChanged =
          shouldResolvePendingManualReselect &&
          !pendingManualReselectAwaitingHubSheetClose &&
          !!pendingManualReselectGeometry &&
          (pendingManualReselectGeometry.scale !== targetScale ||
            pendingManualReselectGeometry.clampPadding.left !== clampPaddingRef.current.left ||
            pendingManualReselectGeometry.clampPadding.top !== clampPaddingRef.current.top ||
            pendingManualReselectGeometry.clampPadding.right !== clampPaddingRef.current.right);

        suppressSelectedAgentFollowResetRef.current = true;
        viewport.setZoom(Math.min(maxScale, Math.max(minScale, targetScale)), true);
        suppressSelectedAgentFollowResetRef.current = false;
        if ((shouldRecenterSelectedAgent || pendingManualReselectGeometryChanged) && selectedAgent) {
          if (
            shouldRecenterSelectedAgent &&
            directFocusMatchesCurrentGeometry(selectedAgentDirectFocusRef.current, selectedAgent)
          ) {
            const directFocus = selectedAgentDirectFocusRef.current!;
            moveViewportCenterDirectly(viewport, directFocus.x, directFocus.y);
            markAgentDirectFocusState({
              agentId: selectedAgent.agentId,
              x: directFocus.x,
              y: directFocus.y,
              homeX: selectedAgent.x,
              homeY: selectedAgent.y
            });
            return;
          }

          moveViewportCenterIntoSafeArea(viewport, selectedAgent.x, selectedAgent.y);
          markSelectedAgentFollowState(selectedAgent);
          return;
        }

        viewport.moveCenter(previousCenter.x, previousCenter.y);
        if (preserveView && !selectedAgent && selectedAgentManualReselectRef.current) {
          const pendingGeometry = selectedAgentManualReselectGeometryRef.current;
          const pendingRight = pendingGeometry?.clampPadding.right ?? 0;
          const currentRight = clampPaddingRef.current.right ?? 0;
          const hubSheetOpen = !!host.closest('.aitown-shell')?.querySelector('.aitown-hub-sheet');
          const geometryMatchesPending =
            !!pendingGeometry &&
            pendingGeometry.scale === targetScale &&
            pendingGeometry.clampPadding.left === clampPaddingRef.current.left &&
            pendingGeometry.clampPadding.top === clampPaddingRef.current.top &&
            pendingGeometry.clampPadding.right === clampPaddingRef.current.right;
          const expectedWatchClampDrop =
            !!pendingGeometry &&
            selectedAgentManualReselectEligibleRef.current &&
            pendingRight > 0 &&
            currentRight === 0 &&
            pendingGeometry.scale === targetScale &&
            pendingGeometry.clampPadding.left === clampPaddingRef.current.left &&
            pendingGeometry.clampPadding.top === clampPaddingRef.current.top;
          if (geometryMatchesPending || expectedWatchClampDrop) {
            selectedAgentManualReselectLayoutChangedRef.current = false;
          } else if (pendingGeometry && !hubSheetOpen) {
            selectedAgentManualReselectLayoutChangedRef.current = true;
          }
        }
        if (shouldResolvePendingManualReselect && !pendingManualReselectAwaitingHubSheetClose) {
          selectedAgentManualReselectRef.current = false;
          selectedAgentManualReselectLayoutChangedRef.current = false;
          selectedAgentManualReselectGeometryRef.current = null;
        }
      };

      const resetViewportToContextDefault = () => {
        const hostWidth = Math.max(host.clientWidth, 1);
        const hostHeight = Math.max(host.clientHeight, 1);
        const capabilities = resolveViewportInputCapabilities();
        const { baseScale: nextBaseScale } = resolveViewportScaleBounds(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          DEFAULT_MAX_VIEWPORT_SCALE,
          capabilities
        );
        const entryCenter = resolveViewportEntryCenter(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          capabilities
        );
        const selectedAgent = selectedAgentRef.current;

        app.renderer.resize(hostWidth, hostHeight);
        viewport.resize(hostWidth, hostHeight, scene.pixelWidth, scene.pixelHeight);
        const { minScale, maxScale } = syncViewportConstraints(
          hostWidth,
          hostHeight,
          capabilities
        );

        suppressSelectedAgentFollowResetRef.current = true;
        viewport.setZoom(Math.min(maxScale, Math.max(minScale, nextBaseScale)), true);
        suppressSelectedAgentFollowResetRef.current = false;
        syncViewportConstraints(hostWidth, hostHeight, capabilities);

        if (selectedAgent) {
          moveViewportCenterIntoSafeArea(viewport, selectedAgent.x, selectedAgent.y);
          markSelectedAgentFollowState(selectedAgent);
          return;
        }

        viewport.moveCenter(entryCenter.x, entryCenter.y);
        clearSelectedAgentFollowState();
      };

      viewportZoomHandler = () => {
        const zoomWasUserInitiated = !suppressSelectedAgentFollowResetRef.current;

        if (zoomWasUserInitiated) {
          stopSelectedAgentFollowState();
        }

        const capabilities = resolveViewportInputCapabilities();
        const minScale = currentBaseScale;
        const targetScale = Math.min(currentMaxScale, Math.max(minScale, viewport.scale.x));

        if (Math.abs(targetScale - viewport.scale.x) > 0.0001) {
          suppressSelectedAgentFollowResetRef.current = true;
          viewport.setZoom(targetScale, true);
          suppressSelectedAgentFollowResetRef.current = false;
          syncViewportConstraints(viewport.screenWidth, viewport.screenHeight, capabilities);
          if (zoomWasUserInitiated && selectedAgentManualReselectRef.current) {
            selectedAgentManualReselectLayoutChangedRef.current = false;
            selectedAgentManualReselectGeometryRef.current = {
              scale: viewport.scale.x,
              clampPadding: { ...clampPaddingRef.current }
            };
          }
          return;
        }

        syncViewportConstraints(viewport.screenWidth, viewport.screenHeight, capabilities);
        if (zoomWasUserInitiated && selectedAgentManualReselectRef.current) {
          selectedAgentManualReselectLayoutChangedRef.current = false;
          selectedAgentManualReselectGeometryRef.current = {
            scale: viewport.scale.x,
            clampPadding: { ...clampPaddingRef.current }
          };
        }
      };

      viewport.wheel({ trackpadPinch: false, wheelZoom: true });
      if (viewportZoomHandler) {
        viewport.on('zoomed', viewportZoomHandler);
      }

      applyViewportLayout();

      const mapContainer = buildStaticMap(scene, assets.tileSetTexture, assets.animationSheets);
      mapContainer.on('pointertap', () => {
        if (suppressSceneTapRef.current) {
          suppressSceneTapRef.current = false;
          return;
        }

        selectedAgentDirectFocusRef.current = null;
        onSelectAgentRef.current(null);
      });

      const zoneLayer = new Container();
      const watchLayer = new Container();
      const agentLayer = new Container();
      watchLayer.eventMode = 'none';
      agentLayer.sortableChildren = true;

      viewport.addChild(mapContainer, zoneLayer, watchLayer, agentLayer);
      app.stage.addChild(viewport);

      agentMotionTicker = (ticker: Ticker) => {
        if (agentMotionStatesRef.current.length === 0) {
          agentMotionAccumulatorSeconds = 0;
          return;
        }

        const deltaMS = Number.isFinite(ticker.deltaMS) ? ticker.deltaMS : 1000 / 60;
        agentMotionAccumulatorSeconds += Math.min(
          Math.max(deltaMS / 1000, 0),
          AGENT_MOTION_MAX_DELTA_SECONDS
        );

        if (agentMotionAccumulatorSeconds < AGENT_MOTION_FRAME_INTERVAL_SECONDS) {
          return;
        }

        applyAgentMotionFrame(agentMotionStatesRef.current, agentMotionAccumulatorSeconds);
        agentMotionAccumulatorSeconds = 0;
        agentLayer.sortChildren();
      };
      app.ticker.add(agentMotionTicker);

      const viewportInspector = createViewportInspector({
        viewport,
        getClampPadding: () => clampPaddingRef.current,
        getScaleBounds: () => ({ minScale: currentBaseScale, maxScale: currentMaxScale }),
        getSelectedAgent: () => selectedAgentRef.current,
        afterZoom: () => {
          viewportZoomHandler?.();
        }
      });

      viewportRef.current = viewport;
      zoneLayerRef.current = zoneLayer;
      watchLayerRef.current = watchLayer;
      agentLayerRef.current = agentLayer;
      viewportInspectorRef.current = viewportInspector;
      resetViewportToContextDefaultRef.current = resetViewportToContextDefault;
      (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__ = viewportInspector;
      host.addEventListener('pointerdown', handleHostPointerDown);
      host.addEventListener('pointermove', handleHostPointerMove);
      host.addEventListener('pointerup', handleHostPointerUp);
      host.addEventListener('pointercancel', handleHostPointerUp);

      resizeObserver = new ResizeObserver(() => {
        applyViewportLayout(true);
      });
      resizeObserver.observe(host);

      if (typeof MutationObserver !== 'undefined') {
        overlayObserver = new MutationObserver((mutations) => {
          if (!viewportRef.current) {
            return;
          }

          const shouldSyncClampPadding = mutations.some((mutation) =>
            isViewportClampPaddingMutationContributor(host, mutation)
          );

          if (!shouldSyncClampPadding) {
            return;
          }

          applyViewportLayout(true);
        });
        overlayObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['class', 'style']
        });
      }

      setReady(true);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      overlayObserver?.disconnect();
      if (viewportRef.current && viewportZoomHandler) {
        viewportRef.current.off('zoomed', viewportZoomHandler);
      }
      if (agentMotionTicker) {
        app.ticker.remove(agentMotionTicker);
      }
      agentMotionStatesRef.current = [];
      host.removeEventListener('wheel', passthroughBrowserZoomShortcut, { capture: true });
      host.removeEventListener('pointerdown', handleHostPointerDown);
      host.removeEventListener('pointermove', handleHostPointerMove);
      host.removeEventListener('pointerup', handleHostPointerUp);
      host.removeEventListener('pointercancel', handleHostPointerUp);
      clearActivePointerDrag();
      activeTouchPointerIds.clear();
      zoneLayerRef.current = null;
      watchLayerRef.current = null;
      agentLayerRef.current = null;
      viewportRef.current = null;
      viewportInspectorRef.current = null;
      resetViewportToContextDefaultRef.current = null;
      (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__ = undefined;
      clearSelectedAgentFollowState();
      setReady(false);

      if (appRef.current) {
        try {
          appRef.current.destroy(true);
        } catch {
          // no-op: renderer may have failed before fully initialized
        }
        appRef.current = null;
      }
    };
  }, [loadAttempt, scene.pixelHeight, scene.pixelWidth]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (resetViewSignal === appliedResetViewSignalRef.current) {
      return;
    }

    appliedResetViewSignalRef.current = resetViewSignal;
    resetViewportToContextDefaultRef.current?.();
  }, [ready, resetViewSignal]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!agentFocusRequest || appliedAgentFocusRequestIdRef.current === agentFocusRequest.requestId) {
      return;
    }

    const viewport = viewportRef.current;
    const targetAgent = scene.agents.find((candidate) => candidate.agentId === agentFocusRequest.agentId);

    if (!viewport || !targetAgent) {
      return;
    }

    appliedAgentFocusRequestIdRef.current = agentFocusRequest.requestId;
    const focusTarget = resolveCurrentAgentFocusTarget(targetAgent);
    moveViewportCenterDirectly(viewport, focusTarget.x, focusTarget.y);
    markAgentDirectFocusState(focusTarget);
  }, [agentFocusRequest, ready, scene.agents]);

  useEffect(() => {
    if (!ready || !zoneFocusRequest || appliedZoneFocusRequestIdRef.current === zoneFocusRequest.requestId) {
      return;
    }

    const viewport = viewportRef.current;
    const zone = scene.zones.find((candidate) => candidate.zoneId === zoneFocusRequest.zoneId);

    if (!viewport || !zone) {
      return;
    }

    appliedZoneFocusRequestIdRef.current = zoneFocusRequest.requestId;
    moveViewportCenterIntoSafeArea(
      viewport,
      zone.anchor.x * scene.map.tileDim,
      zone.anchor.y * scene.map.tileDim
    );
    stopSelectedAgentFollowState();
  }, [ready, scene.map.tileDim, scene.zones, zoneFocusRequest]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    void (async () => {
      const assets = await loadAiTownAssets();
      const zoneLayer = zoneLayerRef.current;
      const watchLayer = watchLayerRef.current;
      const agentLayer = agentLayerRef.current;
      const viewport = viewportRef.current;

      if (!zoneLayer || !watchLayer || !agentLayer || !viewport) {
        return;
      }

      const previousAgentMotionStates = agentMotionStatesRef.current;
      zoneLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      watchLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      agentLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      agentMotionStatesRef.current = [];

      const emphasisByAgentId = resolveWatchOverlayAgentEmphasisById(
        scene.selectedAgentId,
        scene.watchEdges
      );
      const correlationParticipantIds = new Set(scene.correlationParticipantAgentIds);

      watchLayer.addChild(createWatchOverlay(scene));

      const nextAgentMotionStates: AgentMotionState[] = [];
      for (const agent of scene.agents) {
        const agentSprite = createAgentSprite(
          agent,
          emphasisByAgentId.get(agent.agentId) ?? 'none',
          correlationParticipantIds.has(agent.agentId),
          (agentId) => {
            if (suppressSceneTapRef.current) {
              suppressSceneTapRef.current = false;
              return;
            }

            selectedAgentDirectFocusRef.current = null;
            onSelectAgentRef.current(agentId);
          },
          assets.characterAnimations[agent.characterKey]
        );

        agentLayer.addChild(agentSprite);
        nextAgentMotionStates.push(
          createAgentMotionState(
            agent,
            scene,
            agentSprite,
            previousAgentMotionStates.find((state) => state.agentId === agent.agentId)
          )
        );
      }

      agentMotionStatesRef.current = nextAgentMotionStates;
      agentLayer.sortChildren();

      const selectedAgent = selectedAgentRef.current;
      const lastCenteredAgent = lastCenteredAgentRef.current;
      const selectedAgentChanged =
        !!selectedAgent && (!lastCenteredAgent || lastCenteredAgent.agentId !== selectedAgent.agentId);
      const selectedAgentMoved =
        !!selectedAgent && (!lastCenteredAgent || lastCenteredAgent.x !== selectedAgent.x || lastCenteredAgent.y !== selectedAgent.y);
      const shouldRecenterPendingReselect =
        !!selectedAgent &&
        !!lastCenteredAgent &&
        selectedAgentManualReselectRef.current &&
        lastCenteredAgent.agentId === selectedAgent.agentId &&
        (selectedAgentManualReselectLayoutChangedRef.current ||
          !selectedAgentManualReselectEligibleRef.current ||
          !currentSelectedHasWatchOverlay ||
          selectedAgentMoved);
      if (
        selectedAgent &&
        (selectedAgentChanged || (selectedAgentFollowRef.current && selectedAgentMoved) || shouldRecenterPendingReselect)
      ) {
        if (directFocusMatchesCurrentGeometry(selectedAgentDirectFocusRef.current, selectedAgent)) {
          const directFocus = selectedAgentDirectFocusRef.current!;
          moveViewportCenterDirectly(viewport, directFocus.x, directFocus.y);
          markAgentDirectFocusState({
            agentId: selectedAgent.agentId,
            x: directFocus.x,
            y: directFocus.y,
            homeX: selectedAgent.x,
            homeY: selectedAgent.y
          });
        } else {
          moveViewportCenterIntoSafeArea(viewport, selectedAgent.x, selectedAgent.y);
          markSelectedAgentFollowState(selectedAgent);
        }
      } else if (selectedAgent) {
        rememberSelectedAgentState(selectedAgent);
      }

      if (
        selectedAgent &&
        (selectedAgentManualReselectLayoutChangedRef.current ||
          !selectedAgentManualReselectRef.current ||
          !selectedAgentManualReselectEligibleRef.current ||
          !currentSelectedHasWatchOverlay ||
          selectedAgentChanged ||
          selectedAgentMoved)
      ) {
        selectedAgentManualReselectRef.current = false;
        selectedAgentManualReselectLayoutChangedRef.current = false;
        selectedAgentManualReselectGeometryRef.current = null;
      }

      if (!selectedAgent && selectedAgentFollowRef.current) {
        clearSelectedAgentFollowState();
      }
    })();
  }, [ready, scene]);

  return (
    <div className="aitown-world__canvas">
      <div ref={hostRef} className="aitown-world__host" />
      {showSceneCorrelationOverlay ? (
        <section className="aitown-correlation-overlay" aria-label="Active correlation">
          <p className="aitown-correlation-overlay__caption">
            <span className="aitown-correlation-overlay__title">Active correlation</span>
            <span className="aitown-correlation-overlay__summary">
              <span className="aitown-correlation-overlay__id">{scene.activeCorrelationId}</span>
              {' · '}
              {activeCorrelationOverlayParticipants.length === 1
                ? '1 highlighted agent'
                : `${activeCorrelationOverlayParticipants.length} highlighted agents`}
            </span>
          </p>
          {activeCorrelationOverlayParticipants.length > 0 ? (
            <ul className="aitown-correlation-overlay__agents" aria-label="Active correlation participant list">
              {activeCorrelationOverlayParticipants.map((agent) => {
                const agentSelected = scene.selectedAgentId === agent.agentId;

                return (
                  <li key={agent.agentId}>
                    <button
                      type="button"
                      className={`aitown-roster__button aitown-correlation-overlay__agent severity-${agent.severity}${
                        agentSelected ? ' is-active' : ''
                      }`}
                      aria-label={`Inspect ${agent.displayName} from active correlation`}
                      onClick={() => {
                        selectedAgentDirectFocusRef.current = null;
                        onSelectAgentRef.current(agent.agentId);
                      }}
                    >
                      <span className="aitown-correlation-overlay__agent-copy">
                        <strong>{agent.displayName}</strong>
                        <span>{agentSelected ? 'Selected in viewport' : 'Inspect in Hub'}</span>
                      </span>
                      {agentSelected ? <span className="aitown-correlation-overlay__agent-marker">Selected</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="aitown-correlation-overlay__empty">No highlighted scene agents are currently available.</p>
          )}
        </section>
      ) : null}
      {showWatchOverlayCaption ? (
        <section className="aitown-watch-overlay" aria-label="Selected watch links">
          <p className="aitown-watch-overlay__caption">
            <span className="aitown-watch-overlay__title">Watch links</span>
            <span className="aitown-watch-overlay__summary">
              {selectedAgentLabel} · {watchOverlayCaptionItems.length} shown
            </span>
          </p>
          <ul className="aitown-watch-overlay__items" aria-label="Selected watch link list">
            {watchOverlayCaptionItems.map((item) => (
              <li
                key={`${item.watcherAgentId}:${item.targetAgentId}:${item.watchMode}`}
                className={`aitown-watch-overlay__item severity-${item.riskLevel}`}
              >
                <span className="aitown-watch-overlay__mode">{resolveWatchModeLabel(item.watchMode)}</span>
                <span className="aitown-watch-overlay__route">
                  {item.watcherLabel}
                  {' -> '}
                  {item.targetLabel}
                </span>
                <span className="aitown-watch-overlay__risk">{item.riskLevel} risk</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {loadError ? (
        <div className="aitown-world__placeholder aitown-world__placeholder--error" role="alert">
          <strong>World renderer failed to load.</strong>
          <span>{loadError}</span>
          <button type="button" className="aitown-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Retry renderer
          </button>
        </div>
      ) : null}
      {!ready && !loadError ? <div className="aitown-world__placeholder">Loading world renderer...</div> : null}
    </div>
  );
}
