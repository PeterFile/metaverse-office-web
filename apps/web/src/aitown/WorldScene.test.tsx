import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiTownAssets } from './assetLoader';
import type { AiTownSceneModel, SceneAgent } from './types';
import type { ViewportInspector } from './viewport';

const { MockDisplayObject, appInitMock, appDestroyMock } = vi.hoisted(() => {
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

    on(_event: string, _handler: unknown) {
      return this;
    }

    off(_event: string, _handler?: unknown) {
      return this;
    }

    play() {}

    destroy(_options?: unknown) {}
  }

  return {
    MockDisplayObject,
    appInitMock: vi.fn(),
    appDestroyMock: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('pixi.js', () => {
  class Application {
    canvas = document.createElement('canvas');
    renderer = { events: {} };
    stage = new Container();
    init = appInitMock;
    destroy = appDestroyMock;
  }

  class Container extends MockDisplayObject {}

  class Graphics extends MockDisplayObject {}

  class Rectangle {
    constructor(..._args: unknown[]) {}
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
    tileSetTexture: textureFrame as AiTownAssets['tileSetTexture'],
    animationSheets: {}
  };
}

beforeEach(() => {
  MockResizeObserver.instances = [];
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

    const inspection = readViewportInspector()?.read();
    const center = readViewportCenter();
    const expectedBiasX = (280 - 320) / ((inspection?.scale ?? 1) * 2);

    expect(center.x).toBeCloseTo((selectedAgent?.position.x ?? 0) + expectedBiasX, 4);
    expect(center.y).toBeCloseTo(selectedAgent?.position.y ?? 0, 4);
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
      clientY: 320
    });
    fireEvent.pointerUp(host as HTMLDivElement, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 380,
      clientY: 320
    });

    const inspectionBeforeReset = readViewportInspector()?.read();
    const expectedDefaultCenterX =
      (selectedAgent?.position.x ?? 0) +
      (inspectionBeforeReset?.clampPadding.right ?? 0) / ((inspectionBeforeReset?.scale ?? 1) * 2);

    await waitFor(() => {
      expect(readViewportCenter().x).not.toBeCloseTo(expectedDefaultCenterX, 4);
    });

    const manualCenter = readViewportCenter();

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
