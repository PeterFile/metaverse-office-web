import { expect, test, type Page } from '@playwright/test';

async function readViewportState(page: Page) {
  return page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: {
      x: number;
      y: number;
      scale?: {
        x?: number;
      };
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
      clampPadding?: {
        top?: number;
        right?: number;
      };
    } }).__AITOWN_VIEWPORT__;

    if (!viewport) {
      return null;
    }

    return {
      x: viewport.x,
      y: viewport.y,
      scale: viewport.scale?.x ?? null,
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
      clampPadding: viewport.clampPadding
    };
  });
}

function expectViewportBoundsWithinClampBudget(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>
) {
  const scale = state.scale ?? 1;
  const epsilon = 0.5;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;

  expect(state.left).toBeGreaterThanOrEqual(-epsilon);
  expect(state.right).toBeLessThanOrEqual(state.worldWidth + rightAllowance + epsilon);
  expect(state.top).toBeGreaterThanOrEqual(-(topAllowance + epsilon));
  expect(state.bottom).toBeLessThanOrEqual(state.worldHeight + epsilon);
}

async function readViewportScale(page: Page) {
  return page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: { scale?: { x?: number } } }).__AITOWN_VIEWPORT__;
    return viewport?.scale?.x ?? null;
  });
}

async function readViewportPose(page: Page) {
  return page.evaluate(() => {
    const viewport = (window as typeof window & {
      __AITOWN_VIEWPORT__?: { x: number; y: number; scale?: { x?: number } };
    }).__AITOWN_VIEWPORT__;

    if (!viewport) {
      return null;
    }

    return {
      x: viewport.x,
      y: viewport.y,
      scale: viewport.scale?.x ?? null
    };
  });
}

async function installFastPollInterval(page: Page, intervalMs = 100) {
  await page.addInitScript((nextIntervalMs: number) => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = nextIntervalMs;
  }, intervalMs);
}

async function enableScenario(page: Page, scenario: 'degraded-refresh' | 'stale-selection-404') {
  const runId = `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(
    ({ nextScenario, nextRunId }) => {
      document.cookie = `browser_smoke_mode=${encodeURIComponent(nextScenario)}; path=/`;
      document.cookie = `browser_smoke_run=${encodeURIComponent(nextRunId)}; path=/`;
    },
    { nextScenario: scenario, nextRunId: runId }
  );
}

async function installPinchTelemetry(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('.aitown-world__host');
    const records: Array<{
      type: string;
      defaultPrevented: boolean;
      pointerType?: string;
      touches?: number;
    }> = [];

    if (!(host instanceof HTMLElement)) {
      throw new Error('missing world host for pinch telemetry');
    }

    const record = (event: Event) => {
      records.push({
        type: event.type,
        defaultPrevented: event.defaultPrevented,
        pointerType: 'pointerType' in event ? (event as PointerEvent).pointerType : undefined,
        touches: 'touches' in event ? (event as TouchEvent).touches.length : undefined
      });
    };

    host.addEventListener('pointermove', record);
    host.addEventListener('touchmove', record);

    (window as typeof window & {
      __AITOWN_PINCH_TELEMETRY__?: typeof records;
    }).__AITOWN_PINCH_TELEMETRY__ = records;
  });
}

async function readPinchTelemetry(page: Page) {
  return page.evaluate(() => {
    return (window as typeof window & {
      __AITOWN_PINCH_TELEMETRY__?: Array<{
        type: string;
        defaultPrevented: boolean;
        pointerType?: string;
        touches?: number;
      }>;
    }).__AITOWN_PINCH_TELEMETRY__ ?? [];
  });
}

async function installCtrlWheelTelemetry(page: Page) {
  await page.addInitScript(() => {
    const records: Array<{
      action: 'observed' | 'preventDefault' | 'stopImmediatePropagation';
      ctrlKey: boolean;
      target: 'world-host' | 'other';
      defaultPrevented: boolean;
    }> = [];

    const classifyTarget = (target: EventTarget | null) => {
      return target instanceof Element && target.closest('.aitown-world__host') ? 'world-host' : 'other';
    };

    const originalPreventDefault = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function patchedPreventDefault(this: Event) {
      if (this.type === 'wheel' && this instanceof WheelEvent && this.ctrlKey) {
        records.push({
          action: 'preventDefault',
          ctrlKey: this.ctrlKey,
          target: classifyTarget(this.target),
          defaultPrevented: this.defaultPrevented
        });
      }

      return originalPreventDefault.call(this);
    };

    const originalStopImmediatePropagation = Event.prototype.stopImmediatePropagation;
    Event.prototype.stopImmediatePropagation = function patchedStopImmediatePropagation(this: Event) {
      if (this.type === 'wheel' && this instanceof WheelEvent && this.ctrlKey) {
        records.push({
          action: 'stopImmediatePropagation',
          ctrlKey: this.ctrlKey,
          target: classifyTarget(this.target),
          defaultPrevented: this.defaultPrevented
        });
      }

      return originalStopImmediatePropagation.call(this);
    };

    window.addEventListener(
      'wheel',
      (event) => {
        if (event.ctrlKey) {
          records.push({
            action: 'observed',
            ctrlKey: event.ctrlKey,
            target: classifyTarget(event.target),
            defaultPrevented: event.defaultPrevented
          });
        }
      },
      { capture: true, passive: true }
    );

    (window as typeof window & {
      __AITOWN_CTRL_WHEEL_TELEMETRY__?: typeof records;
    }).__AITOWN_CTRL_WHEEL_TELEMETRY__ = records;
  });
}

async function readCtrlWheelTelemetry(page: Page) {
  return page.evaluate(() => {
    return (window as typeof window & {
      __AITOWN_CTRL_WHEEL_TELEMETRY__?: Array<{
        action: 'observed' | 'preventDefault' | 'stopImmediatePropagation';
        ctrlKey: boolean;
        target: 'world-host' | 'other';
        defaultPrevented: boolean;
      }>;
    }).__AITOWN_CTRL_WHEEL_TELEMETRY__ ?? [];
  });
}

async function synthesizePinchGesture(page: Page, scaleFactor = 1.25) {
  const session = await page.context().newCDPSession(page);
  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  await session.send('Input.synthesizePinchGesture', {
    x: Math.round(canvasBox!.x + canvasBox!.width / 2),
    y: Math.round(canvasBox!.y + canvasBox!.height / 2),
    scaleFactor,
    relativeSpeed: 800,
    gestureSourceType: 'touch'
  });
}

async function zoomViewportOutToMinimum(page: Page) {
  await page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: any }).__AITOWN_VIEWPORT__;

    const minScale = viewport?.plugins.get('clamp-zoom')?.options?.minScale;
    if (viewport && typeof minScale === 'number') {
      viewport.setZoom(minScale, true);
      viewport.plugins.get('clamp')?.update?.();
    }
  });
}

async function forceViewportAgainstTopRightClamp(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
  await page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: any }).__AITOWN_VIEWPORT__;

    if (!viewport) {
      throw new Error('missing viewport');
    }

    viewport.moveCenter(viewport.worldWidth * 4, -viewport.worldHeight * 4);
    viewport.plugins.get('clamp')?.update?.();
  });
}

async function expectCanvasDragMovesViewport(page: Page) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));

  const before = await readViewportState(page);
  expect(before).not.toBeNull();
  expect(before!.screenWorldWidth).toBeGreaterThan(before!.screenWidth);
  expect(before!.screenWorldHeight).toBeGreaterThan(before!.screenHeight);

  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 120, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);

      return after && before
        ? { movedX: after.x > before.x, movedY: after.y > before.y }
        : null;
    })
    .toEqual({ movedX: true, movedY: true });
}

async function expectMinimumZoomKeepsTwoAxisPanRoom(page: Page) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
  await zoomViewportOutToMinimum(page);

  const before = await readViewportState(page);
  expect(before).not.toBeNull();

  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 300, startY + 300, { steps: 20 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);

      return after && before
        ? {
            movedX: after.x - before.x,
            movedY: after.y - before.y
          }
        : null;
    })
    .toMatchObject({
      movedX: expect.any(Number),
      movedY: expect.any(Number)
    });

  const after = await readViewportState(page);
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThanOrEqual(90);
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThanOrEqual(90);
}

test.describe('AI Town shell smoke', () => {
  test('renders the new default shell and allows roster-driven selection through the Hub overlay', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent' });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByText('Prepare handoff notes')).toBeVisible();
    await expect(detailsPanel.getByText('meeting-zone', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByText('Lead completed the revenue handoff')).toBeVisible();

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  test('treats Hub as a dismissible dialog and restores trigger focus on Escape', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Open Hub' });
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close Hub' })).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeFocused();
  });

  test('keeps Tab focus contained inside Hub while the dialog is open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const closeButton = dialog.getByRole('button', { name: 'Close Hub' });
    const rosterButtons = dialog.getByRole('button', { name: /Inspect / });

    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(rosterButtons.last()).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
  });

  test('keeps selected-agent workflow details pinned when a refresh-only workflow 404 arrives before overview drops the agent', async ({ page }) => {
    await installFastPollInterval(page);

    let workflowRequests = 0;
    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      workflowRequests += 1;
      if (workflowRequests === 1) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'not_found',
          details: 'unknown agent app-engineering'
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent' }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();

    await expect(detailsPanel.getByText('unknown agent app-engineering')).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
  });

  test('clears stale selected-agent workflow details after overview refresh confirms the agent is gone', async ({ page }) => {
    await installFastPollInterval(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent' }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    await enableScenario(page, 'stale-selection-404');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible({ timeout: 7_000 });
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toHaveCount(0);
  });

  test('keeps the last overview surface visible while degraded refresh warnings are active', async ({ page }) => {
    await installFastPollInterval(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();

    await enableScenario(page, 'degraded-refresh');

    await expect(page.getByText('Showing last office snapshot.')).toBeVisible({ timeout: 7_000 });
    await expect(page.getByText('overview refresh failed')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByText('Unable to load office overview.')).toHaveCount(0);
  });

  test('keeps the world diagonally draggable on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expectCanvasDragMovesViewport(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectCanvasDragMovesViewport(page);
  });

  test('keeps minimum-zoom viewport bounds inside the clamp padding budget on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
    await zoomViewportOutToMinimum(page);

    const landscape = await readViewportState(page);
    expect(landscape).not.toBeNull();
    expect(landscape!.screenWorldWidth).toBeGreaterThanOrEqual(landscape!.screenWidth);
    expect(landscape!.screenWorldHeight).toBeGreaterThanOrEqual(landscape!.screenHeight);
    expectViewportBoundsWithinClampBudget(landscape!);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
    await zoomViewportOutToMinimum(page);

    const portrait = await readViewportState(page);
    expect(portrait).not.toBeNull();
    expect(portrait!.screenWorldWidth).toBeGreaterThanOrEqual(portrait!.screenWidth);
    expect(portrait!.screenWorldHeight).toBeGreaterThanOrEqual(portrait!.screenHeight);
    expectViewportBoundsWithinClampBudget(portrait!);
  });

  test('still keeps meaningful two-axis drag room at minimum zoom on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expectMinimumZoomKeepsTwoAxisPanRoom(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectMinimumZoomKeepsTwoAxisPanRoom(page);
  });

  test('keeps selected-agent hub overlay clamp padding active at the top-right viewport boundary', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();
    await page.getByRole('button', { name: 'Inspect Growth Revenue Agent' }).click();
    await expect(page.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const viewport = await readViewportState(page);
        if (!viewport) {
          return false;
        }

        const scale = viewport.scale ?? 1;
        const epsilon = 0.5;
        const rightAllowance = (viewport.clampPadding?.right ?? 0) / scale;
        const topAllowance = (viewport.clampPadding?.top ?? 0) / scale;

        return (
          (viewport.clampPadding?.right ?? 0) >= 300 &&
          viewport.right <= viewport.worldWidth + rightAllowance + epsilon &&
          viewport.top >= -(topAllowance + epsilon)
        );
      })
      .toBe(true);
  });

  test('short-circuits ctrl-wheel canvas handling without preventDefaulting or zooming the viewport', async ({ page }) => {
    await installCtrlWheelTelemetry(page);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: { scale: { x: number; y: number } } }).__AITOWN_VIEWPORT__));

    const beforeScale = await readViewportScale(page);
    expect(beforeScale).not.toBeNull();

    await page.locator('.aitown-world__host canvas').hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Control');

    const afterScale = await readViewportScale(page);
    const telemetry = await readCtrlWheelTelemetry(page);

    expect(afterScale).not.toBeNull();
    expect(afterScale).toBe(beforeScale);
    expect(
      telemetry.filter((entry) => entry.action === 'observed' && entry.target === 'world-host' && entry.ctrlKey)
    ).not.toHaveLength(0);
    expect(
      telemetry.filter((entry) => entry.action === 'stopImmediatePropagation' && entry.target === 'world-host' && entry.ctrlKey)
    ).not.toHaveLength(0);
    expect(
      telemetry.filter((entry) => entry.action === 'preventDefault' && entry.target === 'world-host' && entry.ctrlKey)
    ).toHaveLength(0);
  });

  test('does not intercept touch pinch gestures or move the canvas viewport', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP pinch synthesis is Chromium-only');

    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
    await installPinchTelemetry(page);

    const beforePose = await readViewportPose(page);
    expect(beforePose).not.toBeNull();

    await synthesizePinchGesture(page);

    await expect
      .poll(async () => {
        const afterPose = await readViewportPose(page);
        const telemetry = await readPinchTelemetry(page);

        return {
          x: afterPose?.x ?? null,
          y: afterPose?.y ?? null,
          scale: afterPose?.scale ?? null,
          preventedPointerMoves: telemetry.filter(
            (entry) => entry.type === 'pointermove' && entry.pointerType === 'touch' && entry.defaultPrevented
          ).length,
          preventedTouchMoves: telemetry.filter(
            (entry) => entry.type === 'touchmove' && entry.defaultPrevented
          ).length
        };
      })
      .toEqual({
        x: beforePose!.x,
        y: beforePose!.y,
        scale: beforePose!.scale,
        preventedPointerMoves: 0,
        preventedTouchMoves: 0
      });
  });

  test('does not register gesture event listeners on the canvas host path', async ({ page }) => {
    await page.addInitScript(() => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const gestureRegistrations: Array<{ type: string; target: string }> = [];

      const describeTarget = (target: EventTarget) => {
        if (target === window) return 'window';
        if (target === document) return 'document';
        if (target instanceof HTMLCanvasElement) return 'canvas';
        if (target instanceof HTMLElement) {
          return target.classList.contains('aitown-world__host')
            ? 'aitown-world__host'
            : `${target.tagName.toLowerCase()}.${target.className}`;
        }
        return Object.prototype.toString.call(target);
      };

      EventTarget.prototype.addEventListener = function patchedAddEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === 'gesturestart' || type === 'gesturechange' || type === 'gestureend') {
          gestureRegistrations.push({ type, target: describeTarget(this) });
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      (window as typeof window & { __AITOWN_GESTURE_LISTENERS__?: Array<{ type: string; target: string }> }).__AITOWN_GESTURE_LISTENERS__ = gestureRegistrations;
    });

    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();

    const listeners = await page.evaluate(() => {
      return (window as typeof window & { __AITOWN_GESTURE_LISTENERS__?: Array<{ type: string; target: string }> }).__AITOWN_GESTURE_LISTENERS__ ?? [];
    });

    expect(listeners.filter((entry) => entry.target === 'aitown-world__host' || entry.target === 'canvas')).toEqual([]);
  });
});
