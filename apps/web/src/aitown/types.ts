import type { Severity } from '../world/types';
import type { AgentPhase } from '../world/types';

export interface AnimatedMapSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
}

export interface AiTownMapData {
  width: number;
  height: number;
  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;
  tileDim: number;
  bgTiles: number[][][];
  objectTiles: number[][][];
  animatedSprites: AnimatedMapSprite[];
}

export type CharacterKey = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8';

export type RolePawnKey =
  | 'app_eng'
  | 'growth'
  | 'lead'
  | 'market_intel'
  | 'product_pmf'
  | 'protocol_eng'
  | 'tokenomics';

export type Facing = 'down' | 'left' | 'right' | 'up';

export interface ScenePoint {
  x: number;
  y: number;
}

export interface SceneZone {
  zoneId: string;
  label: string;
  kind: 'desk' | 'shared';
  anchor: ScenePoint;
  occupantIds: string[];
}

export interface SceneAgent {
  agentId: string;
  displayName: string;
  kind: 'lead' | 'employee';
  zoneId: string;
  position: ScenePoint;
  characterKey: CharacterKey;
  rolePawnKey?: RolePawnKey;
  facing: Facing;
  phase: AgentPhase;
  severity: Severity;
  selected: boolean;
  activeTask: string;
  rawLocation: string;
  rebootRecommended: boolean;
  openAlertCount: number;
  hasOpenIncidents: boolean;
  runtimeFreshnessSeverity?: Severity | null;
}

export interface SceneWatchEdge {
  fromAgentId: string;
  toAgentId: string;
  watchMode: 'lead' | 'peer';
  riskLevel: Severity;
}

export interface AiTownSceneModel {
  map: AiTownMapData;
  zones: SceneZone[];
  agents: SceneAgent[];
  watchEdges: SceneWatchEdge[];
  selectedAgentId: string | null;
  activeCorrelationId: string | null;
  correlationParticipantAgentIds: string[];
  pixelWidth: number;
  pixelHeight: number;
}
