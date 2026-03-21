export type ViewportReachabilityState = {
  scale: number | null;
  left: number;
  top: number;
  right: number;
  bottom: number;
  worldWidth: number;
  worldHeight: number;
  clampPadding?: {
    top?: number;
    right?: number;
  };
};

export type ViewportReachabilityEdge = 'bottom-right' | 'top-left';

const EDGE_TOLERANCE_WORLD_UNITS = 0.5;
const DEFAULT_SCREEN_OVERSHOOT_PX = 96;

function resolveScreenDelta(
  remainingWorldDistance: number,
  scale: number,
  direction: -1 | 1,
  screenOvershootPx: number
) {
  if (remainingWorldDistance <= EDGE_TOLERANCE_WORLD_UNITS) {
    return 0;
  }

  return direction * Math.ceil(remainingWorldDistance * scale + screenOvershootPx);
}

export function resolveViewportEdgeDragDelta(
  state: ViewportReachabilityState,
  edge: ViewportReachabilityEdge = 'bottom-right',
  options: {
    screenOvershootPx?: number;
  } = {}
) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  const screenOvershootPx = options.screenOvershootPx ?? DEFAULT_SCREEN_OVERSHOOT_PX;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;

  if (edge === 'bottom-right') {
    return {
      deltaX: resolveScreenDelta(state.worldWidth + rightAllowance - state.right, scale, -1, screenOvershootPx),
      deltaY: resolveScreenDelta(state.worldHeight - state.bottom, scale, -1, screenOvershootPx)
    };
  }

  const targetTop = topAllowance === 0 ? 0 : -topAllowance;

  return {
    deltaX: resolveScreenDelta(state.left, scale, 1, screenOvershootPx),
    deltaY: resolveScreenDelta(state.top - targetTop, scale, 1, screenOvershootPx)
  };
}
