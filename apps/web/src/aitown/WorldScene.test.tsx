import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AiTownSceneModel, SceneAgent } from './types';

const appInitMock = vi.fn().mockRejectedValue(new Error('renderer_init_failed'));

vi.mock('pixi.js', () => {
  class Application {
    canvas = document.createElement('canvas');
    renderer = { events: {} };
    stage = { addChild: vi.fn(), removeChildren: vi.fn() };
    init = appInitMock;
  }

  class EmptyClass {
    constructor(..._args: unknown[]) {}
  }

  return {
    Application,
    AnimatedSprite: EmptyClass,
    Container: EmptyClass,
    Graphics: EmptyClass,
    Rectangle: EmptyClass,
    Sprite: EmptyClass,
    Text: EmptyClass,
    TextStyle: EmptyClass,
    Texture: EmptyClass
  };
});

vi.mock('pixi-viewport', () => ({
  Viewport: class {
    constructor(..._args: unknown[]) {}
  }
}));

vi.mock('./assetLoader', () => ({
  loadAiTownAssets: vi.fn()
}));

import WorldScene from './WorldScene';

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
});
