import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE,
  DEFAULT_ENTRY_VIEWPORT_OVERSCAN,
  DEFAULT_MAX_VIEWPORT_SCALE,
  DEFAULT_MIN_VIEWPORT_PAN_MARGIN,
  isViewportMouseWheelGesture,
  resolveViewportEntryCenter,
  resolveViewportClampOptions,
  resolveViewportPanBounds,
  resolveViewportScaleBounds,
  resolveViewportWheelGestureDisposition,
  shouldBlockViewportPointerInput,
  shouldBlockViewportWheelGesture,
  shouldDeferViewportPointerGestureToBrowser,
  type ViewportInputCapabilities
} from './viewport';

describe('viewport interaction policy', () => {
  it('keeps mouse drag alive after the pointer leaves the host so edge panning can finish', () => {
    expect(DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE).toBe(true);
  });

  it('allows mouse, touch, and pen pointer drags so every device can pan the world', () => {
    expect(shouldBlockViewportPointerInput('mouse')).toBe(false);
    expect(shouldBlockViewportPointerInput('touch')).toBe(false);
    expect(shouldBlockViewportPointerInput('pen')).toBe(false);
    expect(shouldBlockViewportPointerInput(undefined)).toBe(false);
  });

  it('defers multi-touch pointer gestures to the browser pinch handler', () => {
    expect(shouldDeferViewportPointerGestureToBrowser('touch', 0)).toBe(false);
    expect(shouldDeferViewportPointerGestureToBrowser('touch', 1)).toBe(false);
    expect(shouldDeferViewportPointerGestureToBrowser('touch', 2)).toBe(true);
    expect(shouldDeferViewportPointerGestureToBrowser('mouse', 2)).toBe(false);
    expect(shouldDeferViewportPointerGestureToBrowser('pen', 2)).toBe(false);
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

  it('routes non-mouse wheel gestures back to the browser instead of preventing defaults', () => {
    expect(
      resolveViewportWheelGestureDisposition({
        ctrlKey: false,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3
      })
    ).toBe('canvas-zoom');

    expect(
      resolveViewportWheelGestureDisposition({
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 120
      })
    ).toBe('browser-default');

    expect(
      resolveViewportWheelGestureDisposition({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 42
      })
    ).toBe('browser-default');
  });
});

const mouseCapabilities: ViewportInputCapabilities = {
  primaryPointerFine: true,
  anyPointerFine: true,
  maxTouchPoints: 0
};

function expectedViewportPanMargin(hostWidth: number, hostHeight: number) {
  return Math.max(
    DEFAULT_MIN_VIEWPORT_PAN_MARGIN,
    Math.min(hostWidth, hostHeight) * 0.18
  );
}

describe('viewport coverage and panning bounds', () => {
  it('overscans the initial fullscreen render so both axes stay pannable', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536);
    const expectedBaseScale = Math.max(
      (1600 / 2048) * DEFAULT_ENTRY_VIEWPORT_OVERSCAN,
      Math.max(
        1600 / 2048,
        (1600 + expectedPanMargin * 2) / 2048,
        (900 + expectedPanMargin * 2) / 1536
      )
    );

    expect(bounds.baseScale).toBeCloseTo(expectedBaseScale, 4);
    expect(bounds.baseScale * 2048).toBeGreaterThan(1600);
    expect(bounds.baseScale * 1536).toBeGreaterThan(900);
  });

  it('overscans widescreen layouts so horizontal and vertical panning both remain available', () => {
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1000);
    const visibleWidth = 2048 * bounds.baseScale;
    const visibleHeight = 1000 * bounds.baseScale;

    expect(visibleWidth).toBeGreaterThan(1600);
    expect(visibleHeight).toBeGreaterThan(900);
  });

  it('keeps pan bounds anchored to the scene edges so dragging never exposes extra whitespace', () => {
    const panBounds = resolveViewportPanBounds(2048, 1536, 1000, 800, 1.0);

    expect(panBounds.left).toBe(0);
    expect(panBounds.right).toBe(2048);
    expect(panBounds.top).toBe(0);
    expect(panBounds.bottom).toBe(1536);
  });

  it('keeps clamp bounds on the scene edges at every zoom level', () => {
    const clampOptions = resolveViewportClampOptions(2048, 1536, 1000, 800, 2.0);

    expect(clampOptions.left).toBe(0);
    expect(clampOptions.right).toBe(2048);
    expect(clampOptions.top).toBe(0);
    expect(clampOptions.bottom).toBe(1536);
  });

  it('extends right and top travel by the obscured HUD safe area without changing the actual scene edges', () => {
    const clampOptions = resolveViewportClampOptions(
      2048,
      1536,
      1000,
      800,
      2.0,
      {
        right: 480,
        top: 280
      }
    );

    expect(clampOptions.left).toBe(0);
    expect(clampOptions.right).toBe(2048 + 240);
    expect(clampOptions.top).toBe(-140);
    expect(clampOptions.bottom).toBe(1536);
  });
});

describe('resolveViewportScaleBounds', () => {
  it('keeps desktop minimum zoom with real two-axis pan room and no gutters', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, mouseCapabilities);
    const expectedMinScale = Math.max(
      1600 / 2048,
      (1600 + expectedPanMargin * 2) / 2048,
      (900 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale * 2048 - 1600).toBeGreaterThanOrEqual(expectedPanMargin * 2);
    expect(bounds.minScale * 1536 - 900).toBeGreaterThanOrEqual(expectedPanMargin * 2);
    expect(bounds.maxScale).toBe(DEFAULT_MAX_VIEWPORT_SCALE);
  });

  it('keeps portrait minimum zoom with real two-axis pan room and no gutters', () => {
    const expectedPanMargin = expectedViewportPanMargin(390, 844);
    const bounds = resolveViewportScaleBounds(390, 844, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, mouseCapabilities);
    const expectedMinScale = Math.max(
      844 / 1536,
      (390 + expectedPanMargin * 2) / 2048,
      (844 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale * 2048 - 390).toBeGreaterThanOrEqual(expectedPanMargin * 2);
    expect(bounds.minScale * 1536 - 844).toBeGreaterThanOrEqual(expectedPanMargin * 2);
  });

  it('keeps equal-aspect layouts draggable on both axes too', () => {
    const expectedPanMargin = expectedViewportPanMargin(1024, 768);
    const bounds = resolveViewportScaleBounds(1024, 768, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, mouseCapabilities);
    const expectedMinScale = Math.max(
      0.5,
      (1024 + expectedPanMargin * 2) / 2048,
      (768 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('keeps touch-only layouts overscanned too because mobile also needs free drag room', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, {
      primaryPointerFine: false,
      anyPointerFine: false,
      maxTouchPoints: 5
    });
    const expectedMinScale = Math.max(
      1600 / 2048,
      (1600 + expectedPanMargin * 2) / 2048,
      (900 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('still overscans hybrid desktop environments where any pointer can drag', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, {
      primaryPointerFine: false,
      anyPointerFine: true,
      maxTouchPoints: 5
    });
    const expectedMinScale = Math.max(
      1600 / 2048,
      (1600 + expectedPanMargin * 2) / 2048,
      (900 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('still overscans unknown pointer environments instead of collapsing drag room by mistake', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, {
      maxTouchPoints: 0
    });
    const expectedMinScale = Math.max(
      1600 / 2048,
      (1600 + expectedPanMargin * 2) / 2048,
      (900 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('still overscans unknown environments that only advertise touch points and no fine pointer', () => {
    const expectedPanMargin = expectedViewportPanMargin(1600, 900);
    const bounds = resolveViewportScaleBounds(1600, 900, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, {
      maxTouchPoints: 5
    });
    const expectedMinScale = Math.max(
      1600 / 2048,
      (1600 + expectedPanMargin * 2) / 2048,
      (900 + expectedPanMargin * 2) / 1536
    );

    expect(bounds.baseScale).toBeCloseTo(expectedMinScale, 4);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('raises the max zoom cap when giant displays need a larger overscanned entry scale', () => {
    const expectedPanMargin = expectedViewportPanMargin(6000, 3000);
    const bounds = resolveViewportScaleBounds(6000, 3000, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, mouseCapabilities);
    const expectedMinScale = Math.max(
      6000 / 2048,
      (6000 + expectedPanMargin * 2) / 2048,
      (3000 + expectedPanMargin * 2) / 1536
    );
    const expectedBaseScale = Math.max(
      (6000 / 2048) * DEFAULT_ENTRY_VIEWPORT_OVERSCAN,
      expectedMinScale
    );

    expect(bounds.baseScale).toBeCloseTo(expectedBaseScale, 4);
    expect(bounds.maxScale).toBe(bounds.baseScale);
    expect(bounds.minScale).toBeCloseTo(expectedMinScale, 4);
  });

  it('scales pan room up with large desktop shells so edge traversal does not collapse to a tiny strip', () => {
    const expectedPanMargin = expectedViewportPanMargin(6000, 3000);
    const bounds = resolveViewportScaleBounds(6000, 3000, 2048, 1536, DEFAULT_MAX_VIEWPORT_SCALE, mouseCapabilities);

    expect(bounds.minScale * 2048 - 6000).toBeGreaterThanOrEqual(expectedPanMargin * 2);
    expect(bounds.minScale * 1536 - 3000).toBeGreaterThanOrEqual(expectedPanMargin * 2);
  });
});

describe('resolveViewportEntryCenter', () => {
  it('keeps wide desktop entry centered in cover mode', () => {
    const center = resolveViewportEntryCenter(1600, 900, 2048, 1536, mouseCapabilities);

    expect(center.x).toBeCloseTo(2048 / 2, 4);
    expect(center.y).toBeCloseTo(1536 / 2, 4);
  });

  it('keeps touch-only entry centered so mobile starts with the same framing', () => {
    const center = resolveViewportEntryCenter(1600, 900, 2048, 1536, {
      primaryPointerFine: false,
      anyPointerFine: false,
      maxTouchPoints: 5
    });

    expect(center.x).toBeCloseTo(2048 / 2, 4);
    expect(center.y).toBeCloseTo(1536 / 2, 4);
  });
});
