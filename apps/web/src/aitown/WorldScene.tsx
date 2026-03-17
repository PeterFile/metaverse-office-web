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
  DEFAULT_MAX_VIEWPORT_SCALE,
  resolveViewportScaleBounds,
  shouldBlockViewportPointerInput,
  shouldBlockViewportWheelGesture
} from './viewport';

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

function createAgentSprite(agent: SceneAgent, onSelect: (agentId: string | null) => void, characterTextures: Record<string, Texture[]>) {
  const container = new Container();
  container.position.set(agent.position.x, agent.position.y);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.zIndex = agent.position.y;

  const severityColor = SEVERITY_COLORS[agent.severity];

  const shadow = new Graphics();
  shadow.ellipse(0, 8, 10, 5).fill({ color: 0x000000, alpha: 0.25 });

  const aura = new Graphics();
  aura.ellipse(0, 8, agent.selected ? 16 : 13, agent.selected ? 9 : 7).fill({
    color: severityColor,
    alpha: agent.selected ? 0.24 : 0.1
  });
  aura.ellipse(0, 8, agent.selected ? 16 : 13, agent.selected ? 9 : 7).stroke({
    color: severityColor,
    width: agent.selected ? 2 : 1,
    alpha: 0.9
  });

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

  container.on('pointertap', (event) => {
    event.stopPropagation();
    onSelect(agent.selected ? null : agent.agentId);
  });

  container.addChild(shadow, aura, character, statusDot, nameLabel);

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
  const agentLayerRef = useRef<Container | null>(null);
  const onSelectAgentRef = useRef(onSelectAgent);
  const lastCenteredAgentRef = useRef<{ agentId: string; x: number; y: number } | null>(null);
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
    let viewportZoomHandler: (() => void) | null = null;
    const blockGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const blockNonMousePointer = (event: PointerEvent) => {
      if (!shouldBlockViewportPointerInput(event.pointerType)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blockTrackpadPinch = (event: WheelEvent) => {
      if (
        !shouldBlockViewportWheelGesture({
          ctrlKey: event.ctrlKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ
        })
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    host.addEventListener('pointerdown', blockNonMousePointer, { passive: false, capture: true });
    host.addEventListener('pointermove', blockNonMousePointer, { passive: false, capture: true });
    host.addEventListener('pointerup', blockNonMousePointer, { passive: false, capture: true });
    host.addEventListener('pointercancel', blockNonMousePointer, { passive: false, capture: true });
    host.addEventListener('wheel', blockTrackpadPinch, { passive: false, capture: true });
    host.addEventListener('gesturestart', blockGestureZoom as EventListener, { passive: false });
    host.addEventListener('gesturechange', blockGestureZoom as EventListener, { passive: false });
    host.addEventListener('gestureend', blockGestureZoom as EventListener, { passive: false });

    void (async () => {
      try {
        await app.init({
          backgroundAlpha: 0,
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
        events: app.renderer.events
      });

      const initialCenter = { x: scene.pixelWidth / 2, y: scene.pixelHeight / 2 };
      let currentBaseScale = 1;
      let currentMaxScale = DEFAULT_MAX_VIEWPORT_SCALE;

      const syncViewportClampZoom = (hostWidth: number, hostHeight: number) => {
        const { minScale, maxScale } = resolveViewportScaleBounds(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          DEFAULT_MAX_VIEWPORT_SCALE
        );

        viewport.plugins.remove('clamp-zoom');
        viewport.clampZoom({ minScale, maxScale });
        viewport.plugins.remove('clamp');
        viewport.clamp({ direction: 'all' });

        currentMaxScale = maxScale;
        return { minScale, maxScale };
      };

      const applyViewportLayout = (preserveView = false) => {
        const hostWidth = Math.max(host.clientWidth, 1);
        const hostHeight = Math.max(host.clientHeight, 1);
        const { baseScale: nextBaseScale } = resolveViewportScaleBounds(
          hostWidth,
          hostHeight,
          scene.pixelWidth,
          scene.pixelHeight,
          DEFAULT_MAX_VIEWPORT_SCALE
        );
        const previousCenter = preserveView ? viewport.center : initialCenter;
        const previousScale = viewport.scale.x || nextBaseScale;
        const scaleRatio = preserveView ? nextBaseScale / Math.max(currentBaseScale, 0.0001) : 1;

        viewport.resize(hostWidth, hostHeight, scene.pixelWidth, scene.pixelHeight);
        const { minScale, maxScale } = syncViewportClampZoom(hostWidth, hostHeight);
        viewport.setZoom(preserveView ? previousScale * scaleRatio : nextBaseScale, true);
        viewport.setZoom(Math.min(maxScale, Math.max(minScale, viewport.scale.x)), true);
        viewport.moveCenter(previousCenter.x, previousCenter.y);
        currentBaseScale = nextBaseScale;
      };

      viewportZoomHandler = () => {
        const minScale = currentBaseScale;
        const targetScale = Math.min(currentMaxScale, Math.max(minScale, viewport.scale.x));

        if (Math.abs(targetScale - viewport.scale.x) > 0.0001) {
          viewport.setZoom(targetScale, true);
          return;
        }

        viewport.plugins.get('clamp')?.update?.();
      };

      viewport
        .drag({ mouseButtons: 'left' })
        .wheel({ trackpadPinch: false, wheelZoom: true })
        .decelerate()
        .clamp({ direction: 'all' });
      if (viewportZoomHandler) {
        viewport.on('zoomed', viewportZoomHandler);
      }

      applyViewportLayout();

      const mapContainer = buildStaticMap(scene, assets.tileSetTexture, assets.animationSheets);
      mapContainer.on('pointertap', () => onSelectAgentRef.current(null));

      const zoneLayer = new Container();
      const agentLayer = new Container();
      agentLayer.sortableChildren = true;

      viewport.addChild(mapContainer, zoneLayer, agentLayer);
      app.stage.addChild(viewport);

      viewportRef.current = viewport;
      zoneLayerRef.current = zoneLayer;
      agentLayerRef.current = agentLayer;

      resizeObserver = new ResizeObserver(() => {
        applyViewportLayout(true);
      });
      resizeObserver.observe(host);

      setReady(true);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (viewportRef.current && viewportZoomHandler) {
        viewportRef.current.off('zoomed', viewportZoomHandler);
      }
      host.removeEventListener('pointerdown', blockNonMousePointer, { capture: true });
      host.removeEventListener('pointermove', blockNonMousePointer, { capture: true });
      host.removeEventListener('pointerup', blockNonMousePointer, { capture: true });
      host.removeEventListener('pointercancel', blockNonMousePointer, { capture: true });
      host.removeEventListener('wheel', blockTrackpadPinch, { capture: true });
      host.removeEventListener('gesturestart', blockGestureZoom as EventListener);
      host.removeEventListener('gesturechange', blockGestureZoom as EventListener);
      host.removeEventListener('gestureend', blockGestureZoom as EventListener);
      zoneLayerRef.current = null;
      agentLayerRef.current = null;
      viewportRef.current = null;
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
      const agentLayer = agentLayerRef.current;
      const viewport = viewportRef.current;

      if (!zoneLayer || !agentLayer || !viewport) {
        return;
      }

      zoneLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
      agentLayer.removeChildren().forEach((child) => child.destroy({ children: true }));

      const selectedSet = new Set(
        scene.selectedAgentId ? [scene.selectedAgentId] : []
      );

      for (const zone of scene.zones) {
        zoneLayer.addChild(createZoneLabel(zone, selectedSet, scene.map.tileDim));
      }

      for (const agent of scene.agents) {
        agentLayer.addChild(
          createAgentSprite(agent, (agentId) => onSelectAgentRef.current(agentId), assets.characterAnimations[agent.characterKey])
        );
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
