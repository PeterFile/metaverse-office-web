export const DEFAULT_MAX_VIEWPORT_SCALE = 2.2;
export const DEFAULT_ENTRY_VIEWPORT_OVERSCAN = 1.08;
export const DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE = true;
export const DEFAULT_MIN_VIEWPORT_PAN_MARGIN = 96;

export type ViewportInputCapabilities = {
  primaryPointerFine?: boolean;
  anyPointerFine?: boolean;
  maxTouchPoints?: number;
};

function sanitizeDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

function resolveViewportMinPanMargin(hostWidth: number, hostHeight: number) {
  return Math.max(
    DEFAULT_MIN_VIEWPORT_PAN_MARGIN,
    Math.min(sanitizeDimension(hostWidth), sanitizeDimension(hostHeight)) * 0.18
  );
}

export type ViewportScaleBounds = {
  baseScale: number;
  minScale: number;
  maxScale: number;
};

export type ViewportPanBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ViewportCenter = {
  x: number;
  y: number;
};

export type ViewportClampPadding = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

export type ViewportClampOptions = ViewportPanBounds;

export type ViewportWheelGestureSample = {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  deltaZ?: number;
};

export type ViewportWheelGestureDisposition = 'canvas-zoom' | 'browser-default';

export type ViewportCornerAfterScreenDragInput = {
  cornerX: number;
  cornerY: number;
  scale: number;
  deltaX: number;
  deltaY: number;
};

export type ViewportCornerDragTarget = {
  left: number;
  top: number;
  scale: { x: number };
  moveCorner: (x: number, y: number) => unknown;
};

export type ViewportInspectionScaleBounds = {
  minScale: number;
  maxScale: number;
};

export type ViewportInspectable = {
  x: number;
  y: number;
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
  scale: { x: number };
  setZoom: (scale: number, center?: boolean) => unknown;
  moveCenter: (x: number, y: number) => unknown;
};

export type ViewportInspectionSelectedAgent = {
  agentId: string;
  x: number;
  y: number;
};

export type ViewportInspectionState = {
  x: number;
  y: number;
  scale: number;
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
  clampPadding: { top: number; right: number };
  selectedAgent: ViewportInspectionSelectedAgent | null;
  minScale: number;
  maxScale: number;
};

export type ViewportInspector = {
  read: () => ViewportInspectionState;
  zoomToMinimum: () => number;
  moveCenter: (x: number, y: number) => void;
};

const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const MIN_PIXEL_MOUSE_WHEEL_STEP = 24;
const PIXEL_MOUSE_WHEEL_GRANULARITY = 4;
const FLOAT_EPSILON = 0.0001;

export function shouldBlockViewportPointerInput(_pointerType: string | null | undefined) {
  return false;
}

export function shouldDeferViewportPointerGestureToBrowser(
  pointerType: string | null | undefined,
  activeTouchPointers = 0
) {
  return pointerType === 'touch' && activeTouchPointers > 1;
}

export function isViewportMouseWheelGesture(sample: ViewportWheelGestureSample) {
  const deltaX = Math.abs(sample.deltaX);
  const deltaY = Math.abs(sample.deltaY);
  const deltaZ = Math.abs(sample.deltaZ ?? 0);

  if (sample.ctrlKey || deltaY === 0 || deltaX > 0 || deltaZ > 0) {
    return false;
  }

  if (sample.deltaMode === DOM_DELTA_LINE || sample.deltaMode === DOM_DELTA_PAGE) {
    return true;
  }

  if (sample.deltaMode !== DOM_DELTA_PIXEL) {
    return false;
  }

  return (
    Number.isInteger(sample.deltaY) &&
    deltaY >= MIN_PIXEL_MOUSE_WHEEL_STEP &&
    deltaY % PIXEL_MOUSE_WHEEL_GRANULARITY === 0
  );
}

export function resolveViewportWheelGestureDisposition(
  sample: ViewportWheelGestureSample
): ViewportWheelGestureDisposition {
  return isViewportMouseWheelGesture(sample) ? 'canvas-zoom' : 'browser-default';
}

export function shouldBlockViewportWheelGesture(sample: ViewportWheelGestureSample) {
  return resolveViewportWheelGestureDisposition(sample) === 'browser-default';
}

export function resolveViewportCornerAfterScreenDrag({
  cornerX,
  cornerY,
  scale,
  deltaX,
  deltaY
}: ViewportCornerAfterScreenDragInput): ViewportCenter {
  const nextScale = Math.max(scale, FLOAT_EPSILON);

  return {
    x: cornerX - deltaX / nextScale,
    y: cornerY - deltaY / nextScale
  };
}

export function moveViewportCornerAfterScreenDrag(
  viewport: ViewportCornerDragTarget,
  deltaX: number,
  deltaY: number
) {
  if (deltaX === 0 && deltaY === 0) {
    return false;
  }

  const nextCorner = resolveViewportCornerAfterScreenDrag({
    cornerX: viewport.left,
    cornerY: viewport.top,
    scale: viewport.scale.x,
    deltaX,
    deltaY
  });

  viewport.moveCorner(nextCorner.x, nextCorner.y);

  return true;
}

export function resolveViewportInspectionState(
  viewport: ViewportInspectable,
  clampPadding: ViewportClampPadding = {},
  scaleBounds?: Partial<ViewportInspectionScaleBounds>,
  selectedAgent: ViewportInspectionSelectedAgent | null = null
): ViewportInspectionState {
  return {
    x: viewport.x,
    y: viewport.y,
    scale: viewport.scale.x,
    left: viewport.left,
    top: viewport.top,
    right: viewport.right,
    bottom: viewport.bottom,
    screenWidth: viewport.screenWidth,
    screenHeight: viewport.screenHeight,
    worldWidth: viewport.worldWidth,
    worldHeight: viewport.worldHeight,
    screenWorldWidth: viewport.screenWorldWidth,
    screenWorldHeight: viewport.screenWorldHeight,
    clampPadding: {
      top: clampPadding.top ?? 0,
      right: clampPadding.right ?? 0
    },
    selectedAgent: selectedAgent
      ? {
          agentId: selectedAgent.agentId,
          x: selectedAgent.x,
          y: selectedAgent.y
        }
      : null,
    minScale: scaleBounds?.minScale ?? viewport.scale.x,
    maxScale: scaleBounds?.maxScale ?? viewport.scale.x
  };
}

export function createViewportInspector({
  viewport,
  getClampPadding,
  getScaleBounds,
  getSelectedAgent,
  afterZoom
}: {
  viewport: ViewportInspectable;
  getClampPadding?: () => ViewportClampPadding;
  getScaleBounds?: () => ViewportInspectionScaleBounds;
  getSelectedAgent?: () => ViewportInspectionSelectedAgent | null;
  afterZoom?: () => void;
}): ViewportInspector {
  const read = () =>
    resolveViewportInspectionState(viewport, getClampPadding?.(), getScaleBounds?.(), getSelectedAgent?.() ?? null);

  return {
    read,
    zoomToMinimum() {
      const minScale = getScaleBounds?.().minScale ?? viewport.scale.x;

      viewport.setZoom(minScale, true);
      afterZoom?.();

      return minScale;
    },
    moveCenter(x: number, y: number) {
      viewport.moveCenter(x, y);
    }
  };
}

export function resolveViewportScaleBounds(
  hostWidth: number,
  hostHeight: number,
  sceneWidth: number,
  sceneHeight: number,
  maxScale = DEFAULT_MAX_VIEWPORT_SCALE,
  capabilities?: ViewportInputCapabilities
): ViewportScaleBounds {
  const safeHostWidth = sanitizeDimension(hostWidth);
  const safeHostHeight = sanitizeDimension(hostHeight);
  const safeSceneWidth = sanitizeDimension(sceneWidth);
  const safeSceneHeight = sanitizeDimension(sceneHeight);
  const minPanMargin = resolveViewportMinPanMargin(safeHostWidth, safeHostHeight);

  const coverScale = Math.max(safeHostWidth / safeSceneWidth, safeHostHeight / safeSceneHeight);
  const minPannableScale = Math.max(
    coverScale,
    (safeHostWidth + minPanMargin * 2) / safeSceneWidth,
    (safeHostHeight + minPanMargin * 2) / safeSceneHeight
  );
  const baseScale = Math.max(coverScale * DEFAULT_ENTRY_VIEWPORT_OVERSCAN, minPannableScale);
  const minScale = minPannableScale;

  return {
    baseScale,
    minScale,
    maxScale: Math.max(maxScale, baseScale)
  };
}

export function resolveViewportEntryCenter(
  hostWidth: number,
  hostHeight: number,
  sceneWidth: number,
  sceneHeight: number,
  capabilities?: ViewportInputCapabilities
): ViewportCenter {
  return {
    x: sanitizeDimension(sceneWidth) / 2,
    y: sanitizeDimension(sceneHeight) / 2
  };
}

export function resolveViewportSafeAreaCenterBias(
  scale: number,
  clampPadding: ViewportClampPadding = {}
): ViewportCenter {
  const currentScale = Math.max(scale, FLOAT_EPSILON);
  const leftPadding = Math.max(0, clampPadding.left ?? 0);
  const rightPadding = Math.max(0, clampPadding.right ?? 0);
  const topPadding = Math.max(0, clampPadding.top ?? 0);
  const bottomPadding = Math.max(0, clampPadding.bottom ?? 0);

  return {
    x: (rightPadding - leftPadding) / (currentScale * 2),
    y: (bottomPadding - topPadding) / (currentScale * 2)
  };
}

export function resolveViewportPanBounds(
  sceneWidth: number,
  sceneHeight: number,
  hostWidth: number,
  hostHeight: number,
  scale: number,
  clampPadding: ViewportClampPadding = {}
): ViewportPanBounds {
  const currentScale = Math.max(scale, FLOAT_EPSILON);
  const rightPadding = Math.max(0, clampPadding.right ?? 0) / currentScale;
  const topPadding = Math.max(0, clampPadding.top ?? 0) / currentScale;
  const bottomPadding = Math.max(0, clampPadding.bottom ?? 0) / currentScale;

  return {
    left: 0,
    right: sanitizeDimension(sceneWidth) + rightPadding,
    top: topPadding === 0 ? 0 : -topPadding,
    bottom: sanitizeDimension(sceneHeight) + bottomPadding
  };
}

export function resolveViewportClampOptions(
  sceneWidth: number,
  sceneHeight: number,
  hostWidth: number,
  hostHeight: number,
  scale: number,
  clampPadding: ViewportClampPadding = {}
): ViewportClampOptions {
  return resolveViewportPanBounds(sceneWidth, sceneHeight, hostWidth, hostHeight, scale, clampPadding);
}
