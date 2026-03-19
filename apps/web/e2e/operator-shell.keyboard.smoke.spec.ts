import { expect, test, type Page } from '@playwright/test';

async function readViewportState(page: Page) {
  return page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: {
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
    } }).__AITOWN_VIEWPORT__;

    if (!viewport) {
      return null;
    }

    return {
      x: viewport.x,
      y: viewport.y,
      left: viewport.left,
      top: viewport.top,
      right: viewport.right,
      bottom: viewport.bottom,
      screenWidth: viewport.screenWidth,
      screenHeight: viewport.screenHeight,
      worldWidth: viewport.worldWidth,
      worldHeight: viewport.worldHeight,
      screenWorldWidth: viewport.screenWorldWidth,
      screenWorldHeight: viewport.screenWorldHeight
    };
  });
}

async function readViewportScale(page: Page) {
  return page.evaluate(() => {
    const viewport = (window as typeof window & { __AITOWN_VIEWPORT__?: { scale?: { x?: number } } }).__AITOWN_VIEWPORT__;
    return viewport?.scale?.x ?? null;
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

  test('keeps the world diagonally draggable on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expectCanvasDragMovesViewport(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectCanvasDragMovesViewport(page);
  });

  test('does not expose empty canvas when zoomed all the way out on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
    await zoomViewportOutToMinimum(page);

    const landscape = await readViewportState(page);
    expect(landscape).not.toBeNull();
    expect(landscape!.screenWorldWidth).toBeGreaterThanOrEqual(landscape!.screenWidth);
    expect(landscape!.screenWorldHeight).toBeGreaterThanOrEqual(landscape!.screenHeight);
    
    
    // Left strict bounds, right pad for hub
    expect(landscape!.left).toBeGreaterThanOrEqual(0);
    expect(landscape!.right).toBeLessThanOrEqual(landscape!.worldWidth + landscape!.screenWidth * 2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: object }).__AITOWN_VIEWPORT__));
    await zoomViewportOutToMinimum(page);

    const portrait = await readViewportState(page);
    expect(portrait).not.toBeNull();
    expect(portrait!.screenWorldWidth).toBeGreaterThanOrEqual(portrait!.screenWidth);
    expect(portrait!.screenWorldHeight).toBeGreaterThanOrEqual(portrait!.screenHeight);
    
    
    // Top and Bottom strictly bounded
    expect(portrait!.top).toBeGreaterThanOrEqual(0);
    expect(portrait!.bottom).toBeLessThanOrEqual(portrait!.worldHeight);
  });

  test('still keeps meaningful two-axis drag room at minimum zoom on landscape and portrait shells', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expectMinimumZoomKeepsTwoAxisPanRoom(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectMinimumZoomKeepsTwoAxisPanRoom(page);
  });

  test('routes ctrl-wheel to the browser without zooming the canvas viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean((window as typeof window & { __AITOWN_VIEWPORT__?: { scale: { x: number; y: number } } }).__AITOWN_VIEWPORT__));

    const beforeScale = await readViewportScale(page);
    expect(beforeScale).not.toBeNull();

    const result = await page.locator('.aitown-world__host canvas').evaluate((canvas) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: 120
      });
      const dispatchReturned = canvas.dispatchEvent(event);

      return {
        dispatchReturned,
        defaultPrevented: event.defaultPrevented
      };
    });

    const afterScale = await readViewportScale(page);
    expect(afterScale).not.toBeNull();
    expect(result).toEqual({
      dispatchReturned: true,
      defaultPrevented: false
    });
    expect(afterScale).toBe(beforeScale);
  });

  test('does not register Safari gesture listeners on the canvas host path', async ({ page }) => {
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
