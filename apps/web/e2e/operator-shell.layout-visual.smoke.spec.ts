import { expect, test, type Locator, type Page } from '@playwright/test';

type RectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function readRect(locator: Locator): Promise<RectSnapshot> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  });
}

function resolveIntersectionArea(a: RectSnapshot, b: RectSnapshot) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function resolvePrimaryDragLane(rect: RectSnapshot): RectSnapshot {
  return {
    left: rect.left + rect.width * 0.25,
    right: rect.left + rect.width * 0.60,
    top: rect.top + rect.height * 0.25,
    bottom: rect.top + rect.height * 0.75,
    width: rect.width * 0.35,
    height: rect.height * 0.50
  };
}

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
}

async function expectLocatorWithinScrollport(locator: Locator, scrollport: Locator, label: string) {
  const [locatorRect, scrollportRect] = await Promise.all([readRect(locator), readRect(scrollport)]);
  const epsilon = 1;

  expect(locatorRect.top, `${label} should start inside the Hub first fold`).toBeGreaterThanOrEqual(
    scrollportRect.top - epsilon
  );
  expect(locatorRect.bottom, `${label} should fit inside the Hub first fold`).toBeLessThanOrEqual(
    scrollportRect.bottom + epsilon
  );
}

async function expectCanvasDragMovesViewport(page: Page) {
  const canvas = page.locator('.aitown-world__host canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const before = await readViewportState(page);
  expect(before).not.toBeNull();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.55;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);
      return after && before ? Math.abs(after.x - before.x) : 0;
    })
    .toBeGreaterThan(40);
}

test.describe('operator shell layout visual smoke', () => {
  test('keeps the Hub first fold glanceable without hiding the world drag lane', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const firstActiveQueueAction = activeQueueSection.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(activeQueueSection.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(firstActiveQueueAction).toBeVisible();
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await expectLocatorWithinScrollport(activeQueueSection.getByRole('heading', { name: 'Active Queue' }), hub, 'Active Queue heading');
    await expectLocatorWithinScrollport(firstActiveQueueAction, hub, 'first active queue action');

    const [worldRect, hubRect] = await Promise.all([readRect(worldHost), readRect(hub)]);
    const hubWorldObstructionRatio = resolveIntersectionArea(worldRect, hubRect) / (worldRect.width * worldRect.height);
    expect(hubWorldObstructionRatio, 'Hub sheet should stay a side sheet, not a world-covering modal').toBeLessThanOrEqual(
      0.36
    );
    expect(
      resolveIntersectionArea(resolvePrimaryDragLane(worldRect), hubRect),
      'Hub sheet should leave the primary world drag lane visually clear'
    ).toBe(0);

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(hub).toHaveCount(0);
    await expectCanvasDragMovesViewport(page);
  });
});
