import type { CollectorSourceHealthKind, CollectorSourceHealthStatus } from '../types';
import type { Severity } from '../world/types';
import type { AgentPhase } from '../world/types';

export type SceneSourceGapKind = Extract<
  CollectorSourceHealthKind,
  'workspace_root' | 'workspace_files' | 'tmux_session' | 'hermes_profile' | 'hermes_session'
>;

export interface AnimatedMapSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
}

export type AiTownMapRenderMode = 'tilemap' | 'layered-raster';

export type AiTownMapLayerUrls = {
  groundBase: string;
  dressedRef: string;
  propPack: string;
  propsTransparent: string;
  collision: string;
  regions: string;
  preview: string;
};

export interface AiTownYSortProp {
  id: string;
  left: number;
  top: number;
  w: number;
  h: number;
  x: number;
  y: number;
  sortY: number;
  collision: 'blocker' | 'none' | string;
}

export interface AiTownMapData {
  id?: string;
  label?: string;
  renderMode?: AiTownMapRenderMode;
  width: number;
  height: number;
  pixelWidth?: number;
  pixelHeight?: number;
  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;
  tileDim: number;
  bgTiles: number[][][];
  objectTiles: number[][][];
  animatedSprites: AnimatedMapSprite[];
  layerUrls?: AiTownMapLayerUrls;
  ySortProps?: AiTownYSortProp[];
}

export interface AiTownLayeredMapData extends AiTownMapData {
  id: string;
  label: string;
  renderMode: 'layered-raster';
  pixelWidth: number;
  pixelHeight: number;
  layerUrls: AiTownMapLayerUrls;
  ySortProps: AiTownYSortProp[];
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
  evidenceFloor?: {
    present: true;
    inspection: {
      label: string;
      occupantCount: number;
      evidenceBackedAgentCount: number | null;
      sourceHealthStatus: Exclude<CollectorSourceHealthStatus, 'observed'> | null;
      occupantProofSummaries: Array<{
        displayName: string;
        evidenceBacked: boolean;
        sourceHealthStatus: Exclude<CollectorSourceHealthStatus, 'observed'> | null;
      }>;
      occupantProofOverflowCount: number;
    };
  };
}

export type SceneAgentEvidenceCueStatus = 'backed' | 'gap' | 'low_confidence' | 'unavailable';

export interface SceneAgentEvidenceCue {
  recordCount: number | null;
  gapCount: number;
  status: SceneAgentEvidenceCueStatus;
}

export interface SceneAgent {
  agentId: string;
  displayName: string;
  kind: 'lead' | 'employee';
  zoneId: string;
  mapId?: string;
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
  sourceEvidenceHealthStatus?: Exclude<CollectorSourceHealthStatus, 'observed'> | null;
  evidenceCue?: SceneAgentEvidenceCue | null;
}

export interface SceneWatchEdge {
  fromAgentId: string;
  toAgentId: string;
  watchMode: 'lead' | 'peer';
  riskLevel: Severity;
}

export interface SceneSourceGapPin {
  pinId: string;
  agentId: string | null;
  displayName: string;
  isMapped: boolean;
  sourceDrilldownGroupKey?: 'workspace' | 'tmux' | 'hermes' | null;
  sourceKind: SceneSourceGapKind;
  sourceLabel: string;
  status: Exclude<CollectorSourceHealthStatus, 'observed'> | 'observed';
  lifecycleLabel?: string;
  observedAtLabel: string;
  position: ScenePoint;
}

export interface AiTownGateway {
  gatewayId: string;
  label: string;
  fromMapId: string;
  toMapId: string;
  entry: ScenePoint;
  arrival: ScenePoint;
  triggerRadius: number;
}

export interface AiTownSceneModel {
  map: AiTownMapData;
  maps?: AiTownMapData[];
  gateways?: AiTownGateway[];
  zones: SceneZone[];
  agents: SceneAgent[];
  watchEdges: SceneWatchEdge[];
  sourceGapPins?: SceneSourceGapPin[];
  selectedAgentId: string | null;
  activeCorrelationId: string | null;
  correlationParticipantAgentIds: string[];
  pixelWidth: number;
  pixelHeight: number;
}
