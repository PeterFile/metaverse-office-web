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

export type ViewportClampOptions = ViewportPanBounds;

export type ViewportWheelGestureSample = {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  deltaZ?: number;
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

export function shouldBlockViewportWheelGesture(sample: ViewportWheelGestureSample) {
  return !isViewportMouseWheelGesture(sample);
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

  const coverScale = Math.max(safeHostWidth / safeSceneWidth, safeHostHeight / safeSceneHeight);
  const minPannableScale = Math.max(
    coverScale,
    (safeHostWidth + DEFAULT_MIN_VIEWPORT_PAN_MARGIN * 2) / safeSceneWidth,
    (safeHostHeight + DEFAULT_MIN_VIEWPORT_PAN_MARGIN * 2) / safeSceneHeight
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

export function resolveViewportPanBounds(
  sceneWidth: number,
  sceneHeight: number,
  hostWidth: number,
  hostHeight: number,
  scale: number
): ViewportPanBounds {
  const currentScale = Math.max(scale, 0.0001);
  // Screen-equivalent margins so scene edges can be dragged past UI overlays.
  const rightMarginScreen = 480;   // Hub panel
  const bottomMarginScreen = 280;  // header + toolbar + frame
  const rightMarginWorld = rightMarginScreen / currentScale;
  const bottomMarginWorld = bottomMarginScreen / currentScale;
  return {
    left: 0,
    right: sanitizeDimension(sceneWidth) + rightMarginWorld,
    top: 0,
    bottom: sanitizeDimension(sceneHeight) + bottomMarginWorld
  };
}

export function resolveViewportClampOptions(
  sceneWidth: number,
  sceneHeight: number,
  hostWidth: number,
  hostHeight: number,
  scale: number
): ViewportClampOptions {
  return resolveViewportPanBounds(sceneWidth, sceneHeight, hostWidth, hostHeight, scale);
}
