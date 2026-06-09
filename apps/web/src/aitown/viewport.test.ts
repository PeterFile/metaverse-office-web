import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ALLOW_VIEWPORT_DRAG_OUTSIDE,
  DEFAULT_ENTRY_VIEWPORT_OVERSCAN,
  DEFAULT_MAX_VIEWPORT_SCALE,
  DEFAULT_MIN_VIEWPORT_PAN_MARGIN,
  createViewportInspector,
  isViewportMouseWheelGesture,
  moveViewportCornerAfterScreenDrag,
  resolveViewportCornerAfterScreenDrag,
  resolveViewportSafeAreaCenterBias,
  resolveViewportEntryCenter,
  resolveViewportClampOptions,
  resolveViewportInspectionState,
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

function resolveEntryViewportTravelBudget(hostWidth: number, hostHeight: number, sceneWidth: number, sceneHeight: number) {
  const { baseScale } = resolveViewportScaleBounds(
    hostWidth,
    hostHeight,
    sceneWidth,
    sceneHeight,
    DEFAULT_MAX_VIEWPORT_SCALE,
    mouseCapabilities
  );
  const center = resolveViewportEntryCenter(
    hostWidth,
    hostHeight,
    sceneWidth,
    sceneHeight,
    mouseCapabilities
  );
  const panBounds = resolveViewportPanBounds(sceneWidth, sceneHeight, hostWidth, hostHeight, baseScale);
  const visibleWorldWidth = hostWidth / baseScale;
  const visibleWorldHeight = hostHeight / baseScale;
  const left = center.x - visibleWorldWidth / 2;
  const right = center.x + visibleWorldWidth / 2;
  const top = center.y - visibleWorldHeight / 2;
  const bottom = center.y + visibleWorldHeight / 2;

  return {
    left: left - panBounds.left,
    right: panBounds.right - right,
    top: top - panBounds.top,
    bottom: panBounds.bottom - bottom
  };
}

function resolveEntryViewportRect(hostWidth: number, hostHeight: number, sceneWidth: number, sceneHeight: number) {
  const { baseScale } = resolveViewportScaleBounds(
    hostWidth,
    hostHeight,
    sceneWidth,
    sceneHeight,
    DEFAULT_MAX_VIEWPORT_SCALE,
    mouseCapabilities
  );
  const center = resolveViewportEntryCenter(
    hostWidth,
    hostHeight,
    sceneWidth,
    sceneHeight,
    mouseCapabilities
  );
  const visibleWorldWidth = hostWidth / baseScale;
  const visibleWorldHeight = hostHeight / baseScale;

  return {
    scale: baseScale,
    left: center.x - visibleWorldWidth / 2,
    right: center.x + visibleWorldWidth / 2,
    top: center.y - visibleWorldHeight / 2,
    bottom: center.y + visibleWorldHeight / 2,
    width: visibleWorldWidth,
    height: visibleWorldHeight
  };
}

function clampViewportLeft(left: number, visibleWorldWidth: number, bounds: { left: number; right: number }) {
  return Math.min(Math.max(left, bounds.left), bounds.right - visibleWorldWidth);
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

  it('converts clamp padding into a world-space center bias for the unobscured viewport lane', () => {
    expect(
      resolveViewportSafeAreaCenterBias(2, {
        left: 80,
        right: 240,
        top: 120,
        bottom: 40
      })
    ).toEqual({
      x: 40,
      y: -20
    });
  });

  it('keeps left safe-area bias out of pan bounds so fresh-load drags never expose a left gutter', () => {
    const clampOptions = resolveViewportClampOptions(
      2048,
      1536,
      1000,
      800,
      2.0,
      {
        left: 320,
        right: 280
      }
    );

    expect(clampOptions.left).toBe(0);
    expect(clampOptions.right).toBe(2048 + 140);
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

describe('default entry viewport travel budget', () => {
  const shells = [
    { name: 'landscape', width: 1280, height: 720 },
    { name: 'portrait', width: 390, height: 844 }
  ] as const;

  for (const shell of shells) {
    it(`keeps the centered ${shell.name} entry viewport one drag away from every scene edge`, () => {
      const expectedPanMargin = expectedViewportPanMargin(shell.width, shell.height);
      const travelBudget = resolveEntryViewportTravelBudget(shell.width, shell.height, 2048, 1536);

      expect(travelBudget.left).toBeGreaterThanOrEqual(expectedPanMargin - 0.0001);
      expect(travelBudget.right).toBeGreaterThanOrEqual(expectedPanMargin - 0.0001);
      expect(travelBudget.top).toBeGreaterThanOrEqual(expectedPanMargin - 0.0001);
      expect(travelBudget.bottom).toBeGreaterThanOrEqual(expectedPanMargin - 0.0001);
    });
  }

  for (const shell of shells) {
    it(`allows immediate horizontal drag from the centered default ${shell.name} view`, () => {
      const sceneWidth = 2048;
      const sceneHeight = 1536;
      const entryRect = resolveEntryViewportRect(shell.width, shell.height, sceneWidth, sceneHeight);
      const panBounds = resolveViewportPanBounds(sceneWidth, sceneHeight, shell.width, shell.height, entryRect.scale);
      const dragLeft = resolveViewportCornerAfterScreenDrag({
        cornerX: entryRect.left,
        cornerY: entryRect.top,
        scale: entryRect.scale,
        deltaX: -24,
        deltaY: 0
      });
      const dragRight = resolveViewportCornerAfterScreenDrag({
        cornerX: entryRect.left,
        cornerY: entryRect.top,
        scale: entryRect.scale,
        deltaX: 24,
        deltaY: 0
      });
      const clampedDragLeft = clampViewportLeft(dragLeft.x, entryRect.width, panBounds);
      const clampedDragRight = clampViewportLeft(dragRight.x, entryRect.width, panBounds);

      expect(entryRect.left).toBeGreaterThan(panBounds.left);
      expect(entryRect.left + entryRect.width).toBeLessThan(panBounds.right);
      expect(clampedDragLeft).toBeGreaterThan(entryRect.left);
      expect(clampedDragRight).toBeLessThan(entryRect.left);
    });
  }

  for (const shell of shells) {
    it(`clamps default ${shell.name} horizontal edge drags without exposing left gutter or incomplete right edge`, () => {
      const sceneWidth = 2048;
      const sceneHeight = 1536;
      const entryRect = resolveEntryViewportRect(shell.width, shell.height, sceneWidth, sceneHeight);
      const panBounds = resolveViewportPanBounds(sceneWidth, sceneHeight, shell.width, shell.height, entryRect.scale);
      const leftEdgeDrag = resolveViewportCornerAfterScreenDrag({
        cornerX: entryRect.left,
        cornerY: entryRect.top,
        scale: entryRect.scale,
        deltaX: 4000,
        deltaY: 0
      });
      const rightEdgeDrag = resolveViewportCornerAfterScreenDrag({
        cornerX: entryRect.left,
        cornerY: entryRect.top,
        scale: entryRect.scale,
        deltaX: -4000,
        deltaY: 0
      });
      const clampedLeft = clampViewportLeft(leftEdgeDrag.x, entryRect.width, panBounds);
      const clampedRight = clampViewportLeft(rightEdgeDrag.x, entryRect.width, panBounds);

      expect(clampedLeft).toBe(0);
      expect(clampedLeft + entryRect.width).toBeLessThanOrEqual(sceneWidth);
      expect(clampedRight).toBeGreaterThanOrEqual(0);
      expect(clampedRight + entryRect.width).toBe(sceneWidth);
    });
  }
});

describe('resolveViewportCornerAfterScreenDrag', () => {
  it('converts screen drag deltas into world-corner movement at the current scale', () => {
    expect(
      resolveViewportCornerAfterScreenDrag({
        cornerX: 512,
        cornerY: 384,
        scale: 2,
        deltaX: 120,
        deltaY: -80
      })
    ).toEqual({ x: 452, y: 424 });
  });

  it('leaves the world corner unchanged when there is no drag delta', () => {
    expect(
      resolveViewportCornerAfterScreenDrag({
        cornerX: 512,
        cornerY: 384,
        scale: 1.5,
        deltaX: 0,
        deltaY: 0
      })
    ).toEqual({ x: 512, y: 384 });
  });

  it('applies screen drags through the public moveCorner path without synthetic viewport events', () => {
    const moveCorner = vi.fn();
    const viewport = {
      left: 512,
      top: 384,
      scale: { x: 2 },
      moveCorner
    };

    expect(moveViewportCornerAfterScreenDrag(viewport, 120, -80)).toBe(true);
    expect(moveCorner).toHaveBeenCalledWith(452, 424);
  });

  it('skips moveCorner when the drag delta is zero', () => {
    const moveCorner = vi.fn();
    const viewport = {
      left: 512,
      top: 384,
      scale: { x: 1.5 },
      moveCorner
    };

    expect(moveViewportCornerAfterScreenDrag(viewport, 0, 0)).toBe(false);
    expect(moveCorner).not.toHaveBeenCalled();
  });
});

describe('viewport inspection surface', () => {
  it('resolves a stable inspection snapshot without exposing raw plugin state', () => {
    expect(
      resolveViewportInspectionState(
        {
          x: 128,
          y: 256,
          left: 12,
          top: 24,
          right: 1036,
          bottom: 792,
          screenWidth: 1024,
          screenHeight: 768,
          worldWidth: 2048,
          worldHeight: 1536,
          screenWorldWidth: 1024,
          screenWorldHeight: 768,
          scale: { x: 1.25 },
          setZoom: vi.fn(),
          moveCenter: vi.fn()
        },
        { top: 80, right: 120 },
        { minScale: 0.9, maxScale: 2.2 }
      )
    ).toEqual({
      x: 128,
      y: 256,
      scale: 1.25,
      left: 12,
      top: 24,
      right: 1036,
      bottom: 792,
      screenWidth: 1024,
      screenHeight: 768,
      worldWidth: 2048,
      worldHeight: 1536,
      screenWorldWidth: 1024,
      screenWorldHeight: 768,
      clampPadding: { top: 80, right: 120 },
      selectedAgent: null,
      minScale: 0.9,
      maxScale: 2.2
    });
  });

  it('creates an inspector that zooms to the tracked minimum through the public setZoom path', () => {
    const setZoom = vi.fn();
    const moveCenter = vi.fn();
    const afterZoom = vi.fn();
    const viewport = {
      x: 128,
      y: 256,
      left: 12,
      top: 24,
      right: 1036,
      bottom: 792,
      screenWidth: 1024,
      screenHeight: 768,
      worldWidth: 2048,
      worldHeight: 1536,
      screenWorldWidth: 1024,
      screenWorldHeight: 768,
      scale: { x: 1.25 },
      setZoom,
      moveCenter
    };
    const inspector = createViewportInspector({
      viewport,
      getClampPadding: () => ({ top: 80, right: 120 }),
      getScaleBounds: () => ({ minScale: 0.9, maxScale: 2.2 }),
      afterZoom
    });

    expect(inspector.zoomToMinimum()).toBe(0.9);
    expect(setZoom).toHaveBeenCalledWith(0.9, true);
    expect(afterZoom).toHaveBeenCalledTimes(1);
    expect(afterZoom.mock.invocationCallOrder[0]).toBeGreaterThan(setZoom.mock.invocationCallOrder[0]);
    expect(inspector.read()).toMatchObject({
      scale: 1.25,
      clampPadding: { top: 80, right: 120 },
      selectedAgent: null,
      minScale: 0.9,
      maxScale: 2.2
    });
  });

  it('surfaces the tracked selected-agent position through the inspection state', () => {
    const inspector = createViewportInspector({
      viewport: {
        x: 128,
        y: 256,
        left: 12,
        top: 24,
        right: 1036,
        bottom: 792,
        screenWidth: 1024,
        screenHeight: 768,
        worldWidth: 2048,
        worldHeight: 1536,
        screenWorldWidth: 1024,
        screenWorldHeight: 768,
        scale: { x: 1.25 },
        setZoom: vi.fn(),
        moveCenter: vi.fn()
      },
      getSelectedAgent: () => ({ agentId: 'growth-revenue', x: 656, y: 464 })
    });

    expect(inspector.read().selectedAgent).toEqual({
      agentId: 'growth-revenue',
      x: 656,
      y: 464
    });
  });

  it('keeps selected-agent inspection output snapshot-only instead of exposing the live tracked object', () => {
    const trackedSelectedAgent = { agentId: 'growth-revenue', x: 656, y: 464 };
    const inspector = createViewportInspector({
      viewport: {
        x: 128,
        y: 256,
        left: 12,
        top: 24,
        right: 1036,
        bottom: 792,
        screenWidth: 1024,
        screenHeight: 768,
        worldWidth: 2048,
        worldHeight: 1536,
        screenWorldWidth: 1024,
        screenWorldHeight: 768,
        scale: { x: 1.25 },
        setZoom: vi.fn(),
        moveCenter: vi.fn()
      },
      getSelectedAgent: () => trackedSelectedAgent
    });

    const firstRead = inspector.read();
    expect(firstRead.selectedAgent).toEqual(trackedSelectedAgent);
    expect(firstRead.selectedAgent).not.toBe(trackedSelectedAgent);

    firstRead.selectedAgent!.x = -1;

    expect(trackedSelectedAgent.x).toBe(656);
    expect(inspector.read().selectedAgent).toEqual({
      agentId: 'growth-revenue',
      x: 656,
      y: 464
    });
  });

  it('delegates forced center moves through the public moveCenter path', () => {
    const moveCenter = vi.fn();
    const inspector = createViewportInspector({
      viewport: {
        x: 128,
        y: 256,
        left: 12,
        top: 24,
        right: 1036,
        bottom: 792,
        screenWidth: 1024,
        screenHeight: 768,
        worldWidth: 2048,
        worldHeight: 1536,
        screenWorldWidth: 1024,
        screenWorldHeight: 768,
        scale: { x: 1.25 },
        setZoom: vi.fn(),
        moveCenter
      },
      getScaleBounds: () => ({ minScale: 0.9, maxScale: 2.2 })
    });

    inspector.moveCenter(4096, -2048);
    expect(moveCenter).toHaveBeenCalledWith(4096, -2048);
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
