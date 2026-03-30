import { useEffect, useRef, useState } from 'react';
import {
  Application,
  AnimatedSprite,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';

import { loadAiTownAssets } from './assetLoader';
import type { AiTownSceneModel, SceneAgent, SceneZone } from './types';
import {
  DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE,
  DEFAULT_MAX_VIEWPORT_SCALE,
  createViewportInspector,
  moveViewportCornerAfterScreenDrag,
  resolveViewportClampOptions,
  resolveViewportEntryCenter,
  resolveViewportScaleBounds,
  resolveViewportWheelGestureDisposition,
  shouldBlockViewportPointerInput,
  shouldDeferViewportPointerGestureToBrowser,
  type ViewportInputCapabilities,
  type ViewportInspector
} from './viewport';
import { resolveViewportClampPadding } from './viewportClampPadding';
import { resolveSceneAgentStatusBadge } from './agentStatusBadge';
import {
  resolveWatchOverlayAgentEmphasisById,
  resolveWatchOverlaySegments,
  type WatchOverlayAgentEmphasis
} from './watchOverlay';

const SEVERITY_COLORS = {
  normal: 0x8ed16f,
  yellow: 0xf8d34b,
  orange: 0xff9551,
  red: 0xf26767
} as const;

const zoneLabelStyle = new TextStyle({
  fontFamily: '"VCR OSD Mono", monospace',
  fontSize: 10,
  fill: 0xf9f5d7,
  stroke: { color: 0x2e2030, width: 4, join: 'round' }
});

const nameLabelStyle = new TextStyle({
  fontFamily: '"VCR OSD Mono", monospace',
  fontSize: 10,
  fill: 0xffffff,
  stroke: { color: 0x20162a, width: 4, join: 'round' }
});

const statusBadgeStyle = new TextStyle({
  fontFamily: '"VCR OSD Mono", monospace',
  fontSize: 8,
  fill: 0xf9f5d7,
  stroke: { color: 0x20162a, width: 3, join: 'round' }
});

const WATCH_PARTICIPANT_HIGHLIGHT_COLOR = 0xffd785;

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

function createZoneLabel(zone: SceneZone, selectedAgentIds: Set<string>, tileDim: number) {
  const container = new Container();
  const highlighted = zone.occupantIds.some((agentId) => selectedAgentIds.has(agentId));
  const x = zone.anchor.x * tileDim;
  const y = zone.anchor.y * tileDim;

  const background = new Graphics();
  background.roundRect(-34, -42, 68, 18, 6).fill({
    color: highlighted ? 0x6a3d2c : 0x231626,
    alpha: highlighted ? 0.72 : 0.58
  });
  background.roundRect(-34, -42, 68, 18, 6).stroke({
    color: highlighted ? 0xffd785 : 0xd4b36b,
    width: 1,
    alpha: 0.7
  });

  const label = new Text({
    text: zone.label,
    style: zoneLabelStyle,
    resolution: 2
  });
  label.anchor.set(0.5, 0.5);
  label.y = -33;

  container.position.set(x, y);
  container.addChild(background, label);
  container.eventMode = 'none';

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
  onSelect: (agentId: string | null) => void,
  characterTextures: Record<string, Texture[]>
) {
  const container = new Container();
  container.position.set(agent.position.x, agent.position.y);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.zIndex = agent.position.y;

  const severityColor = SEVERITY_COLORS[agent.severity];
  const emphasized = emphasis !== 'none';
  const selected = emphasis === 'selected' || agent.selected;
  const auraRadiusX = selected ? 16 : emphasized ? 14 : 13;
  const auraRadiusY = selected ? 9 : emphasized ? 8 : 7;

  const shadow = new Graphics();
  shadow.ellipse(0, 8, 10, 5).fill({ color: 0x000000, alpha: 0.25 });

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
  character.animationSpeed = agent.phase === 'blocked' ? 0.03 : 0.08;
  character.play();

  const nameLabel = new Text({
    text: agent.displayName,
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
    onSelect(agent.selected ? null : agent.agentId);
  });

  container.addChild(shadow, aura, emphasisRing, character, statusDot, nameLabel);
  if (statusBadge) {
    container.addChild(statusBadge);
  }

  return container;
}

type WorldSceneProps = {
  scene: AiTownSceneModel;
  onSelectAgent: (agentId: string | null) => void;
};

export default function WorldScene({ scene, onSelectAgent }: WorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const zoneLayerRef = useRef<Container | null>(null);
  const watchLayerRef = useRef<Container | null>(null);
  const agentLayerRef = useRef<Container | null>(null);
  const onSelectAgentRef = useRef(onSelectAgent);
  const lastCenteredAgentRef = useRef<{ agentId: string; x: number; y: number } | null>(null);
  const suppressSceneTapRef = useRef(false);
  const clampPaddingRef = useRef<{ top: number; right: number }>({ top: 0, right: 0 });
  const viewportInspectorRef = useRef<ViewportInspector | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    onSelectAgentRef.current = onSelectAgent;
  }, [onSelectAgent]);

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
    let activePointerId: number | null = null;
    let activeTouchPointerIds = new Set<number>();
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
        const nextClampPadding = {
          top: clampPadding.top ?? 0,
          right: clampPadding.right ?? 0
        };
        clampPaddingRef.current = nextClampPadding;
        (viewport as Viewport & { clampPadding?: { top: number; right: number } }).clampPadding = nextClampPadding;
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
        lastPointerPosition = { x: event.clientX, y: event.clientY };
        pointerDragged = false;
        host.setPointerCapture(event.pointerId);
      };

      handleHostPointerMove = (event: PointerEvent) => {
        if (shouldDeferViewportPointerGestureToBrowser(event.pointerType, activeTouchPointerIds.size)) {
          return;
        }

        if (activePointerId !== event.pointerId || !lastPointerPosition) {
          return;
        }

        const nextPosition = { x: event.clientX, y: event.clientY };
        const deltaX = nextPosition.x - lastPointerPosition.x;
        const deltaY = nextPosition.y - lastPointerPosition.y;

        lastPointerPosition = nextPosition;

        if (!moveViewportCornerAfterScreenDrag(viewport, deltaX, deltaY)) {
          return;
        }

        pointerDragged = true;
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

        viewport.resize(hostWidth, hostHeight, scene.pixelWidth, scene.pixelHeight);
        const { minScale, maxScale } = syncViewportConstraints(hostWidth, hostHeight, capabilities);
        const targetScale = preserveView ? Math.min(maxScale, Math.max(minScale, previousScale)) : nextBaseScale;
        viewport.setZoom(Math.min(maxScale, Math.max(minScale, targetScale)), true);
        viewport.moveCenter(previousCenter.x, previousCenter.y);
      };

      viewportZoomHandler = () => {
        const capabilities = resolveViewportInputCapabilities();
        const minScale = currentBaseScale;
        const targetScale = Math.min(currentMaxScale, Math.max(minScale, viewport.scale.x));

        if (Math.abs(targetScale - viewport.scale.x) > 0.0001) {
          viewport.setZoom(targetScale, true);
          syncViewportConstraints(viewport.screenWidth, viewport.screenHeight, capabilities);
          return;
        }

        syncViewportConstraints(viewport.screenWidth, viewport.screenHeight, capabilities);
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

        onSelectAgentRef.current(null);
      });

      const zoneLayer = new Container();
      const watchLayer = new Container();
      const agentLayer = new Container();
      watchLayer.eventMode = 'none';
      agentLayer.sortableChildren = true;

      viewport.addChild(mapContainer, zoneLayer, watchLayer, agentLayer);
      app.stage.addChild(viewport);

      const viewportInspector = createViewportInspector({
        viewport,
        getClampPadding: () => clampPaddingRef.current,
        getScaleBounds: () => ({ minScale: currentBaseScale, maxScale: currentMaxScale }),
        afterZoom: () => {
          viewportZoomHandler?.();
        }
      });

      viewportRef.current = viewport;
      zoneLayerRef.current = zoneLayer;
      watchLayerRef.current = watchLayer;
      agentLayerRef.current = agentLayer;
      viewportInspectorRef.current = viewportInspector;
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
        overlayObserver = new MutationObserver(() => {
          if (!viewportRef.current) {
            return;
          }

          applyViewportLayout(true);
        });
        overlayObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
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
      (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__ = undefined;
      lastCenteredAgentRef.current = null;
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

    void (async () => {
      const assets = await loadAiTownAssets();
      const zoneLayer = zoneLayerRef.current;
      const watchLayer = watchLayerRef.current;
      const agentLayer = agentLayerRef.current;
      const viewport = viewportRef.current;

      if (!zoneLayer || !watchLayer || !agentLayer || !viewport) {
        return;
      }

      zoneLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      watchLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      agentLayer.removeChildren().forEach((child) => child.destroy({ children: true }));

      const emphasisByAgentId = resolveWatchOverlayAgentEmphasisById(
        scene.selectedAgentId,
        scene.watchEdges
      );
      const selectedSet = new Set(emphasisByAgentId.keys());

      for (const zone of scene.zones) {
        zoneLayer.addChild(createZoneLabel(zone, selectedSet, scene.map.tileDim));
      }

      watchLayer.addChild(createWatchOverlay(scene));

      for (const agent of scene.agents) {
        const agentSprite = createAgentSprite(
          agent,
          emphasisByAgentId.get(agent.agentId) ?? 'none',
          (agentId) => {
            if (suppressSceneTapRef.current) {
              suppressSceneTapRef.current = false;
              return;
            }

            onSelectAgentRef.current(agentId);
          },
          assets.characterAnimations[agent.characterKey]
        );

        agentLayer.addChild(agentSprite);
      }

      agentLayer.sortChildren();

      const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
      const lastCenteredAgent = lastCenteredAgentRef.current;
      if (
        selectedAgent &&
        (
          !lastCenteredAgent ||
          lastCenteredAgent.agentId !== selectedAgent.agentId ||
          lastCenteredAgent.x !== selectedAgent.position.x ||
          lastCenteredAgent.y !== selectedAgent.position.y
        )
      ) {
        viewport.moveCenter(selectedAgent.position.x, selectedAgent.position.y);
        lastCenteredAgentRef.current = {
          agentId: selectedAgent.agentId,
          x: selectedAgent.position.x,
          y: selectedAgent.position.y
        };
      }

      if (!selectedAgent) {
        lastCenteredAgentRef.current = null;
      }
    })();
  }, [ready, scene]);

  return (
    <div className="aitown-world__canvas">
      <div ref={hostRef} className="aitown-world__host" />
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
