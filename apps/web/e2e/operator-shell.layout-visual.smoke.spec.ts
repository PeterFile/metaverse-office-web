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

async function expectLocatorTopInsideScrollport(locator: Locator, scrollport: Locator, label: string) {
  await expect
    .poll(async () => {
      const [locatorRect, scrollportRect] = await Promise.all([readRect(locator), readRect(scrollport)]);
      const epsilon = 1;

      return locatorRect.top >= scrollportRect.top - epsilon && locatorRect.top <= scrollportRect.bottom + epsilon;
    }, `${label} top should be visible in the Hub scrollport`)
    .toBe(true);
}

async function expectLocatorInsideRect(locator: Locator, container: Locator, label: string) {
  const [locatorRect, containerRect] = await Promise.all([readRect(locator), readRect(container)]);
  const epsilon = 1;

  expect(locatorRect.left, `${label} should stay inside the Hub sheet`).toBeGreaterThanOrEqual(
    containerRect.left - epsilon
  );
  expect(locatorRect.right, `${label} should stay inside the Hub sheet`).toBeLessThanOrEqual(
    containerRect.right + epsilon
  );
  expect(locatorRect.top, `${label} should stay inside the Hub sheet`).toBeGreaterThanOrEqual(
    containerRect.top - epsilon
  );
  expect(locatorRect.bottom, `${label} should stay inside the Hub sheet`).toBeLessThanOrEqual(
    containerRect.bottom + epsilon
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

  test('keeps selected-agent inspect peek compact outside the world drag lane', async ({ page }) => {
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

    await activeQueueSection
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(hub).toHaveCount(0);

    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();
    await expect(inspectPeek.getByText(/Yellow .* planning/)).toBeVisible();
    await expect(inspectPeek.getByText('Operation · Prepare handoff notes')).toBeVisible();
    await expect(inspectPeek.getByText('Correlation · corr-revenue-handoff')).toBeVisible();
    await expect(inspectPeek.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();

    const [worldRect, peekRect] = await Promise.all([readRect(worldHost), readRect(inspectPeek)]);
    expect(peekRect.width, 'Inspect peek should stay compact').toBeLessThanOrEqual(360);
    expect(peekRect.height, 'Inspect peek should stay compact').toBeLessThanOrEqual(240);
    expect(
      resolveIntersectionArea(resolvePrimaryDragLane(worldRect), peekRect),
      'Inspect peek should stay outside the primary world drag lane'
    ).toBe(0);

    const overflowPolicy = await inspectPeek.evaluate((element) => {
      const peekStyle = getComputedStyle(element);
      const facts = element.querySelector('.aitown-selected-agent-peek__facts');
      const factsStyle = facts ? getComputedStyle(facts) : null;
      return {
        peekOverflow: peekStyle.overflow,
        factsOverflowY: factsStyle?.overflowY ?? null
      };
    });
    expect(overflowPolicy.peekOverflow, 'Inspect peek should clip long labels instead of painting outside').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factsOverflowY, 'Inspect peek facts should scroll or clip long evidence refs').not.toBe(
      'visible'
    );

    await inspectPeek.getByRole('button', { name: 'Open selected agent in Hub' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
  });

  test('keeps the selected-agent Hub focus ribbon compact and sticky inside the Hub sheet', async ({ page }) => {
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

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toHaveCount(0);
    await expectLocatorWithinScrollport(
      activeQueueSection.getByRole('heading', { name: 'Active Queue' }),
      hub,
      'Active Queue heading'
    );
    await expectLocatorWithinScrollport(
      activeQueueSection.getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' }),
      hub,
      'first active queue action'
    );

    await activeQueueSection
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    const focusRibbon = page.getByRole('region', { name: 'Hub focus ribbon' });
    await expect(focusRibbon).toBeVisible();
    await expect(focusRibbon.getByText('Growth Revenue Agent')).toBeVisible();
    await expect(focusRibbon.getByText(/Yellow .* planning/)).toBeVisible();
    await expect(focusRibbon.getByText('Operation · Prepare handoff notes')).toBeVisible();
    await expect(focusRibbon.getByText('Correlation · corr-revenue-handoff')).toBeVisible();
    await expect(focusRibbon.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();

    const [worldRect, hubRect, ribbonRect] = await Promise.all([
      readRect(worldHost),
      readRect(hub),
      readRect(focusRibbon)
    ]);
    expect(ribbonRect.height, 'Hub focus ribbon should stay compact').toBeLessThanOrEqual(132);
    expect(ribbonRect.width, 'Hub focus ribbon should stay bounded by the Hub sheet').toBeLessThanOrEqual(
      hubRect.width
    );
    expect(
      resolveIntersectionArea(resolvePrimaryDragLane(worldRect), ribbonRect),
      'Hub focus ribbon should not cover the primary world drag lane'
    ).toBe(0);
    await expectLocatorInsideRect(focusRibbon, hub, 'Hub focus ribbon');

    const overflowPolicy = await focusRibbon.evaluate((element) => {
      const ribbonStyle = getComputedStyle(element);
      const facts = element.querySelector('.aitown-hub-focus-ribbon__facts');
      const factsStyle = facts ? getComputedStyle(facts) : null;
      const fact = element.querySelector('.aitown-hub-focus-ribbon__facts span');
      const factStyle = fact ? getComputedStyle(fact) : null;
      return {
        ribbonOverflow: ribbonStyle.overflow,
        factsOverflowX: factsStyle?.overflowX ?? null,
        factsOverflowY: factsStyle?.overflowY ?? null,
        factOverflowWrap: factStyle?.overflowWrap ?? null
      };
    });
    expect(overflowPolicy.ribbonOverflow, 'Hub focus ribbon should clip long labels').not.toBe('visible');
    expect(overflowPolicy.factsOverflowX, 'Hub focus ribbon facts should not paint sideways').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factsOverflowY, 'Hub focus ribbon facts should clip or scroll vertically').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factOverflowWrap, 'Hub focus ribbon facts should wrap long tokens').toBe('anywhere');

    await hub.evaluate((element) => {
      element.scrollTop = 720;
    });
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    await expect(focusRibbon).toBeVisible();
    const scrolledRibbonRect = await readRect(focusRibbon);
    expect(scrolledRibbonRect.top, 'Hub focus ribbon should remain sticky in the Hub sheet').toBeGreaterThanOrEqual(
      hubRect.top - 1
    );
    expect(scrolledRibbonRect.bottom, 'Hub focus ribbon should remain visible in the Hub sheet').toBeLessThanOrEqual(
      hubRect.bottom + 1
    );

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();

    await inspectPeek.getByRole('button', { name: 'Open selected agent in Hub' }).click();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toBeVisible();
  });

  test('selected-agent Hub drilldown tabs split Now Evidence and Replay Correlation without widening the Hub', async ({
    page
  }) => {
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

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(activeQueueSection.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toHaveCount(0);

    await activeQueueSection
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    const focusRibbon = page.getByRole('region', { name: 'Hub focus ribbon' });
    const drilldown = page.getByRole('region', { name: 'Selected agent drilldown' });
    const tablist = page.getByRole('tablist', { name: 'Selected agent drilldown' });
    const nowTab = tablist.getByRole('tab', { name: 'Now' });
    const evidenceTab = tablist.getByRole('tab', { name: 'Evidence' });
    const replayTab = tablist.getByRole('tab', { name: 'Replay / Correlation' });

    await expect(focusRibbon).toBeVisible();
    await expect(tablist).toBeVisible();
    await expect(nowTab).toHaveAttribute('aria-selected', 'true');
    await expect(evidenceTab).toHaveAttribute('aria-selected', 'false');
    await expect(replayTab).toHaveAttribute('aria-selected', 'false');

    const nowPanel = page.getByRole('tabpanel', { name: 'Now' });
    const nowOperationSection = nowPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    await expect(nowPanel).toBeVisible();
    await expect(nowPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(nowOperationSection.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(nowOperationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(
      nowOperationSection.getByRole('button', { name: /Open operation correlation corr-revenue-handoff/ })
    ).toBeVisible();
    await expect(
      nowOperationSection.getByRole('button', { name: 'Jump to shared memory artifact /tmp/revenue-handoff.md' })
    ).toBeVisible();
    await expect(nowPanel.getByRole('heading', { name: 'Timeline Replay' })).toHaveCount(0);
    await expect(nowPanel.getByRole('heading', { name: 'Correlation Drilldown' })).toHaveCount(0);

    const [worldRect, hubRect, focusRibbonRect, drilldownRect] = await Promise.all([
      readRect(worldHost),
      readRect(hub),
      readRect(focusRibbon),
      readRect(drilldown)
    ]);
    expect(hubRect.width, 'Hub width should remain unchanged').toBeLessThanOrEqual(430);
    expect(
      focusRibbonRect.height + drilldownRect.height,
      'Hub focus ribbon plus drilldown tabs should stay compact'
    ).toBeLessThanOrEqual(198);
    expect(
      resolveIntersectionArea(resolvePrimaryDragLane(worldRect), drilldownRect),
      'Selected-agent drilldown tabs should not cover the primary world drag lane'
    ).toBe(0);
    await expectLocatorInsideRect(drilldown, hub, 'Selected-agent drilldown tabs');

    await hub.evaluate((element) => {
      element.scrollTop = 720;
    });
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    await evidenceTab.click();
    const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
    await expect(evidencePanel).toBeVisible();
    await expectLocatorTopInsideScrollport(evidencePanel, hub, 'Evidence tab panel');
    await expect(evidencePanel.getByRole('heading', { name: 'Collector Observation' })).toBeVisible();
    await expect(evidencePanel.getByRole('heading', { name: 'Audit Signals' })).toBeVisible();
    const evidenceWorkflowSection = evidencePanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    await expect(evidenceWorkflowSection.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(
      evidenceWorkflowSection
        .getByRole('button', { name: 'Jump to shared memory artifact /tmp/revenue-handoff.md' })
        .first()
    ).toBeVisible();

    await replayTab.click();
    const replayPanel = page.getByRole('tabpanel', { name: 'Replay / Correlation' });
    await expect(replayPanel).toBeVisible();
    await expectLocatorTopInsideScrollport(replayPanel, hub, 'Replay / Correlation tab panel');
    await expect(replayPanel.getByRole('heading', { name: 'Timeline Replay' })).toBeVisible();
    await expect(replayPanel.getByRole('heading', { name: 'Correlation Drilldown' })).toBeVisible();

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();

    await inspectPeek.getByRole('button', { name: 'Open selected agent in Hub' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
  });
});
