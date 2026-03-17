import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_VIEWPORT_SCALE,
  isViewportMouseWheelGesture,
  resolveViewportScaleBounds,
  shouldBlockViewportPointerInput,
  shouldBlockViewportWheelGesture
} from './viewport';

describe('viewport interaction policy', () => {
  it('blocks non-mouse pointer gestures so panning stays mouse-only', () => {
    expect(shouldBlockViewportPointerInput('mouse')).toBe(false);
    expect(shouldBlockViewportPointerInput('touch')).toBe(true);
    expect(shouldBlockViewportPointerInput('pen')).toBe(true);
    expect(shouldBlockViewportPointerInput(undefined)).toBe(true);
  });

  it('blocks ctrl-wheel gestures so zoom stays wheel-only instead of trackpad pinch', () => {
    expect(
      shouldBlockViewportWheelGesture({
        ctrlKey: false,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3
      })
    ).toBe(false);
    expect(
      shouldBlockViewportWheelGesture({
        ctrlKey: true,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3
      })
    ).toBe(true);
  });

  it('only treats clear vertical mouse-wheel steps as zoom input', () => {
    expect(
      isViewportMouseWheelGesture({
        ctrlKey: false,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3
      })
    ).toBe(true);

    expect(
      isViewportMouseWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 120
      })
    ).toBe(true);

    expect(
      isViewportMouseWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 7.5
      })
    ).toBe(false);

    expect(
      isViewportMouseWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 42
      })
    ).toBe(false);
  });
});

describe('viewport coverage and panning bounds', () => {
  it('uses cover scale to avoid black gutters on initial fullscreen render', () => {
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536);

    expect(bounds.baseScale * 2048).toBeGreaterThanOrEqual(1600);
    expect(bounds.baseScale * 1536).toBeGreaterThanOrEqual(900);
  });

  it('keeps horizontal overflow available when cover mode is height-constrained', () => {
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1000);
    const coveredWidth = 2048 * bounds.baseScale;

    expect(coveredWidth).toBeGreaterThan(1600);
  });
});

describe('resolveViewportScaleBounds', () => {
  it('keeps the minimum zoom locked to cover scale so the viewport never exposes black gutters', () => {
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536);

    expect(bounds.baseScale).toBeCloseTo(1600 / 2048, 4);
    expect(bounds.minScale).toBeCloseTo(bounds.baseScale, 4);
    expect(bounds.maxScale).toBe(DEFAULT_MAX_VIEWPORT_SCALE);
  });

  it('keeps portrait layouts in cover mode instead of zooming out to full-map fit', () => {
    const bounds = resolveViewportScaleBounds(390, 844, 2048, 1536);

    expect(bounds.baseScale).toBeCloseTo(844 / 1536, 4);
    expect(bounds.minScale).toBeCloseTo(bounds.baseScale, 4);
  });

  it('raises the max zoom cap when giant displays need a larger cover scale', () => {
    const bounds = resolveViewportScaleBounds(6000, 3000, 2048, 1536);

    expect(bounds.baseScale).toBeCloseTo(6000 / 2048, 4);
    expect(bounds.maxScale).toBe(bounds.baseScale);
    expect(bounds.minScale).toBe(bounds.baseScale);
  });
});
