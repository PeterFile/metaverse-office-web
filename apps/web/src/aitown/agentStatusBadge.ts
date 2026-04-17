import type { SceneAgent } from './types';

export type SceneAgentStatusState = Pick<
  SceneAgent,
  'openAlertCount' | 'hasOpenIncidents' | 'rebootRecommended' | 'runtimeFreshnessSeverity'
>;

export type SceneAgentStatusBadge = {
  text: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export const SCENE_AGENT_STATUS_LEGEND = [
  { token: '#', label: 'Peer-watch alert count' },
  { token: '!', label: 'Open alerts or workflow incidents' },
  { token: 'R', label: 'Reboot recommended' },
  { token: 'S', label: 'Runtime freshness degraded' }
] as const;

export const BADGE_HEIGHT = 14;
export const BADGE_OFFSET_X = 18;
export const BADGE_OFFSET_Y = -30;

const BADGE_PADDING_X = 4;
const BADGE_CHAR_WIDTH = 6;
const BADGE_MIN_WIDTH = 14;

function resolveAgentStatusTokens({
  openAlertCount,
  hasOpenIncidents,
  rebootRecommended,
  runtimeFreshnessSeverity
}: SceneAgentStatusState) {
  const tokens: string[] = [];

  if (openAlertCount > 0) {
    tokens.push(String(openAlertCount));
  }

  if (hasOpenIncidents) {
    tokens.push('!');
  }

  if (rebootRecommended) {
    tokens.push('R');
  }

  if (runtimeFreshnessSeverity !== null && runtimeFreshnessSeverity !== undefined && runtimeFreshnessSeverity !== 'normal') {
    tokens.push('S');
  }

  return tokens;
}

function measureBadgeWidth(text: string) {
  if (text.length === 0) {
    return 0;
  }

  return Math.max(BADGE_MIN_WIDTH, text.length * BADGE_CHAR_WIDTH + BADGE_PADDING_X * 2);
}

export function resolveSceneAgentStatusBadge(state: SceneAgentStatusState): SceneAgentStatusBadge | null {
  const tokens = resolveAgentStatusTokens(state);

  if (tokens.length === 0) {
    return null;
  }

  const text = tokens.join(' ');

  return {
    text,
    width: measureBadgeWidth(text),
    height: BADGE_HEIGHT,
    offsetX: BADGE_OFFSET_X,
    offsetY: BADGE_OFFSET_Y
  };
}
