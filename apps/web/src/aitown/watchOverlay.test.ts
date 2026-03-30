import { describe, expect, it } from 'vitest';

import { resolveWatchOverlayAgentIds, resolveWatchOverlaySegments } from './watchOverlay';
import type { AiTownSceneModel, SceneAgent } from './types';

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
    selected: false,
    activeTask: 'Fix workflow issue',
    rawLocation: 'delivery-desk',
    rebootRecommended: false,
    openAlertCount: 0,
    hasOpenIncidents: false,
    ...overrides
  };
}

function makeScene(overrides: Partial<AiTownSceneModel> = {}): AiTownSceneModel {
  return {
    map: {
      width: 1,
      height: 1,
      tileSetUrl: '',
      tileSetDimX: 32,
      tileSetDimY: 32,
      tileDim: 32,
      bgTiles: [],
      objectTiles: [],
      animatedSprites: []
    },
    zones: [],
    agents: [
      makeAgent({
        agentId: 'team-lead',
        displayName: 'Team Lead',
        kind: 'lead',
        zoneId: 'lead-desk',
        position: { x: 64, y: 96 }
      }),
      makeAgent({
        selected: true
      }),
      makeAgent({
        agentId: 'growth-revenue',
        displayName: 'Growth Revenue Agent',
        zoneId: 'growth-desk',
        position: { x: 192, y: 224 },
        phase: 'waiting',
        severity: 'red'
      })
    ],
    watchEdges: [
      {
        fromAgentId: 'team-lead',
        toAgentId: 'app-engineering',
        watchMode: 'lead',
        riskLevel: 'orange'
      },
      {
        fromAgentId: 'app-engineering',
        toAgentId: 'growth-revenue',
        watchMode: 'peer',
        riskLevel: 'red'
      }
    ],
    selectedAgentId: 'app-engineering',
    pixelWidth: 256,
    pixelHeight: 256,
    ...overrides
  };
}

describe('resolveWatchOverlaySegments', () => {
  it('builds one overlay segment per selected-agent watch edge', () => {
    const segments = resolveWatchOverlaySegments(makeScene());

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      fromAgentId: 'team-lead',
      toAgentId: 'app-engineering',
      watchMode: 'lead',
      riskLevel: 'orange'
    });
    expect(segments[1]).toMatchObject({
      fromAgentId: 'app-engineering',
      toAgentId: 'growth-revenue',
      watchMode: 'peer',
      riskLevel: 'red'
    });
    expect(segments[0]!.start.x).toBeGreaterThan(64);
    expect(segments[0]!.end.x).toBeLessThan(120);
    expect(segments[1]!.start.x).toBeGreaterThan(120);
    expect(segments[1]!.end.x).toBeLessThan(192);
  });

  it('keeps a readable visible segment for same-zone spacing used by the real scene layout', () => {
    const [lead, selectedAgent] = makeScene().agents;
    const closeScene = makeScene({
      agents: [
        lead!,
        {
          ...selectedAgent!,
          position: { x: 120, y: 180 },
          selected: true
        },
        makeAgent({
          agentId: 'growth-revenue',
          displayName: 'Growth Revenue Agent',
          zoneId: 'delivery-desk',
          position: { x: 145.6, y: 180 },
          phase: 'waiting',
          severity: 'red'
        })
      ],
      watchEdges: [
        {
          fromAgentId: 'app-engineering',
          toAgentId: 'growth-revenue',
          watchMode: 'lead',
          riskLevel: 'orange'
        }
      ]
    });

    const [segment] = resolveWatchOverlaySegments(closeScene);
    expect(segment).toBeDefined();
    const visibleDistance = Math.hypot(segment!.end.x - segment!.start.x, segment!.end.y - segment!.start.y);

    expect(visibleDistance).toBeGreaterThanOrEqual(10);
  });

  it('skips endpoints that are too close to render a readable segment', () => {
    const scene = makeScene({
      agents: [
        makeAgent({
          agentId: 'app-engineering',
          selected: true,
          position: { x: 120, y: 180 }
        }),
        makeAgent({
          agentId: 'growth-revenue',
          displayName: 'Growth Revenue Agent',
          position: { x: 126, y: 180 },
          severity: 'red',
          phase: 'waiting'
        })
      ],
      watchEdges: [
        {
          fromAgentId: 'app-engineering',
          toAgentId: 'growth-revenue',
          watchMode: 'peer',
          riskLevel: 'red'
        }
      ]
    });

    expect(resolveWatchOverlaySegments(scene)).toEqual([]);
  });

  it('returns no overlay segments when no agent is selected', () => {
    expect(
      resolveWatchOverlaySegments(
        makeScene({
          selectedAgentId: null,
          agents: makeScene().agents.map((agent) => ({
            ...agent,
            selected: false
          }))
        })
      )
    ).toEqual([]);
  });
});

describe('resolveWatchOverlayAgentIds', () => {
  it('includes the selected agent and all connected watch endpoints', () => {
    expect(resolveWatchOverlayAgentIds('app-engineering', makeScene().watchEdges)).toEqual(
      new Set(['app-engineering', 'team-lead', 'growth-revenue'])
    );
  });

  it('returns an empty set when no agent is selected', () => {
    expect(resolveWatchOverlayAgentIds(null, makeScene().watchEdges)).toEqual(new Set());
  });
});
