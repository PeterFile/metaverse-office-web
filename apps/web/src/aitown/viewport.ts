export const DEFAULT_MAX_VIEWPORT_SCALE = 2.2;
export const DEFAULT_ENTRY_VIEWPORT_OVERSCAN = 1.15;

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

export function shouldBlockViewportPointerInput(pointerType: string | null | undefined) {
  return pointerType !== 'mouse';
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

function supportsMousePan(capabilities?: ViewportInputCapabilities) {
  if (!capabilities) {
    return true;
  }

  if (capabilities.primaryPointerFine === false || capabilities.anyPointerFine === false) {
    return false;
  }

  if ((capabilities.maxTouchPoints ?? 0) > 0 && !capabilities.primaryPointerFine && !capabilities.anyPointerFine) {
    return false;
  }

  return true;
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
  const widthScale = safeHostWidth / safeSceneWidth;
  const heightScale = safeHostHeight / safeSceneHeight;
  const widthLimitedEntry = Math.abs(coverScale - widthScale) < 0.0001;
  const sameAspectRatio = Math.abs(widthScale - heightScale) < 0.0001;
  const needsEntryOverscan = widthLimitedEntry && !sameAspectRatio && supportsMousePan(capabilities);
  const baseScale = needsEntryOverscan
    ? coverScale * DEFAULT_ENTRY_VIEWPORT_OVERSCAN
    : coverScale;

  // When fullscreen cover lands on a width-limited desktop fit, horizontal overflow becomes zero,
  // so pixi-viewport clamps away left/right dragging until the user zooms in.
  // Overscanning only those mouse-draggable width-limited entries preserves immediate horizontal panning
  // without changing equal-aspect or touch-only layouts that cannot recover the hidden area.

  return {
    baseScale,
    minScale: baseScale,
    maxScale: Math.max(maxScale, baseScale)
  };
}
