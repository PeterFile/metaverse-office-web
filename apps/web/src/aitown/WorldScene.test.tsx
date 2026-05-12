import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiTownAssets } from './assetLoader';
import type { AiTownSceneModel, SceneAgent } from './types';
import type { ViewportInspector } from './viewport';

const { MockDisplayObject, MockTicker, appInitMock, appDestroyMock, appInstances } = vi.hoisted(() => {
  class MockDisplayObject {
    children: MockDisplayObject[] = [];
    eventMode?: string;
    cursor?: string;
    hitArea?: unknown;
    sortableChildren = false;
    zIndex = 0;
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    animationSpeed = 0;
    position = {
      set: (x: number, y: number) => {
        this.x = x;
        this.y = y;
      }
    };
    scale = {
      x: 1,
      y: 1,
      set: (x: number, y = x) => {
        this.scale.x = x;
        this.scale.y = y;
      }
    };
    anchor = {
      set: (_x: number, _y?: number) => {}
    };
    handlers = new Map<string, Set<(event: { stopPropagation: () => void }) => void>>();

    addChild(...children: MockDisplayObject[]) {
      this.children.push(...children);
      return children[0] ?? null;
    }

    addChildAt(child: MockDisplayObject, index: number) {
      this.children.splice(index, 0, child);
      return child;
    }

    removeChildren() {
      const removed = [...this.children];
      this.children = [];
      return removed;
    }

    sortChildren() {}

    moveTo(_x: number, _y: number) {
      return this;
    }

    lineTo(_x: number, _y: number) {
      return this;
    }

    stroke(_options: unknown) {
      return this;
    }

    circle(_x: number, _y: number, _radius: number) {
      return this;
    }

    fill(_options: unknown) {
      return this;
    }

    ellipse(_x: number, _y: number, _radiusX: number, _radiusY: number) {
      return this;
    }

    roundRect(_x: number, _y: number, _width: number, _height: number, _radius: number) {
      return this;
    }

    on(event: string, handler: (event: { stopPropagation: () => void }) => void) {
      const handlers = this.handlers.get(event) ?? new Set<(event: { stopPropagation: () => void }) => void>();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    off(event: string, handler?: (event: { stopPropagation: () => void }) => void) {
      if (!handler) {
        this.handlers.delete(event);
        return this;
      }

      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string) {
      const payload = { stopPropagation: vi.fn() };
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload);
      }
      return payload;
    }

    play() {}

    destroy(_options?: unknown) {}
  }

  class MockTicker {
    deltaMS = 1000 / 60;
    maxFPS = 0;
    listeners = new Set<(ticker: MockTicker) => void>();
    add = vi.fn((listener: (ticker: MockTicker) => void) => {
      this.listeners.add(listener);
      return this;
    });
    remove = vi.fn((listener: (ticker: MockTicker) => void) => {
      this.listeners.delete(listener);
      return this;
    });

    tick(deltaMS = 1000 / 60) {
      this.deltaMS = deltaMS;
      for (const listener of [...this.listeners]) {
        listener(this);
      }
    }
  }

  type MockRenderer = { events: Record<string, never>; resize: ReturnType<typeof vi.fn> };
  const appInstances: Array<{ stage: MockDisplayObject; ticker: MockTicker; renderer: MockRenderer }> = [];

  return {
    MockDisplayObject,
    MockTicker,
    appInitMock: vi.fn(),
    appDestroyMock: vi.fn().mockResolvedValue(undefined),
    appInstances
  };
});

vi.mock('pixi.js', () => {
  class Application {
    canvas = document.createElement('canvas');
    renderer = { events: {}, resize: vi.fn() };
    stage = new Container();
    ticker = new MockTicker();
    init = appInitMock;
    destroy = appDestroyMock;

    constructor() {
      appInstances.push(this);
    }
  }

  class Container extends MockDisplayObject {}

  class Graphics extends MockDisplayObject {}

  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number
    ) {}
  }

  class Sprite extends MockDisplayObject {
    constructor(public texture?: unknown) {
      super();
    }
  }

  class AnimatedSprite extends Sprite {}

  class Text extends MockDisplayObject {
    constructor(public options?: unknown) {
      super();
    }
  }

  class TextStyle {
    constructor(..._args: unknown[]) {}
  }

  class Texture {
    source: unknown;

    constructor(options?: { source?: unknown }) {
      this.source = options?.source ?? {};
    }
  }

  return {
    Application,
    AnimatedSprite,
    Container,
    Graphics,
    Rectangle,
    Sprite,
    Text,
    TextStyle,
    Texture
  };
});

vi.mock('pixi-viewport', () => ({
  Viewport: class extends MockDisplayObject {
    center: { x: number; y: number };
    left: number;
    top: number;
    right: number;
    bottom: number;
    screenWidth: number;
    screenHeight: number;
    worldWidth: number;
    worldHeight: number;
    screenWorldWidth: number;
    screenWorldHeight: number;
    plugins = {
      remove: (_name: string) => {}
    };

    constructor({
      screenWidth,
      screenHeight,
      worldWidth,
      worldHeight
    }: {
      screenWidth: number;
      screenHeight: number;
      worldWidth: number;
      worldHeight: number;
    }) {
      super();
      this.screenWidth = screenWidth;
      this.screenHeight = screenHeight;
      this.worldWidth = worldWidth;
      this.worldHeight = worldHeight;
      this.center = { x: worldWidth / 2, y: worldHeight / 2 };
      this.left = 0;
      this.top = 0;
      this.right = worldWidth;
      this.bottom = worldHeight;
      this.screenWorldWidth = worldWidth;
      this.screenWorldHeight = worldHeight;
      this.updateBounds();
    }

    clampZoom(_options: unknown) {
      return this;
    }

    clamp(_options: unknown) {
      return this;
    }

    wheel(_options: unknown) {
      return this;
    }

    resize(screenWidth: number, screenHeight: number, worldWidth: number, worldHeight: number) {
      this.screenWidth = screenWidth;
      this.screenHeight = screenHeight;
      this.worldWidth = worldWidth;
      this.worldHeight = worldHeight;
      this.updateBounds();
      return this;
    }

    setZoom(scale: number, _center?: boolean) {
      this.scale.x = scale;
      this.scale.y = scale;
      this.updateBounds();
      return this;
    }

    moveCenter(x: number, y: number) {
      this.center = { x, y };
      this.updateBounds();
      return this;
    }

    moveCorner(x: number, y: number) {
      this.left = x;
      this.top = y;
      this.right = x + this.screenWorldWidth;
      this.bottom = y + this.screenWorldHeight;
      this.center = {
        x: x + this.screenWorldWidth / 2,
        y: y + this.screenWorldHeight / 2
      };
      this.x = x;
      this.y = y;
      return this;
    }

    updateBounds() {
      const scale = this.scale.x || 1;
      this.screenWorldWidth = this.screenWidth / scale;
      this.screenWorldHeight = this.screenHeight / scale;
      this.left = this.center.x - this.screenWorldWidth / 2;
      this.top = this.center.y - this.screenWorldHeight / 2;
      this.right = this.left + this.screenWorldWidth;
      this.bottom = this.top + this.screenWorldHeight;
      this.x = this.left;
      this.y = this.top;
    }
  }
}));

vi.mock('./assetLoader', () => ({
  loadAiTownAssets: vi.fn()
}));

import { loadAiTownAssets } from './assetLoader';
import WorldScene from './WorldScene';

type ResettableWorldSceneProps = {
  scene: AiTownSceneModel;
  onSelectAgent: (agentId: string | null) => void;
  resetViewSignal?: number;
  agentFocusRequest?: { agentId: string; requestId: number } | null;
  zoneFocusRequest?: { zoneId: string; requestId: number } | null;
};

const ResettableWorldScene = WorldScene as unknown as ComponentType<ResettableWorldSceneProps>;

const characterKeys = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'] as const;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe() {}

  disconnect() {}

  unobserve() {}

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }

  static triggerAll() {
    for (const instance of MockResizeObserver.instances) {
      instance.trigger();
    }
  }
}

function setElementRect(
  element: HTMLElement,
  { left, top, width, height }: { left: number; top: number; width: number; height: number }
) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: width
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: height
  });
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    }) as DOMRect;
}

function setResponsiveShellChromeRects({
  host,
  toolbar,
  stats
}: {
  host: HTMLDivElement;
  toolbar: HTMLElement;
  stats: HTMLElement;
}) {
  setElementRect(host, { left: 0, top: 0, width: 1000, height: 800 });
  toolbar.getBoundingClientRect = () => {
    const expanded = (toolbar.textContent ?? '').includes('Expanded');
    const height = expanded ? 96 : 56;

    return {
      left: 0,
      top: 0,
      right: 1000,
      bottom: height,
      width: 1000,
      height
    } as DOMRect;
  };
  stats.getBoundingClientRect = () => {
    const expanded = (stats.textContent ?? '').includes('Expanded');
    const width = expanded ? 320 : 180;

    return {
      left: 1000 - width,
      top: 80,
      right: 1000,
      bottom: 220,
      width,
      height: 140
    } as DOMRect;
  };
}

function getOnlyTextNode(element: HTMLElement) {
  const textNode = element.firstChild;

  expect(textNode).toBeInstanceOf(Text);

  return textNode as Text;
}

function readViewportInspector() {
  return (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__;
}

function readViewportCenter() {
  const inspection = readViewportInspector()?.read();

  expect(inspection).toBeDefined();

  return {
    x: ((inspection?.left ?? 0) + (inspection?.right ?? 0)) / 2,
    y: ((inspection?.top ?? 0) + (inspection?.bottom ?? 0)) / 2
  };
}

function readMapContainer() {
  const app = appInstances.at(-1);
  expect(app).toBeDefined();

  const viewport = app?.stage.children[0];
  expect(viewport).toBeDefined();

  const mapContainer = viewport?.children[0];
  expect(mapContainer).toBeDefined();

  return mapContainer;
}

function readAgentLayer() {
  const app = appInstances.at(-1);
  expect(app).toBeDefined();

  const viewport = app?.stage.children[0];
  expect(viewport).toBeDefined();

  const agentLayer = viewport?.children[3];
  expect(agentLayer).toBeDefined();

  return agentLayer;
}

function readZoneLayer() {
  const app = appInstances.at(-1);
  expect(app).toBeDefined();

  const viewport = app?.stage.children[0];
  expect(viewport).toBeDefined();

  const zoneLayer = viewport?.children[1];
  expect(zoneLayer).toBeDefined();

  return zoneLayer;
}

type MockTreeNode = {
  children?: MockTreeNode[];
  options?: unknown;
};

function collectPixiTextLabels(node: MockTreeNode | undefined): string[] {
  if (!node) {
    return [];
  }

  const options = node.options;
  const text =
    typeof options === 'object' && options !== null && 'text' in options
      ? (options as { text?: unknown }).text
      : undefined;

  return [
    ...(typeof text === 'string' ? [text] : []),
    ...(node.children ?? []).flatMap((child) => collectPixiTextLabels(child))
  ];
}

function installViewportInspectorTracker() {
  const assignedValues: Array<ViewportInspector | undefined> = [];
  let currentValue: ViewportInspector | undefined;

  Object.defineProperty(window, '__AITOWN_VIEWPORT__', {
    configurable: true,
    get: () => currentValue,
    set: (value: ViewportInspector | undefined) => {
      currentValue = value;
      assignedValues.push(value);
    }
  });

  return {
    assignedValues,
    restore() {
      delete (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__;
    }
  };
}

function makeAssets(): AiTownAssets {
  const textureFrame = { source: {} };
  const appEngineeringPawn = { source: {}, assetId: 'pawn_app_eng' };
  const leadPawn = { source: {}, assetId: 'pawn_lead' };
  const characterAnimations = Object.fromEntries(
    characterKeys.map((characterKey) => [
      characterKey,
      {
        down: [textureFrame],
        left: [textureFrame],
        right: [textureFrame],
        up: [textureFrame]
      }
    ])
  ) as AiTownAssets['characterAnimations'];

  return {
    characterAnimations,
    rolePawnTextures: {
      app_eng: appEngineeringPawn as unknown as AiTownAssets['rolePawnTextures']['app_eng'],
      lead: leadPawn as unknown as AiTownAssets['rolePawnTextures']['lead']
    },
    tileSetTexture: textureFrame as AiTownAssets['tileSetTexture'],
    animationSheets: {}
  };
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  appInstances.length = 0;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  appInitMock.mockReset().mockRejectedValue(new Error('renderer_init_failed'));
  appDestroyMock.mockClear();
  vi.mocked(loadAiTownAssets).mockReset();
  delete (window as typeof window & { __AITOWN_VIEWPORT__?: ViewportInspector }).__AITOWN_VIEWPORT__;
});

function makeAgent(overrides: Partial<SceneAgent> = {}): SceneAgent {
  return {
    agentId: 'app-engineering',
    displayName: 'App Engineering Agent',
    kind: 'employee',
    zoneId: 'delivery-desk',
    position: { x: 120, y: 180 },
    characterKey: 'f1',
    rolePawnKey: 'app_eng',
    facing: 'down',
    phase: 'blocked',
    severity: 'orange',
    selected: true,
    activeTask: 'Follow up on workflow evidence',
    rawLocation: 'delivery-desk',
    rebootRecommended: false,
    openAlertCount: 1,
    hasOpenIncidents: true,
    ...overrides
  };
}

function makeScene(): AiTownSceneModel {
  return {
    map: {
      width: 48,
      height: 32,
      tileSetUrl: '/tiles.png',
      tileSetDimX: 16,
      tileSetDimY: 16,
      tileDim: 16,
      bgTiles: [],
      objectTiles: [],
      animatedSprites: []
    },
    zones: [
      {
        zoneId: 'delivery-desk',
        label: 'Delivery Desk',
        kind: 'desk',
        anchor: { x: 10, y: 10 },
        occupantIds: ['app-engineering']
      }
    ],
    agents: [
      makeAgent({
        agentId: 'team-lead',
        displayName: 'Team Lead',
        kind: 'lead',
        zoneId: 'lead-desk',
        position: { x: 80, y: 120 },
        selected: false,
        severity: 'yellow',
        phase: 'active'
      }),
      makeAgent()
    ],
    watchEdges: [
      {
        fromAgentId: 'team-lead',
        toAgentId: 'app-engineering',
        watchMode: 'lead',
        riskLevel: 'orange'
      }
    ],
    selectedAgentId: 'app-engineering',
    activeCorrelationId: null,
    correlationParticipantAgentIds: [],
    pixelWidth: 768,
    pixelHeight: 512
  };
}

function makeWideSelectedAgentScene() {
  const scene = makeScene();

  return {
    ...scene,
    pixelWidth: 3000,
    pixelHeight: 1600,
    agents: scene.agents.map((agent) =>
      agent.agentId === scene.selectedAgentId
        ? {
            ...agent,
            position: { x: 1500, y: 800 }
          }
        : agent
    )
  } satisfies AiTownSceneModel;
}

describe('WorldScene watch overlay caption gating', () => {
  it('renders generated role pawn textures before falling back to 32x32folk animations', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    const assets = makeAssets();
    vi.mocked(loadAiTownAssets).mockResolvedValue(assets);

    const scene = {
      ...makeScene(),
      agents: [
        makeAgent({
          agentId: 'app-engineering',
          displayName: 'App Engineering Agent',
          rolePawnKey: 'app_eng',
          characterKey: 'f1',
          position: { x: 120, y: 180 }
        }),
        makeAgent({
          agentId: 'fallback-agent',
          displayName: 'Fallback Agent',
          rolePawnKey: undefined,
          characterKey: 'f2',
          position: { x: 160, y: 180 },
          selected: false
        })
      ]
    } satisfies AiTownSceneModel;

    render(<WorldScene scene={scene} onSelectAgent={vi.fn()} />);

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const [pawnAgent, fallbackAgent] = readAgentLayer()?.children ?? [];
    const pawnVisual = pawnAgent?.children[4] as { texture?: unknown } | undefined;
    const fallbackVisual = fallbackAgent?.children[4] as { texture?: unknown } | undefined;

    expect(pawnVisual?.texture).toBe(assets.rolePawnTextures.app_eng);
    expect(fallbackVisual?.texture).toEqual(assets.characterAnimations.f2.down);
  });

  it('removes zone labels from the map and keeps agent labels short', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());
    const baseScene = makeScene();

    const scene = {
      ...baseScene,
      zones: [
        ...baseScene.zones,
        {
          zoneId: 'review-zone',
          label: 'Review Zone',
          kind: 'shared' as const,
          anchor: { x: 16, y: 12 },
          occupantIds: ['protocol-engineering']
        }
      ],
      agents: [
        makeAgent({
          agentId: 'app-engineering',
          displayName: 'App Engineering Agent',
          position: { x: 120, y: 180 }
        }),
        makeAgent({
          agentId: 'protocol-engineering',
          displayName: 'Protocol Engineering Agent',
          position: { x: 160, y: 180 },
          selected: false,
          severity: 'normal',
          openAlertCount: 0,
          hasOpenIncidents: false
        })
      ],
      watchEdges: []
    } satisfies AiTownSceneModel;

    render(<WorldScene scene={scene} onSelectAgent={vi.fn()} />);

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    expect(readZoneLayer()?.children).toHaveLength(0);

    const textLabels = collectPixiTextLabels(appInstances.at(-1)?.stage);
    expect(textLabels).toContain('App');
    expect(textLabels).toContain('Protocol');
    expect(textLabels).not.toContain('App Engineering Agent');
    expect(textLabels).not.toContain('Protocol Engineering Agent');
    expect(textLabels).not.toContain('Delivery Desk');
    expect(textLabels).not.toContain('Review Zone');
  });

  it('keeps selected watch-link captions hidden while the renderer is still failed', async () => {
    render(<WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />);

    expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Selected watch link list' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('World renderer failed to load.');
      expect(screen.getByRole('alert')).toHaveTextContent('renderer_init_failed');
    });

    expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Selected watch link list' })).not.toBeInTheDocument();
  });

  it('renders selected watch links with region/list semantics and visible route/risk copy after a successful load', async () => {
    appInitMock.mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    render(<WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />);

    const region = await screen.findByRole('region', { name: 'Selected watch links' });
    const list = within(region).getByRole('list', { name: 'Selected watch link list' });
    const [watchLinkItem] = within(list).getAllByRole('listitem');

    expect(watchLinkItem).toBeVisible();
    expect(within(watchLinkItem).getByText('Lead watch')).toBeVisible();
    expect(within(watchLinkItem).getByText(/Team Lead\s*->\s*App Engineering Agent/)).toBeVisible();
    expect(within(watchLinkItem).getByText('orange risk')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders an active correlation overlay with participant inspect buttons only while a correlation is active', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const onSelectAgent = vi.fn();
    const inactiveScene = {
      ...makeScene(),
      watchEdges: []
    };
    const activeScene = {
      ...inactiveScene,
      activeCorrelationId: 'corr-app-review',
      correlationParticipantAgentIds: ['app-engineering', 'team-lead']
    } satisfies AiTownSceneModel;
    const { rerender } = render(<WorldScene scene={inactiveScene} onSelectAgent={onSelectAgent} />);

    expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();

    rerender(<WorldScene scene={activeScene} onSelectAgent={onSelectAgent} />);

    const region = await screen.findByRole('region', { name: 'Active correlation' });
    const list = within(region).getByRole('list', { name: 'Active correlation participant list' });
    const appEngineeringButton = within(list).getByRole('button', {
      name: 'Inspect App Engineering Agent from active correlation'
    });
    const teamLeadButton = within(list).getByRole('button', {
      name: 'Inspect Team Lead from active correlation'
    });

    expect(within(region).getByText('corr-app-review')).toBeVisible();
    expect(appEngineeringButton).toBeVisible();
    expect(teamLeadButton).toBeVisible();

    fireEvent.click(teamLeadButton);

    expect(onSelectAgent).toHaveBeenLastCalledWith('team-lead');

    rerender(<WorldScene scene={inactiveScene} onSelectAgent={onSelectAgent} />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();
    });
  });

  it('keeps the Pixi renderer buffer synchronized with the host size for canvas hit testing', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const { container } = render(<WorldScene scene={scene} onSelectAgent={vi.fn()} />);
    const host = container.querySelector('.aitown-world__host');

    expect(host).toBeInstanceOf(HTMLDivElement);
    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(appInstances.at(-1)).toBeDefined();
    });

    act(() => {
      setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1272, height: 712 });
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(appInstances.at(-1)?.renderer.resize).toHaveBeenLastCalledWith(1272, 712);
      expect(readViewportInspector()?.read()).toMatchObject({
        screenWidth: 1272,
        screenHeight: 712
      });
    });
  });

  it('emits the agent id when an already-selected agent sprite is tapped', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const selectedAgentIndex = scene.agents.findIndex((agent) => agent.agentId === scene.selectedAgentId);
    const onSelectAgent = vi.fn();

    render(<WorldScene scene={scene} onSelectAgent={onSelectAgent} />);

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const selectedAgentSprite = readAgentLayer()?.children[selectedAgentIndex] as
      | {
          emit: (event: string) => { stopPropagation: ReturnType<typeof vi.fn> };
          eventMode?: string;
          hitArea?: { x: number; y: number; width: number; height: number };
        }
      | undefined;

    expect(selectedAgentSprite).toBeDefined();
    expect(selectedAgentSprite?.eventMode).toBe('static');
    expect(selectedAgentSprite?.hitArea).toMatchObject({
      x: -24,
      y: -32,
      width: 48,
      height: 56
    });

    const event = selectedAgentSprite?.emit('pointertap');

    expect(event?.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSelectAgent).toHaveBeenCalledWith('app-engineering');
    expect(onSelectAgent).not.toHaveBeenCalledWith(null);
  });

  it('does not capture pointer or pan for click jitter before an agent sprite tap', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const selectedAgentIndex = scene.agents.findIndex((agent) => agent.agentId === scene.selectedAgentId);
    const onSelectAgent = vi.fn();
    const { container } = render(<WorldScene scene={scene} onSelectAgent={onSelectAgent} />);

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => false);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 320
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 502,
      clientY: 322
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 502,
      clientY: 322
    });

    const selectedAgentSprite = readAgentLayer()?.children[selectedAgentIndex] as
      | { emit: (event: string) => { stopPropagation: ReturnType<typeof vi.fn> } }
      | undefined;
    const event = selectedAgentSprite?.emit('pointertap');
    const center = readViewportCenter();

    expect((host as HTMLDivElement).setPointerCapture).not.toHaveBeenCalled();
    expect((host as HTMLDivElement).releasePointerCapture).not.toHaveBeenCalled();
    expect(center.x).toBeCloseTo(initialCenter.x, 4);
    expect(center.y).toBeCloseTo(initialCenter.y, 4);
    expect(event?.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSelectAgent).toHaveBeenCalledWith('app-engineering');
    expect(onSelectAgent).not.toHaveBeenCalledWith(null);
  });

  it('captures pointer only after drag movement exceeds the viewport pan threshold', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const onSelectAgent = vi.fn();
    const { container } = render(<WorldScene scene={scene} onSelectAgent={onSelectAgent} />);

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);

    let capturedPointerId: number | null = null;
    (host as HTMLDivElement).setPointerCapture = vi.fn((pointerId: number) => {
      capturedPointerId = pointerId;
    });
    (host as HTMLDivElement).releasePointerCapture = vi.fn((pointerId: number) => {
      if (capturedPointerId === pointerId) {
        capturedPointerId = null;
      }
    });
    (host as HTMLDivElement).hasPointerCapture = vi.fn((pointerId: number) => capturedPointerId === pointerId);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 7,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 320
    });

    expect((host as HTMLDivElement).setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 7,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 502,
      clientY: 322
    });

    expect((host as HTMLDivElement).setPointerCapture).not.toHaveBeenCalled();
    expect(readViewportCenter().x).toBeCloseTo(initialCenter.x, 4);

    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 7,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 512,
      clientY: 322
    });

    expect((host as HTMLDivElement).setPointerCapture).toHaveBeenCalledWith(7);
    expect(readViewportCenter().x).not.toBeCloseTo(initialCenter.x, 4);

    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 7,
      pointerType: 'mouse',
      button: 0,
      clientX: 512,
      clientY: 322
    });

    expect((host as HTMLDivElement).releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('clears a pending mouse drag when the pointer returns without the primary button pressed', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const onSelectAgent = vi.fn();
    const { container } = render(<WorldScene scene={scene} onSelectAgent={onSelectAgent} />);

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);

    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => false);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 11,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 320
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 11,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 502,
      clientY: 322
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 11,
      pointerType: 'mouse',
      buttons: 0,
      clientX: 560,
      clientY: 360
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 11,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 620,
      clientY: 360
    });

    expect((host as HTMLDivElement).setPointerCapture).not.toHaveBeenCalled();
    expect((host as HTMLDivElement).releasePointerCapture).not.toHaveBeenCalled();
    expect(readViewportCenter().x).toBeCloseTo(initialCenter.x, 4);
    expect(readViewportCenter().y).toBeCloseTo(initialCenter.y, 4);
    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('walks active employee sprites on throttled Pixi ticker frames without capping the renderer frame rate', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const homeAgent = scene.agents.find((agent) => agent.agentId === 'team-lead');
    const { unmount } = render(<WorldScene scene={scene} onSelectAgent={vi.fn()} />);

    expect(homeAgent).toBeDefined();

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const app = appInstances.at(-1);
    expect(app).toBeDefined();
    expect(app?.ticker.maxFPS).toBe(0);
    expect(app?.ticker.add).toHaveBeenCalledTimes(1);
    expect(app?.ticker.listeners.size).toBe(1);

    const agentLayer = readAgentLayer();
    const agentSprite = agentLayer?.children.find(
      (child) => child.x === homeAgent?.position.x && child.y === homeAgent?.position.y
    );

    expect(agentSprite).toBeDefined();

    const startX = agentSprite?.x ?? 0;
    const startY = agentSprite?.y ?? 0;

    act(() => {
      app?.ticker.tick(10);
    });

    expect(agentSprite?.x).toBe(startX);
    expect(agentSprite?.y).toBe(startY);

    act(() => {
      app?.ticker.tick(1000);
    });

    const offsetX = (agentSprite?.x ?? 0) - (homeAgent?.position.x ?? 0);
    const offsetY = (agentSprite?.y ?? 0) - (homeAgent?.position.y ?? 0);
    const distanceFromHome = Math.hypot(offsetX, offsetY);

    expect(Math.abs(offsetX)).toBeGreaterThan(1);
    expect(Math.abs(offsetY)).toBeGreaterThan(1);
    expect(distanceFromHome).toBeGreaterThan(3.1);
    expect(distanceFromHome).toBeLessThanOrEqual(10.1);
    expect(homeAgent?.position).toEqual({ x: 80, y: 120 });

    unmount();

    expect(app?.ticker.remove).toHaveBeenCalledTimes(1);
    expect(app?.ticker.listeners.size).toBe(0);
  });

  it('preserves visual continuity for unchanged agent homes across scene rerenders', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeScene();
    const activeAgent = scene.agents.find((agent) => agent.agentId === 'team-lead');
    const { rerender } = render(<WorldScene scene={scene} onSelectAgent={vi.fn()} />);

    expect(activeAgent).toBeDefined();

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    const activeAgentIndex = scene.agents.findIndex((agent) => agent.agentId === activeAgent?.agentId);
    const firstSprite = readAgentLayer()?.children[activeAgentIndex];

    act(() => {
      appInstances.at(-1)?.ticker.tick(1000);
    });

    const visualX = firstSprite?.x ?? activeAgent?.position.x ?? 0;
    const visualY = firstSprite?.y ?? activeAgent?.position.y ?? 0;

    expect(visualX).not.toBeCloseTo(activeAgent?.position.x ?? 0, 4);
    expect(visualY).not.toBeCloseTo(activeAgent?.position.y ?? 0, 4);

    rerender(
      <WorldScene
        scene={{
          ...scene,
          activeCorrelationId: 'corr-rerender',
          correlationParticipantAgentIds: ['team-lead']
        }}
        onSelectAgent={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
      const nextSprite = readAgentLayer()?.children[activeAgentIndex];

      expect(nextSprite?.x).toBeCloseTo(visualX, 4);
      expect(nextSprite?.y).toBeCloseTo(visualY, 4);
    });

    expect(activeAgent?.position).toEqual({ x: 80, y: 120 });
  });

  it('routes active correlation overlay clamp padding into the viewport inspector and clears it when the overlay disappears', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const inactiveScene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const activeScene = {
      ...inactiveScene,
      activeCorrelationId: 'corr-app-review',
      correlationParticipantAgentIds: ['app-engineering', 'team-lead']
    } satisfies AiTownSceneModel;
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={inactiveScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={activeScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const overlay = await screen.findByRole('region', { name: 'Active correlation' });
    setElementRect(overlay, { left: 700, top: 18, width: 300, height: 200 });
    overlay.classList.add('is-measured');

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 300
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={inactiveScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });
  });

  it('clears active correlation overlay clamp padding when the overlay is intentionally hidden', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const activeScene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: [],
      activeCorrelationId: 'corr-app-review',
      correlationParticipantAgentIds: ['app-engineering', 'team-lead']
    } satisfies AiTownSceneModel;
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={activeScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    const overlay = await screen.findByRole('region', { name: 'Active correlation' });
    setElementRect(overlay, { left: 700, top: 18, width: 300, height: 200 });
    overlay.classList.add('is-measured');

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 300
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={activeScene} onSelectAgent={vi.fn()} showActiveCorrelationOverlay={false} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });
  });

  it('recovers from renderer_init_failed through Retry renderer and registers the viewport inspector after retry cleanup', async () => {
    const tracker = installViewportInspectorTracker();
    appInitMock
      .mockReset()
      .mockRejectedValueOnce(new Error('renderer_init_failed'))
      .mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { unmount } = render(<WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />);

    try {
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('renderer_init_failed');
      });
      expect(readViewportInspector()).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: 'Retry renderer' }));

      const region = await screen.findByRole('region', { name: 'Selected watch links' });

      expect(region).toBeVisible();
      expect(readViewportInspector()).toBeDefined();
      expect(readViewportInspector()?.read().worldWidth).toBe(768);
      expect(appInitMock).toHaveBeenCalledTimes(2);

      const cleanupAssignmentIndex = tracker.assignedValues.findIndex((value) => value === undefined);
      const registrationAssignmentIndex = tracker.assignedValues.findIndex((value) => value !== undefined);

      expect(cleanupAssignmentIndex).toBeGreaterThanOrEqual(0);
      expect(registrationAssignmentIndex).toBeGreaterThan(cleanupAssignmentIndex);
    } finally {
      unmount();
      tracker.restore();
    }
  });

  it('recovers from asset_load_failed through Retry renderer and registers the viewport inspector after retry cleanup', async () => {
    const tracker = installViewportInspectorTracker();
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets)
      .mockRejectedValueOnce(new Error('asset_load_failed'))
      .mockResolvedValue(makeAssets());

    const { unmount } = render(<WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />);

    try {
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('asset_load_failed');
      });
      expect(readViewportInspector()).toBeUndefined();
      expect(appDestroyMock).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Retry renderer' }));

      const region = await screen.findByRole('region', { name: 'Selected watch links' });

      expect(region).toBeVisible();
      expect(readViewportInspector()).toBeDefined();
      expect(readViewportInspector()?.read().worldWidth).toBe(768);

      const cleanupAssignmentIndex = tracker.assignedValues.findIndex((value) => value === undefined);
      const registrationAssignmentIndex = tracker.assignedValues.findIndex((value) => value !== undefined);

      expect(cleanupAssignmentIndex).toBeGreaterThanOrEqual(0);
      expect(registrationAssignmentIndex).toBeGreaterThan(cleanupAssignmentIndex);
    } finally {
      unmount();
      tracker.restore();
    }
  });

  it('registers the global viewport inspector on successful mount and clears it on unmount', async () => {
    const tracker = installViewportInspectorTracker();
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { unmount } = render(<WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />);

    try {
      await waitFor(() => {
        expect(readViewportInspector()).toBeDefined();
      });

      expect(readViewportInspector()?.read().worldWidth).toBe(768);

      unmount();

      expect(readViewportInspector()).toBeUndefined();
      expect(tracker.assignedValues.at(-1)).toBeUndefined();
      expect(appDestroyMock).toHaveBeenCalled();
    } finally {
      tracker.restore();
    }
  });

  it('routes live watch-overlay clamp padding into the viewport inspector on DOM mutation alone and clears it when the overlay disappears', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const onSelectAgent = vi.fn();
    const overlayScene = makeScene();
    const sceneWithoutOverlay = { ...overlayScene, selectedAgentId: null };
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={sceneWithoutOverlay} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={overlayScene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    const overlay = container.querySelector('.aitown-watch-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    setElementRect(overlay as HTMLElement, { left: 700, top: 560, width: 300, height: 240 });

    await waitFor(() => {
      expect(readViewportInspector()).toBeDefined();
      expect(readViewportInspector()?.read().clampPadding.top).toBe(0);
      expect((readViewportInspector()?.read().clampPadding.right ?? 0)).toBeGreaterThan(0);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={sceneWithoutOverlay} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()).toBeDefined();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });
  });

  it('biases selected-agent recenter into the unobscured lane when clamp padding is already active', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const expectedBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
  });

  it('biases selected-agent recenter into the split-topline safe lane before Hub opens', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__topline">
            <span>Live focus</span>
            <span>Viewport</span>
          </div>
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const liveFocus = container.querySelector('.aitown-panel__topline > span:first-child');
    const viewport = container.querySelector('.aitown-panel__topline > span:last-child');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(liveFocus).toBeInstanceOf(HTMLElement);
    expect(viewport).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(liveFocus as HTMLElement, { left: 0, top: 148, width: 320, height: 144 });
    setElementRect(viewport as HTMLElement, { left: 720, top: 148, width: 280, height: 176 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedBiasX = (280 - 320) / ((inspection?.scale ?? 1) * 2);

      expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    });
  });

  it('re-applies selected-agent safe-area recenter when clamp padding changes for the same selection', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const sceneWithoutOverlay = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const overlayScene = {
      ...sceneWithoutOverlay,
      watchEdges: makeScene().watchEdges
    };
    const selectedAgent = sceneWithoutOverlay.agents.find(
      (agent) => agent.agentId === sceneWithoutOverlay.selectedAgentId
    );
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={sceneWithoutOverlay} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');

    expect(host).toBeInstanceOf(HTMLDivElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    await waitFor(() => {
      expect(readViewportCenter().x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={overlayScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const overlay = container.querySelector('.aitown-watch-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    setElementRect(overlay as HTMLElement, { left: 700, top: 560, width: 300, height: 240 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 300
      });
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const expectedBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
  });

  it('preserves a manual dragged view when clamp padding changes for the same selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 1000, top: 80, width: 0, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 320
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 430,
      clientY: 320
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 430,
      clientY: 320
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(initialCenter.x, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
    });

    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });
    act(() => {
      (stats as HTMLElement).textContent = 'Expanded stats panel';
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspection = readViewportInspector()?.read();
    const centerAfterPaddingChange = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(centerAfterPaddingChange.x).toBeCloseTo(manualCenter.x, 4);
    expect(centerAfterPaddingChange.x).not.toBeCloseTo(expectedFollowCenterX, 4);
  });

  it('preserves a portrait selected-watch manual view across clear and reselect of the same agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(initialCenter.x, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...clearedScene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(reselectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspection = readViewportInspector()?.read();
    const reselectedCenter = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(reselectedCenter.x).toBeCloseTo(manualCenter.x, 4);
    expect(reselectedCenter.y).toBeCloseTo(manualCenter.y, 4);
    expect(reselectedCenter.x).not.toBeCloseTo(expectedFollowCenterX, 4);
  });

  it('preserves a portrait selected-watch manual view when clearing before clamp padding sync completes', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    await screen.findByRole('region', { name: 'Selected watch links' });
    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(initialCenter.x, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(reselectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspection = readViewportInspector()?.read();
    const reselectedCenter = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(reselectedCenter.x).toBeCloseTo(manualCenter.x, 4);
    expect(reselectedCenter.y).toBeCloseTo(manualCenter.y, 4);
    expect(reselectedCenter.x).not.toBeCloseTo(expectedFollowCenterX, 4);
  });

  it('recenters when deselected right-side safe-area contributors change after a quick clear before watch clamp sync', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });
    setElementRect(stats as HTMLElement, { left: 390, top: 80, width: 0, height: 140 });

    await screen.findByRole('region', { name: 'Selected watch links' });
    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    setElementRect(stats as HTMLElement, { left: 110, top: 80, width: 280, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(stats as HTMLElement, { left: 110, top: 80, width: 280, height: 140 });
    setElementRect(reselectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    const inspection = readViewportInspector()?.read();
    const reselectedCenter = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(reselectedCenter.x).toBeCloseTo(expectedFollowCenterX, 4);
    expect(reselectedCenter.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    expect(reselectedCenter.x).not.toBeCloseTo(manualCenter.x, 4);
  });

  it('preserves a deselected manual pose after dragging again following a deselected layout change before reselecting the same selected-watch agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });
    setElementRect(stats as HTMLElement, { left: 390, top: 80, width: 0, height: 140 });

    await screen.findByRole('region', { name: 'Selected watch links' });
    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    setElementRect(stats as HTMLElement, { left: 110, top: 80, width: 280, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 265,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 265,
      clientY: 420
    });

    const updatedManualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(stats as HTMLElement, { left: 110, top: 80, width: 280, height: 140 });
    setElementRect(reselectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    const inspection = readViewportInspector()?.read();
    const reselectedCenter = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(reselectedCenter.x).toBeCloseTo(updatedManualCenter.x, 4);
    expect(reselectedCenter.y).toBeCloseTo(updatedManualCenter.y, 4);
    expect(reselectedCenter.x).not.toBeCloseTo(expectedFollowCenterX, 4);
  });

  it('preserves the latest manual pose across repeated clear and reselect cycles after mounting without a selected watch overlay', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const selectedScene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...selectedScene,
      selectedAgentId: null,
      agents: selectedScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={selectedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const firstOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(firstOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const firstManualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...selectedScene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const secondOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(secondOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    expect(readViewportCenter().x).toBeCloseTo(firstManualCenter.x, 4);
    expect(readViewportCenter().y).toBeCloseTo(firstManualCenter.y, 4);

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 265,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 265,
      clientY: 420
    });

    const secondManualCenter = readViewportCenter();
    expect(secondManualCenter.x).not.toBeCloseTo(firstManualCenter.x, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...selectedScene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const thirdOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(thirdOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    expect(readViewportCenter().x).toBeCloseTo(secondManualCenter.x, 4);
    expect(readViewportCenter().y).toBeCloseTo(secondManualCenter.y, 4);
  });

  it('preserves the manual pose when deselected layout changes return to the original geometry before reselecting the same selected-watch agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const { container, rerender } = render(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });
    setElementRect(stats as HTMLElement, { left: 390, top: 80, width: 0, height: 140 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    setElementRect(stats as HTMLElement, { left: 110, top: 80, width: 280, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 280
      });
    });

    setElementRect(stats as HTMLElement, { left: 390, top: 80, width: 0, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    rerender(
      <main className="aitown-shell">
        <div className="aitown-shell__stats">Stats</div>
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(stats as HTMLElement, { left: 390, top: 80, width: 0, height: 140 });
    setElementRect(reselectedOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
    expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
  });

  it('preserves a deselected manual pose after user zooms before reselecting the same selected-watch agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
    });

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 844 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 320, height: 844 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    const scaleBeforeZoom = readViewportInspector()?.read().scale ?? 1;
    const zoomedScale = readViewportInspector()?.zoomToMinimum();
    const zoomedCenter = readViewportCenter();
    expect(zoomedScale).not.toBeCloseTo(scaleBeforeZoom, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(reselectedWatchOverlay, { left: 80, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspection = readViewportInspector()?.read();
    const reselectedCenter = readViewportCenter();
    const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(reselectedCenter.x).toBeCloseTo(zoomedCenter.x, 4);
    expect(reselectedCenter.y).toBeCloseTo(zoomedCenter.y, 4);
    expect(reselectedCenter.x).not.toBeCloseTo(expectedFollowCenterX, 4);
  });

  it('recenters a portrait selected-watch reselect when the safe-area geometry changed while deselected', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 600, height: 844 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(reselectedWatchOverlay, { left: 360, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedFollowCenterX = (selectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(inspection?.clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(center.x).toBeCloseTo(expectedFollowCenterX, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
      expect(center.x).not.toBeCloseTo(manualCenter.x, 4);
    });
  });

  it('recenters a portrait selected-watch reselect when the same agent moved while deselected', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const movedWhileClearedScene = {
      ...clearedScene,
      agents: clearedScene.agents.map((agent) =>
        agent.agentId === scene.selectedAgentId
          ? {
              ...agent,
              position: {
                x: agent.position.x + 80,
                y: agent.position.y + 40
              }
            }
          : agent
      )
    } satisfies AiTownSceneModel;
    const movedReselectedScene = {
      ...movedWhileClearedScene,
      selectedAgentId: scene.selectedAgentId,
      agents: movedWhileClearedScene.agents.map((agent) => ({
        ...agent,
        selected: agent.agentId === scene.selectedAgentId
      }))
    } satisfies AiTownSceneModel;
    const movedSelectedAgent = movedReselectedScene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(movedSelectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={movedWhileClearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={movedReselectedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const reselectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(reselectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedFollowCenterX = (movedSelectedAgent?.position.x ?? 0) + (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(inspection?.clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(center.x).toBeCloseTo(expectedFollowCenterX, 4);
      expect(center.y).toBeCloseTo(movedSelectedAgent?.position.y ?? 0, 4);
      expect(center.x).not.toBeCloseTo(manualCenter.x, 4);
    });
  });

  it('recenters a same-agent reselect outside selected-watch mode after a manual pan', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    } satisfies AiTownSceneModel;
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read()).toBeDefined();
    });

    const initialCenter = readViewportCenter();
    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 400
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 420,
      clientY: 400
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 420,
      clientY: 400
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(initialCenter.x, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={{ ...scene }} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      const center = readViewportCenter();
      expect(center.x).toBeCloseTo(initialCenter.x, 4);
      expect(center.y).toBeCloseTo(initialCenter.y, 4);
      expect(center.x).not.toBeCloseTo(manualCenter.x, 4);
    });
  });

  it('recenters a same-agent reselect when selected-watch mode disappears while deselected', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = makeWideSelectedAgentScene();
    const clearedScene = {
      ...scene,
      selectedAgentId: null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const nonWatchReselectedScene = {
      ...scene,
      watchEdges: [],
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: agent.agentId === scene.selectedAgentId
      }))
    } satisfies AiTownSceneModel;
    const selectedAgent = nonWatchReselectedScene.agents.find((agent) => agent.agentId === nonWatchReselectedScene.selectedAgentId);
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 390, height: 844 });

    const selectedWatchOverlay = await screen.findByRole('region', { name: 'Selected watch links' });
    setElementRect(selectedWatchOverlay, { left: 150, top: 120, width: 240, height: 220 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 195,
      clientY: 420
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 125,
      clientY: 420
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 125,
      clientY: 420
    });

    const manualCenter = readViewportCenter();

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={clearedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      expect(readViewportCenter().x).toBeCloseTo(manualCenter.x, 4);
      expect(readViewportCenter().y).toBeCloseTo(manualCenter.y, 4);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={nonWatchReselectedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Selected watch links' })).not.toBeInTheDocument();
      const center = readViewportCenter();
      expect(center.x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
      expect(center.x).not.toBeCloseTo(manualCenter.x, 4);
    });
  });

  it('recomputes selected-agent safe-area recenter when scale changes without a clamp-padding delta', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 600 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const initialInspection = readViewportInspector()?.read();
    const initialScale = initialInspection?.scale ?? 1;

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      expect(inspection?.clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(inspection?.scale).not.toBeCloseTo(initialScale, 4);
    });

    const resizedInspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const expectedBiasX = (resizedInspection?.clampPadding.right ?? 0) / ((resizedInspection?.scale ?? 1) * 2);

    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
  });

  it('follows the same selected agent into the current safe-area lane when it moves under active right clamp padding', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const movedScene = {
      ...scene,
      agents: scene.agents.map((agent) =>
        agent.agentId === scene.selectedAgentId
          ? {
              ...agent,
              position: {
                x: agent.position.x + 180,
                y: agent.position.y + 60
              }
            }
          : agent
      )
    } satisfies AiTownSceneModel;
    const movedSelectedAgent = movedScene.agents.find(
      (agent) => agent.agentId === movedScene.selectedAgentId
    );
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    expect(movedSelectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={movedScene} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const movedHost = container.querySelector('.aitown-world__host');
    const movedStats = container.querySelector('.aitown-shell__stats');

    expect(movedHost).toBeInstanceOf(HTMLDivElement);
    expect(movedStats).toBeInstanceOf(HTMLElement);

    setElementRect(movedHost as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(movedStats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(inspection?.clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(center.x).toBeCloseTo((movedSelectedAgent?.position.x ?? 0) + expectedBiasX, 4);
      expect(center.y).toBeCloseTo(movedSelectedAgent?.position.y ?? 0, 4);
    });
  });

  it('restores the fresh-load entry view when resetViewSignal changes without a selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <ResettableWorldScene scene={scene} onSelectAgent={onSelectAgent} resetViewSignal={0} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');

    expect(host).toBeInstanceOf(HTMLDivElement);

    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readViewportCenter().x).toBeCloseTo(scene.pixelWidth / 2, 4);
      expect(readViewportCenter().y).toBeCloseTo(scene.pixelHeight / 2, 4);
    });

    fireEvent.pointerDown(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 320
    });
    fireEvent.pointerMove(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 380,
      clientY: 260
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 380,
      clientY: 260
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(scene.pixelWidth / 2, 4);
    expect(manualCenter.y).not.toBeCloseTo(scene.pixelHeight / 2, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <ResettableWorldScene scene={scene} onSelectAgent={onSelectAgent} resetViewSignal={1} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(readViewportCenter().x).toBeCloseTo(scene.pixelWidth / 2, 4);
      expect(readViewportCenter().y).toBeCloseTo(scene.pixelHeight / 2, 4);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('restores the selected-agent safe-area default when resetViewSignal changes', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const scene = {
      ...makeWideSelectedAgentScene(),
      watchEdges: []
    };
    const selectedAgent = scene.agents.find((agent) => agent.agentId === scene.selectedAgentId);
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <ResettableWorldScene scene={scene} onSelectAgent={onSelectAgent} resetViewSignal={0} />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    (host as HTMLDivElement).setPointerCapture = vi.fn();
    (host as HTMLDivElement).releasePointerCapture = vi.fn();
    (host as HTMLDivElement).hasPointerCapture = vi.fn(() => true);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    const inspectionBeforeReset = readViewportInspector()?.read();
    const expectedDefaultCenterX =
      (selectedAgent?.position.x ?? 0) +
      (inspectionBeforeReset?.clampPadding.right ?? 0) / ((inspectionBeforeReset?.scale ?? 1) * 2);
    const manualCenterX = expectedDefaultCenterX - 80;

    readViewportInspector()?.moveCenter(manualCenterX, selectedAgent?.position.y ?? 0);

    await waitFor(() => {
      expect(readViewportCenter().x).toBeCloseTo(manualCenterX, 4);
    });

    const manualCenter = readViewportCenter();
    expect(manualCenter.x).not.toBeCloseTo(expectedDefaultCenterX, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <ResettableWorldScene scene={scene} onSelectAgent={onSelectAgent} resetViewSignal={1} />
        </section>
      </main>
    );

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('centers explicit agent focus requests without safe-area bias', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const targetAgent = scene.agents.find((agent) => agent.agentId === 'app-engineering');
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={scene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: 'app-engineering', requestId: 1 }}
          />
        </section>
      </main>
    );

    expect(targetAgent).toBeDefined();
    if (!targetAgent) {
      throw new Error('missing target agent');
    }

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(safeAreaBiasX).toBeGreaterThan(0);
      expect(center.x).toBeCloseTo(targetAgent?.position.x ?? 0, 4);
      expect(center.y).toBeCloseTo(targetAgent?.position.y ?? 0, 4);
      expect(center.x).not.toBeCloseTo((targetAgent?.position.x ?? 0) + safeAreaBiasX, 4);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('centers explicit agent focus requests on the current visual sprite position', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const targetAgentIndex = scene.agents.findIndex((agent) => agent.agentId === 'app-engineering');
    const targetAgent = scene.agents[targetAgentIndex];
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    expect(targetAgent).toBeDefined();
    if (!targetAgent) {
      throw new Error('missing target agent');
    }

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    act(() => {
      appInstances.at(-1)?.ticker.tick(1000);
    });

    const targetSprite = readAgentLayer()?.children[targetAgentIndex];
    const visualX = targetSprite?.x ?? targetAgent.position.x;
    const visualY = targetSprite?.y ?? targetAgent.position.y;

    expect(Math.hypot(visualX - targetAgent.position.x, visualY - targetAgent.position.y)).toBeGreaterThan(0.1);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={scene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: targetAgent.agentId, requestId: 1 }}
          />
        </section>
      </main>
    );

    await waitFor(() => {
      const center = readViewportCenter();

      expect(center.x).toBeCloseTo(visualX, 4);
      expect(center.y).toBeCloseTo(visualY, 4);
      expect(Math.hypot(center.x - targetAgent.position.x, center.y - targetAgent.position.y)).toBeGreaterThan(0.1);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('clears direct focus when a map tap deselects after an explicit focus request with no selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const targetAgent = scene.agents.find((agent) => agent.agentId === 'app-engineering');
    const selectedScene = {
      ...scene,
      selectedAgentId: targetAgent?.agentId ?? null,
      agents: scene.agents.map((agent) => ({
        ...agent,
        selected: agent.agentId === targetAgent?.agentId
      }))
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={scene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    expect(targetAgent).toBeDefined();
    if (!targetAgent) {
      throw new Error('missing target agent');
    }

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(scene.agents.length);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={scene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: targetAgent.agentId, requestId: 1 }}
          />
        </section>
      </main>
    );

    await waitFor(() => {
      const center = readViewportCenter();
      expect(center.x).toBeCloseTo(targetAgent.position.x, 4);
      expect(center.y).toBeCloseTo(targetAgent.position.y, 4);
    });

    readMapContainer()?.emit('pointertap');

    expect(onSelectAgent).toHaveBeenCalledWith(null);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={selectedScene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    const selectedHost = container.querySelector('.aitown-world__host');
    const selectedStats = container.querySelector('.aitown-shell__stats');

    expect(selectedHost).toBeInstanceOf(HTMLDivElement);
    expect(selectedStats).toBeInstanceOf(HTMLElement);

    setElementRect(selectedHost as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(selectedStats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(safeAreaBiasX).toBeGreaterThan(0);
      expect(center.x).toBeCloseTo(targetAgent.position.x + safeAreaBiasX, 4);
      expect(center.y).toBeCloseTo(targetAgent.position.y, 4);
      expect(center.x).not.toBeCloseTo(targetAgent.position.x, 4);
    });
  });

  it('ignores stale sprite motion state when a focus request arrives with updated agent coordinates', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const initialScene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const initialAgentIndex = initialScene.agents.findIndex((agent) => agent.agentId === 'app-engineering');
    const initialAgent = initialScene.agents[initialAgentIndex];

    expect(initialAgent).toBeDefined();
    if (!initialAgent) {
      throw new Error('missing initial agent');
    }

    const movedAgent = makeAgent({
      ...initialAgent,
      position: { x: initialAgent.position.x + 700, y: initialAgent.position.y + 260 }
    });
    const movedScene = {
      ...initialScene,
      agents: initialScene.agents.map((agent) => (agent.agentId === movedAgent.agentId ? movedAgent : agent))
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene scene={initialScene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    expect(initialAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    expect(host).toBeInstanceOf(HTMLDivElement);
    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(initialScene.agents.length);
    });

    act(() => {
      appInstances.at(-1)?.ticker.tick(1000);
    });

    const staleSprite = readAgentLayer()?.children[initialAgentIndex];
    const staleVisualX = staleSprite?.x ?? initialAgent.position.x;
    const staleVisualY = staleSprite?.y ?? initialAgent.position.y;

    expect(Math.hypot(staleVisualX - initialAgent.position.x, staleVisualY - initialAgent.position.y)).toBeGreaterThan(0.1);
    expect(staleVisualX).not.toBeCloseTo(movedAgent.position.x, 4);
    expect(staleVisualY).not.toBeCloseTo(movedAgent.position.y, 4);

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <WorldScene
            scene={movedScene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: movedAgent.agentId, requestId: 1 }}
          />
        </section>
      </main>
    );

    await waitFor(() => {
      const center = readViewportCenter();

      expect(center.x).toBeCloseTo(movedAgent.position.x, 4);
      expect(center.y).toBeCloseTo(movedAgent.position.y, 4);
      expect(center.x).not.toBeCloseTo(staleVisualX, 4);
      expect(center.y).not.toBeCloseTo(staleVisualY, 4);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('keeps agentFocusRequest direct-centered after the selected-agent redraw under right clamp', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const initialScene = {
      ...baseScene,
      watchEdges: [],
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      }))
    } satisfies AiTownSceneModel;
    const tokenomicsAgent = makeAgent({
      agentId: 'tokenomics',
      displayName: 'Tokenomics Agent',
      characterKey: 'f3',
      rolePawnKey: undefined,
      position: { x: 2600, y: 800 },
      selected: true,
      severity: 'yellow',
      phase: 'active'
    });
    const selectedScene = {
      ...initialScene,
      selectedAgentId: tokenomicsAgent.agentId,
      agents: [
        ...initialScene.agents,
        tokenomicsAgent
      ]
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={initialScene} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(readAgentLayer()?.children).toHaveLength(initialScene.agents.length);
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={selectedScene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: tokenomicsAgent.agentId, requestId: 1 }}
          />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(readAgentLayer()?.children).toHaveLength(selectedScene.agents.length);
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(safeAreaBiasX).toBeGreaterThan(0);
    expect(center.x).toBeCloseTo(tokenomicsAgent.position.x, 4);
    expect(center.y).toBeCloseTo(tokenomicsAgent.position.y, 4);
    expect(center.x).not.toBeCloseTo(tokenomicsAgent.position.x + safeAreaBiasX, 4);
    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('keeps agentFocusRequest direct-centered when clamp padding changes for the same selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const selectedAgent = baseScene.agents.find((agent) => agent.agentId === baseScene.selectedAgentId);
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={baseScene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: selectedAgent?.agentId ?? 'app-engineering', requestId: 1 }}
          />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(readAgentLayer()?.children).toHaveLength(baseScene.agents.length);
    });

    await waitFor(() => {
      const center = readViewportCenter();

      expect(center.x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    });

    setElementRect(stats as HTMLElement, { left: 680, top: 80, width: 320, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 320
      });
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(safeAreaBiasX).toBeGreaterThan(0);
    expect(center.x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    expect(center.x).not.toBeCloseTo((selectedAgent?.position.x ?? 0) + safeAreaBiasX, 4);
    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('clears direct focus after an ordinary sprite tap of the same selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const selectedAgentIndex = baseScene.agents.findIndex((agent) => agent.agentId === baseScene.selectedAgentId);
    const selectedAgent = baseScene.agents[selectedAgentIndex];
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={baseScene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: selectedAgent?.agentId ?? 'app-engineering', requestId: 1 }}
          />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(readAgentLayer()?.children).toHaveLength(baseScene.agents.length);
    });

    await waitFor(() => {
      const center = readViewportCenter();

      expect(center.x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    });

    const selectedAgentSprite = readAgentLayer()?.children[selectedAgentIndex] as
      | { emit: (event: string) => { stopPropagation: ReturnType<typeof vi.fn> } }
      | undefined;
    const event = selectedAgentSprite?.emit('pointertap');

    expect(event?.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSelectAgent).toHaveBeenCalledWith(selectedAgent?.agentId);

    setElementRect(stats as HTMLElement, { left: 680, top: 80, width: 320, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 320
      });
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(safeAreaBiasX).toBeGreaterThan(0);
    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + safeAreaBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    expect(center.x).not.toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
  });

  it('clears direct focus after active correlation overlay inspect of the same selected agent', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = {
      ...makeWideSelectedAgentScene(),
      activeCorrelationId: 'corr-app-review',
      correlationParticipantAgentIds: ['app-engineering', 'team-lead']
    } satisfies AiTownSceneModel;
    const selectedAgent = baseScene.agents.find((agent) => agent.agentId === baseScene.selectedAgentId);
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={baseScene}
            onSelectAgent={onSelectAgent}
            agentFocusRequest={{ agentId: selectedAgent?.agentId ?? 'app-engineering', requestId: 1 }}
          />
        </section>
      </main>
    );

    expect(selectedAgent).toBeDefined();

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 240
      });
      expect(screen.getByRole('region', { name: 'Active correlation' })).toBeVisible();
    });

    await waitFor(() => {
      const center = readViewportCenter();

      expect(center.x).toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
      expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Inspect App Engineering Agent from active correlation' }));

    expect(onSelectAgent).toHaveBeenCalledWith(selectedAgent?.agentId);

    setElementRect(stats as HTMLElement, { left: 680, top: 80, width: 320, height: 140 });
    act(() => {
      MockResizeObserver.triggerAll();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 320
      });
    });

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const safeAreaBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

    expect(safeAreaBiasX).toBeGreaterThan(0);
    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + safeAreaBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
    expect(center.x).not.toBeCloseTo(selectedAgent?.position.x ?? 0, 4);
  });

  it('focuses a requested zone anchor through the current safe-area lane', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      })),
      zones: [
        ...baseScene.zones,
        {
          zoneId: 'review-zone',
          label: 'Review Zone',
          kind: 'shared',
          anchor: { x: 70, y: 50 },
          occupantIds: []
        }
      ]
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene
            scene={scene}
            onSelectAgent={onSelectAgent}
            zoneFocusRequest={{ zoneId: 'review-zone', requestId: 1 }}
          />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(stats as HTMLElement, { left: 760, top: 80, width: 240, height: 140 });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      const center = readViewportCenter();
      const expectedBiasX = (inspection?.clampPadding.right ?? 0) / ((inspection?.scale ?? 1) * 2);

      expect(center.x).toBeCloseTo(70 * scene.map.tileDim + expectedBiasX, 4);
      expect(center.y).toBeCloseTo(50 * scene.map.tileDim, 4);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('keeps focused zone anchors outside a tall split-topline viewport card by using the unobscured lane', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const baseScene = makeWideSelectedAgentScene();
    const scene = {
      ...baseScene,
      selectedAgentId: null,
      agents: baseScene.agents.map((agent) => ({
        ...agent,
        selected: false
      })),
      zones: [
        ...baseScene.zones,
        {
          zoneId: 'review-zone',
          label: 'Review Zone',
          kind: 'shared',
          anchor: { x: 70, y: 50 },
          occupantIds: []
        }
      ]
    } satisfies AiTownSceneModel;
    const onSelectAgent = vi.fn();
    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__topline">
            <span id="live-focus">Live Focus</span>
            <span id="viewport">Viewport Hot zones Hot zones Hot zones</span>
          </div>
          <WorldScene
            scene={scene}
            onSelectAgent={onSelectAgent}
            zoneFocusRequest={{ zoneId: 'review-zone', requestId: 1 }}
          />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const liveFocus = container.querySelector('#live-focus');
    const viewportCard = container.querySelector('#viewport');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(liveFocus).toBeInstanceOf(HTMLElement);
    expect(viewportCard).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(liveFocus as HTMLElement, { left: 0, top: 148, width: 320, height: 144 });
    setElementRect(viewportCard as HTMLElement, { left: 720, top: 148, width: 280, height: 460 });

    await waitFor(() => {
      const inspection = readViewportInspector()?.read();
      expect(inspection).toBeDefined();
      expect(inspection?.clampPadding).toEqual({
        top: 0,
        right: 280
      });

      const zoneAnchorX = 70 * scene.map.tileDim;
      const zoneAnchorY = 50 * scene.map.tileDim;
      const projectedAnchor = {
        x: ((zoneAnchorX - (inspection?.left ?? 0)) / Math.max((inspection?.right ?? 0) - (inspection?.left ?? 0), Number.EPSILON)) * (inspection?.screenWidth ?? 0),
        y: ((zoneAnchorY - (inspection?.top ?? 0)) / Math.max((inspection?.bottom ?? 0) - (inspection?.top ?? 0), Number.EPSILON)) * (inspection?.screenHeight ?? 0)
      };
      const liveFocusRect = (liveFocus as HTMLElement).getBoundingClientRect();
      const viewportCardRect = (viewportCard as HTMLElement).getBoundingClientRect();

      expect(projectedAnchor.x).toBeGreaterThan(liveFocusRect.right);
      expect(projectedAnchor.x).toBeLessThan(viewportCardRect.left);
      expect(projectedAnchor.y).toBeGreaterThan(viewportCardRect.top);
      expect(projectedAnchor.y).toBeLessThan(viewportCardRect.bottom);
    });

    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it('does not resync clamp padding for non-contributor text mutations under document.body', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <>
        <div className="test-noise">Noise</div>
        <main className="aitown-shell">
          <section className="aitown-panel aitown-panel--game">
            <div className="aitown-panel__toolbar">Toolbar</div>
            <div className="aitown-shell__stats">Stats</div>
            <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
          </section>
        </main>
      </>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');
    const noise = container.querySelector('.test-noise');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    expect(noise).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    const hostRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 800,
          width: 1000,
          height: 800
        }) as DOMRect
    );
    const toolbarRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 56,
          width: 1000,
          height: 56
        }) as DOMRect
    );
    const statsRect = vi.fn(
      () =>
        ({
          left: 820,
          top: 80,
          right: 1000,
          bottom: 220,
          width: 180,
          height: 140
        }) as DOMRect
    );

    (host as HTMLDivElement).getBoundingClientRect = hostRect;
    (toolbar as HTMLElement).getBoundingClientRect = toolbarRect;
    (stats as HTMLElement).getBoundingClientRect = statsRect;

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    hostRect.mockClear();
    toolbarRect.mockClear();
    statsRect.mockClear();

    act(() => {
      getOnlyTextNode(noise as HTMLElement).data = 'Expanded unrelated copy';
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 180
    });
  });

  it('does not resync clamp padding for fixed-width overlay text mutations inside the shell', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
        <aside className="aitown-hub-sheet">Hub summary</aside>
        <section className="aitown-watch-overlay">Watch links</section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');
    const hubSheet = container.querySelector('.aitown-hub-sheet');
    const watchOverlay = container.querySelector('.aitown-watch-overlay');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    expect(hubSheet).toBeInstanceOf(HTMLElement);
    expect(watchOverlay).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    const hostRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 800,
          width: 1000,
          height: 800
        }) as DOMRect
    );
    const toolbarRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 56,
          width: 1000,
          height: 56
        }) as DOMRect
    );
    const statsRect = vi.fn(
      () =>
        ({
          left: 820,
          top: 80,
          right: 1000,
          bottom: 220,
          width: 180,
          height: 140
        }) as DOMRect
    );
    const hubSheetRect = vi.fn(
      () =>
        ({
          left: 680,
          top: 0,
          right: 1000,
          bottom: 800,
          width: 320,
          height: 800
        }) as DOMRect
    );
    const watchOverlayRect = vi.fn(
      () =>
        ({
          left: 700,
          top: 560,
          right: 1000,
          bottom: 760,
          width: 300,
          height: 200
        }) as DOMRect
    );

    (host as HTMLDivElement).getBoundingClientRect = hostRect;
    (toolbar as HTMLElement).getBoundingClientRect = toolbarRect;
    (stats as HTMLElement).getBoundingClientRect = statsRect;
    (hubSheet as HTMLElement).getBoundingClientRect = hubSheetRect;
    (watchOverlay as HTMLElement).getBoundingClientRect = watchOverlayRect;

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 320
      });
    });

    hostRect.mockClear();
    toolbarRect.mockClear();
    statsRect.mockClear();
    hubSheetRect.mockClear();
    watchOverlayRect.mockClear();

    act(() => {
      getOnlyTextNode(hubSheet as HTMLElement).data = 'Expanded hub copy that keeps the same fixed width';
      getOnlyTextNode(watchOverlay as HTMLElement).data = 'Expanded watch overlay copy that keeps the same fixed width';
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(hubSheetRect).not.toHaveBeenCalled();
    expect(watchOverlayRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 320
    });

    hostRect.mockClear();
    toolbarRect.mockClear();
    statsRect.mockClear();
    hubSheetRect.mockClear();
    watchOverlayRect.mockClear();

    const hubSheetChild = document.createElement('div');
    hubSheetChild.textContent = 'Hub details';
    const watchOverlayChild = document.createElement('div');
    watchOverlayChild.textContent = 'Overlay details';

    act(() => {
      (hubSheet as HTMLElement).appendChild(hubSheetChild);
      (watchOverlay as HTMLElement).appendChild(watchOverlayChild);
      hubSheetChild.className = 'expanded';
      watchOverlayChild.style.color = 'red';
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(hubSheetRect).not.toHaveBeenCalled();
    expect(watchOverlayRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 320
    });
  });

  it('does not resync clamp padding for unrelated childList churn under document.body', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const shell = container.querySelector('.aitown-shell');
    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    const hostRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 800,
          width: 1000,
          height: 800
        }) as DOMRect
    );
    const toolbarRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 56,
          width: 1000,
          height: 56
        }) as DOMRect
    );
    const statsRect = vi.fn(
      () =>
        ({
          left: 820,
          top: 80,
          right: 1000,
          bottom: 220,
          width: 180,
          height: 140
        }) as DOMRect
    );

    (host as HTMLDivElement).getBoundingClientRect = hostRect;
    (toolbar as HTMLElement).getBoundingClientRect = toolbarRect;
    (stats as HTMLElement).getBoundingClientRect = statsRect;

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    hostRect.mockClear();
    toolbarRect.mockClear();
    statsRect.mockClear();

    const unrelated = document.createElement('div');
    unrelated.className = 'test-noise';
    unrelated.textContent = 'Noise';

    act(() => {
      (shell as HTMLElement).appendChild(unrelated);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 180
    });

    act(() => {
      unrelated.remove();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 180
    });
  });

  it('does not resync clamp padding for unrelated class and style mutations under document.body', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
        <div className="test-noise">Noise</div>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');
    const unrelated = container.querySelector('.test-noise');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);
    expect(unrelated).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    const hostRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 800,
          width: 1000,
          height: 800
        }) as DOMRect
    );
    const toolbarRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 56,
          width: 1000,
          height: 56
        }) as DOMRect
    );
    const statsRect = vi.fn(
      () =>
        ({
          left: 820,
          top: 80,
          right: 1000,
          bottom: 220,
          width: 180,
          height: 140
        }) as DOMRect
    );

    (host as HTMLDivElement).getBoundingClientRect = hostRect;
    (toolbar as HTMLElement).getBoundingClientRect = toolbarRect;
    (stats as HTMLElement).getBoundingClientRect = statsRect;

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    hostRect.mockClear();
    toolbarRect.mockClear();
    statsRect.mockClear();

    act(() => {
      (unrelated as HTMLElement).classList.add('expanded');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 180
    });

    act(() => {
      (unrelated as HTMLElement).style.width = '320px';
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hostRect).not.toHaveBeenCalled();
    expect(toolbarRect).not.toHaveBeenCalled();
    expect(statsRect).not.toHaveBeenCalled();
    expect(readViewportInspector()?.read().clampPadding).toEqual({
      top: 56,
      right: 180
    });
  });

  it('resyncs clamp padding when removing a top-line child contributor under the shell', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__topline">
            <span>Left status</span>
            <span>Right status</span>
          </div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const topline = container.querySelector('.aitown-panel__topline');
    const rightStatus = container.querySelector('.aitown-panel__topline > span:last-child');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(topline).toBeInstanceOf(HTMLElement);
    expect(rightStatus).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(rightStatus as HTMLElement, { left: 880, top: 80, width: 120, height: 32 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 120
      });
    });

    act(() => {
      (rightStatus as HTMLElement).remove();
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 0
      });
    });
  });

  it('resyncs clamp padding when hub-sheet mounts and unmounts under the shell', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setElementRect(host as HTMLDivElement, { left: 0, top: 0, width: 1000, height: 800 });
    setElementRect(toolbar as HTMLElement, { left: 0, top: 0, width: 1000, height: 56 });
    setElementRect(stats as HTMLElement, { left: 820, top: 80, width: 180, height: 140 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={onSelectAgent} />
        </section>
        <aside className="aitown-hub-sheet">Hub summary</aside>
      </main>
    );

    const hubSheet = container.querySelector('.aitown-hub-sheet');
    expect(hubSheet).toBeInstanceOf(HTMLElement);
    setElementRect(hubSheet as HTMLElement, { left: 680, top: 0, width: 320, height: 800 });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 320
      });
    });

    rerender(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={onSelectAgent} />
        </section>
      </main>
    );

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });
  });

  it('resyncs clamp padding when mounted shell chrome text expands existing padding contributors', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setResponsiveShellChromeRects({
      host: host as HTMLDivElement,
      toolbar: toolbar as HTMLElement,
      stats: stats as HTMLElement
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    act(() => {
      getOnlyTextNode(toolbar as HTMLElement).data = 'Expanded toolbar copy';
      getOnlyTextNode(stats as HTMLElement).data = 'Expanded stats copy';
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 96,
        right: 320
      });
    });
  });

  it('resyncs clamp padding when mounted shell chrome text contracts existing padding contributors', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Expanded toolbar copy</div>
          <div className="aitown-shell__stats">Expanded stats copy</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    setResponsiveShellChromeRects({
      host: host as HTMLDivElement,
      toolbar: toolbar as HTMLElement,
      stats: stats as HTMLElement
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 96,
        right: 320
      });
    });

    act(() => {
      getOnlyTextNode(toolbar as HTMLElement).data = 'Toolbar';
      getOnlyTextNode(stats as HTMLElement).data = 'Stats';
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });
  });

  it('resyncs clamp padding for contributor class and style mutations', async () => {
    appInitMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(loadAiTownAssets).mockResolvedValue(makeAssets());

    const { container } = render(
      <main className="aitown-shell">
        <section className="aitown-panel aitown-panel--game">
          <div className="aitown-panel__toolbar">Toolbar</div>
          <div className="aitown-shell__stats">Stats</div>
          <WorldScene scene={makeScene()} onSelectAgent={vi.fn()} />
        </section>
      </main>
    );

    const host = container.querySelector('.aitown-world__host');
    const toolbar = container.querySelector('.aitown-panel__toolbar');
    const stats = container.querySelector('.aitown-shell__stats');

    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(stats).toBeInstanceOf(HTMLElement);

    Object.defineProperty(host as HTMLDivElement, 'clientWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(host as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 800
    });

    (host as HTMLDivElement).getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800
      }) as DOMRect;
    (toolbar as HTMLElement).getBoundingClientRect = () => {
      const height = (toolbar as HTMLElement).classList.contains('toolbar--expanded') ? 96 : 56;

      return {
        left: 0,
        top: 0,
        right: 1000,
        bottom: height,
        width: 1000,
        height
      } as DOMRect;
    };
    (stats as HTMLElement).getBoundingClientRect = () => {
      const width = (stats as HTMLElement).style.width === '320px' ? 320 : 180;

      return {
        left: 1000 - width,
        top: 80,
        right: 1000,
        bottom: 220,
        width,
        height: 140
      } as DOMRect;
    };

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 56,
        right: 180
      });
    });

    act(() => {
      (toolbar as HTMLElement).classList.add('toolbar--expanded');
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 96,
        right: 180
      });
    });

    act(() => {
      (stats as HTMLElement).style.width = '320px';
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 96,
        right: 320
      });
    });

    act(() => {
      (toolbar as HTMLElement).className = 'toolbar--expanded';
    });

    await waitFor(() => {
      expect(readViewportInspector()?.read().clampPadding).toEqual({
        top: 0,
        right: 320
      });
    });
  });
});
