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

function resolveUpperWorldDragLane(rect: RectSnapshot): RectSnapshot {
  return {
    left: rect.left + rect.width * 0.25,
    right: rect.left + rect.width * 0.60,
    top: rect.top + rect.height * 0.12,
    bottom: rect.top + rect.height * 0.20,
    width: rect.width * 0.35,
    height: rect.height * 0.08
  };
}

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
}

function resolveWorldPointScreenProjection(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  point: { x: number; y: number }
) {
  return {
    x: ((point.x - state.left) / Math.max(state.right - state.left, Number.EPSILON)) * state.screenWidth,
    y: ((point.y - state.top) / Math.max(state.bottom - state.top, Number.EPSILON)) * state.screenHeight
  };
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

async function expectLocatorInsideViewport(page: Page, locator: Locator, label: string) {
  const rect = await readRect(locator);
  const viewport = page.viewportSize();
  const epsilon = 1;

  expect(viewport, `${label} requires an explicit viewport`).not.toBeNull();
  expect(rect.left, `${label} should not overflow viewport left`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.right, `${label} should not overflow viewport right`).toBeLessThanOrEqual(viewport!.width + epsilon);
  expect(rect.top, `${label} should not overflow viewport top`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.bottom, `${label} should not overflow viewport bottom`).toBeLessThanOrEqual(viewport!.height + epsilon);
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

function expectViewportWithinHorizontalWorldBounds(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;

  expect(state.left, `${label} should not expose a black left gutter`).toBeGreaterThanOrEqual(-0.5);
  expect(state.right, `${label} should stay covered by the world scene`).toBeLessThanOrEqual(
    state.worldWidth + rightAllowance + 0.5
  );
}

test.describe('operator shell layout visual smoke', () => {
  test('centers explicit agent locate requests on the viewport midpoint despite right-side chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page
      .getByRole('navigation', { name: 'Agent roster' })
      .getByRole('button', { name: 'Select and locate Protocol Engineering Agent' })
      .click();

    await expect
      .poll(async () => (await readViewportState(page))?.selectedAgent?.agentId ?? null)
      .toBe('protocol-engineering');

    const state = await readViewportState(page);
    expect(state).not.toBeNull();
    expect(state!.selectedAgent).not.toBeNull();
    expect(state!.clampPadding.right).toBeGreaterThan(0);

    const projection = resolveWorldPointScreenProjection(state!, {
      x: state!.selectedAgent!.x,
      y: state!.selectedAgent!.y
    });
    const biasedSafeLaneX = state!.screenWidth / 2 - state!.clampPadding.right / 2;

    expect(
      Math.abs(projection.x - state!.screenWidth / 2),
      'explicit agent focus should use screen X center'
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(projection.y - state!.screenHeight / 2),
      'explicit agent focus should use screen Y center'
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(projection.x - biasedSafeLaneX),
      'explicit agent focus should not reuse the right-safe-lane bias'
    ).toBeGreaterThan(20);
  });

  test('keeps compact HUD signals disclosure from blocking non-chip world drag', async ({ page }) => {
    const evidenceCoverage = {
      evidence_ref_count: 1,
      covered_agent_count: 1,
      low_confidence_agent_ids: ['growth-revenue'],
      source_kind_buckets: {
        workspace_file: 1,
        workspace_root: 0,
        tmux_observation: 0
      },
      agent_items: [
        {
          agent_id: 'growth-revenue',
          evidence_ref_count: 1,
          source_kinds: ['workspace_file'],
          latest_evidence_at: '2026-03-10T23:57:00.000Z',
          confidence_level: 'medium'
        }
      ]
    };

    await page.route('**/collectors/controller-snapshot/evidence-coverage', async (route) => {
      await route.fulfill({ json: { item: evidenceCoverage } });
    });

    await page.route('**/collectors/controller-snapshot', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();

      await route.fulfill({
        response,
        json: {
          item: {
            ...payload.item,
            evidence_coverage: evidenceCoverage
          }
        }
      });
    });

    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    const signals = page.getByRole('region', { name: 'Office HUD signals' });
    const signalsSummary = signals.locator('summary');
    const evidenceFocus = page.getByRole('region', { name: 'Evidence coverage focus' });
    const evidenceFocusHead = evidenceFocus.locator('.aitown-panel__evidence-focus__head');
    const evidenceFocusChip = evidenceFocus.getByRole('button', {
      name: 'Inspect evidence coverage focus agent Growth Revenue Agent'
    });
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
    await expect(signals).toBeVisible();
    await expect(signalsSummary.getByText('Signals', { exact: true })).toBeVisible();
    await expect(signalsSummary.getByText(/Evidence · 1/)).toBeVisible();
    await expect(evidenceFocus).toBeHidden();
    const roster = page.getByRole('navigation', { name: 'Agent roster' });
    const appEngineeringButton = roster.getByRole('button', { name: 'Select and locate App Engineering Agent' });
    const appEngineeringPortrait = roster.locator(
      '.aitown-agent-roster__portrait img[src="/assets/generated/sprites/agent-normal/idle-1.png"]'
    );
    await expect(roster).toBeVisible();
    await expect(appEngineeringButton).toBeVisible();
    await expect(appEngineeringPortrait).toBeVisible();
    await expect(roster.locator('.aitown-agent-roster__portrait').first()).not.toContainText('AE');
    const [rosterButtonRect, rosterPortraitRect] = await Promise.all([
      readRect(appEngineeringButton),
      readRect(roster.locator('.aitown-agent-roster__portrait').first())
    ]);
    expect(rosterButtonRect.width, 'roster should use compact RimWorld portrait cards, not wide info buttons').toBeLessThanOrEqual(60);
    expect(rosterPortraitRect.height, 'portrait should be the dominant roster card element').toBeGreaterThanOrEqual(40);
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);

    await signalsSummary.click();
    await expect(evidenceFocus).toBeVisible();
    await expect(evidenceFocus.getByText('Evidence', { exact: true })).toBeVisible();
    await expect(evidenceFocus.getByText('1 low coverage', { exact: true })).toBeVisible();
    await expect(evidenceFocus.getByText('Coverage below high-confidence/no evidence')).toBeVisible();
    await expect(evidenceFocusChip).toBeVisible();

    const before = await readViewportState(page);
    expect(before).not.toBeNull();
    const [headRect] = await Promise.all([readRect(evidenceFocusHead)]);
    const dragStart = {
      x: headRect.left + Math.min(16, Math.max(1, headRect.width / 2)),
      y: headRect.top + Math.min(12, Math.max(1, headRect.height / 2))
    };

    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideEvidenceFocus: Boolean(target?.closest('.aitown-panel__evidence-focus')),
        insideEvidenceFocusChip: Boolean(target?.closest('.aitown-focus-chip')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(
      hitTarget.insideWorld,
      `non-chip evidence focus area should pass through to the world: ${JSON.stringify(hitTarget)}`
    ).toBe(true);
    expect(hitTarget.insideEvidenceFocusChip).toBe(false);
    expect(hitTarget.insideEvidenceFocus).toBe(false);

    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 140, dragStart.y, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const current = await readViewportState(page);
        return current && before ? Math.abs(current.x - before.x) : 0;
      }, 'Evidence focus non-chip area should leave horizontal world drag usable')
      .toBeGreaterThan(40);
  });

  test('keeps Hub-open passive HUD overlay from blocking pan-first horizontal drag', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Crew' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const passiveTopline = page.locator('.aitown-panel__chrome > .aitown-panel__hud-top > .aitown-panel__topline').first();
    await expect(hub).toBeVisible();
    await expect(passiveTopline).toBeVisible();

    const before = await readViewportState(page);
    expect(before).not.toBeNull();
    expectViewportWithinHorizontalWorldBounds(before!, 'initial Hub-open viewport');

    const worldRect = await readRect(worldHost);
    const upperDragLane = resolveUpperWorldDragLane(worldRect);
    const dragStart = {
      x: upperDragLane.left + upperDragLane.width * 0.5,
      y: upperDragLane.top + upperDragLane.height * 0.5
    };
    expect(dragStart.x, 'drag should start inside the upper world lane').toBeGreaterThanOrEqual(
      upperDragLane.left + 1
    );
    expect(dragStart.x, 'drag should start inside the upper world lane').toBeLessThanOrEqual(
      upperDragLane.right - 1
    );
    expect(dragStart.y, 'drag should start inside the upper world lane').toBeGreaterThanOrEqual(
      upperDragLane.top + 1
    );
    expect(dragStart.y, 'drag should start inside the upper world lane').toBeLessThanOrEqual(
      upperDragLane.bottom - 1
    );

    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideHub: Boolean(target?.closest('#aitown-hub')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(hitTarget.insideWorld, `drag start should pass through passive HUD to the world: ${JSON.stringify(hitTarget)}`).toBe(
      true
    );
    expect(hitTarget.insideHub, `drag start should not be inside the Hub sheet: ${JSON.stringify(hitTarget)}`).toBe(false);

    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 160, dragStart.y, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const current = await readViewportState(page);
        return current && before ? Math.abs(current.x - before.x) : 0;
      }, 'Hub-open passive-HUD drag should move the viewport horizontally')
      .toBeGreaterThan(40);
    const after = await readViewportState(page);
    expect(after).not.toBeNull();

    expect(Math.abs(after!.top - before!.top), 'horizontal drag should not materially shift the vertical world lane').toBeLessThan(
      8
    );
    expect(after!.scale, 'pan-first drag must not depend on zoom changes').toBeCloseTo(before!.scale ?? 1, 3);
    expectViewportWithinHorizontalWorldBounds(after!, 'post-drag Hub-open viewport');
    await expect(hub).toBeVisible();
  });

  test('keeps the RimWorld window first fold readable while leaving the upper world drag lane', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const firstActiveQueueAction = activeQueueSection.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await expect(hub).toBeVisible();
    await expect(activeQueueSection.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(firstActiveQueueAction).toBeVisible();
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await expectLocatorWithinScrollport(activeQueueSection.getByRole('heading', { name: 'Active Queue' }), hub, 'Active Queue heading');
    await expectLocatorWithinScrollport(firstActiveQueueAction, hub, 'first active queue action');

    const [worldRect, hubRect] = await Promise.all([readRect(worldHost), readRect(hub)]);
    const hubWorldObstructionRatio = resolveIntersectionArea(worldRect, hubRect) / (worldRect.width * worldRect.height);
    expect(hubWorldObstructionRatio, 'RimWorld window should stay bounded, not a world-covering modal').toBeLessThanOrEqual(
      0.45
    );
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), hubRect),
      'RimWorld window should leave the upper world drag lane visually clear'
    ).toBe(0);

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expectCanvasDragMovesViewport(page);
  });

  test('keeps the 390px portrait shell bounded across Hub and selected-watch transitions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const initialOverflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(Math.max(initialOverflow.bodyWidth, initialOverflow.documentWidth)).toBeLessThanOrEqual(
      initialOverflow.viewportWidth + 1
    );

    await page.getByRole('button', { name: 'Crew' }).click();
    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(hub).toBeVisible();
    await expectLocatorInsideViewport(page, hub, 'mobile Hub sheet');

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    const overflowingDetailItems = await hub.locator('.aitown-record, .aitown-link-button').evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          className: element instanceof HTMLElement ? element.className : '',
          text: element.textContent?.trim().slice(0, 80) ?? ''
        }))
        .slice(0, 4)
    );
    expect(overflowingDetailItems).toEqual([]);

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);

    const toolbar = page.locator('.aitown-hub-category-bar');
    const statusLegend = page.locator('.aitown-status-legend');
    const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
    await expect(toolbar).toBeVisible();
    await expect(statusLegend).toBeVisible();
    await expect(watchOverlay).toBeVisible();

    await expectLocatorInsideViewport(page, toolbar, 'mobile category menu');
    await expectLocatorInsideViewport(page, statusLegend, 'mobile status legend');
    await expectLocatorInsideViewport(page, watchOverlay, 'mobile selected-watch overlay');

    const legendPolicy = await statusLegend.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        height: rect.height,
        overflowY: style.overflowY
      };
    });
    expect(legendPolicy.height, 'mobile status legend should stay bounded').toBeLessThanOrEqual(212);
    expect(legendPolicy.overflowY, 'mobile status legend should scroll instead of growing unbounded').toBe('auto');

    const centerHit = await page.evaluate(() => {
      const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);

      return {
        insideButton: Boolean(target?.closest('button')),
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    });
    expect(centerHit.insideButton, `portrait center should not hit chrome controls: ${JSON.stringify(centerHit)}`).toBe(
      false
    );
    expect(centerHit.insideWorld, `portrait center should remain a world drag lane: ${JSON.stringify(centerHit)}`).toBe(
      true
    );

    const finalOverflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(Math.max(finalOverflow.bodyWidth, finalOverflow.documentWidth)).toBeLessThanOrEqual(
      finalOverflow.viewportWidth + 1
    );
  });

  test('keeps selected-agent inspect peek compact outside the world drag lane', async ({ page }) => {
    const workflowRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/agents/growth-revenue/workflow')) {
        workflowRequests.push(url);
      }
    });

    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const hub = page.getByRole('dialog', { name: 'Hub' });
    await expect(hub).toHaveCount(0);

    await page.getByRole('button', { name: 'Inspect live focus agent Growth Revenue Agent' }).click();
    await expect(hub).toHaveCount(0);

    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();
    await expect(inspectPeek.getByText(/Yellow .* planning/)).toBeVisible();
    await expect(inspectPeek.getByText('Inspect facts')).toBeVisible();
    await expect(inspectPeek.getByText('Operation · Prepare handoff notes')).toBeHidden();
    expect(workflowRequests, 'Hub-closed inspect peek should not request selected-agent workflow').toHaveLength(0);
    await expect(inspectPeek.getByText('Correlation · corr-growth-lead-review')).toHaveCount(0);
    await expect(inspectPeek.getByText('Evidence · /tmp/growth-review-complete.md')).toHaveCount(0);

    await inspectPeek.getByText('Inspect facts').click();
    await expect(inspectPeek.getByText('Operation · Prepare handoff notes')).toBeVisible();

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

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
  });

  test('keeps the selected-agent Hub focus ribbon compact inside the RimWorld window', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
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
    await expect(focusRibbon.getByText('Loaded context facts')).toBeVisible();
    await expect(focusRibbon.getByText('Operation · Prepare handoff notes')).toBeVisible();
    await expect(focusRibbon.getByText('Correlation · corr-revenue-handoff')).toBeVisible();
    await expect(focusRibbon.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();

    const [worldRect, hubRect, ribbonRect] = await Promise.all([
      readRect(worldHost),
      readRect(hub),
      readRect(focusRibbon)
    ]);
    expect(ribbonRect.height, 'Hub focus ribbon should stay compact').toBeLessThanOrEqual(
      Math.min(184, page.viewportSize()!.height * 0.22) + 1
    );
    expect(ribbonRect.width, 'Hub focus ribbon should stay bounded by the Hub sheet').toBeLessThanOrEqual(
      hubRect.width
    );
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), ribbonRect),
      'Hub focus ribbon should not cover the upper world drag lane'
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
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(focusRibbon).toBeVisible();
    await expectLocatorInsideRect(focusRibbon, hub, 'Hub focus ribbon after no-op window scroll');

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toBeVisible();
  });

  test('selected-agent Hub drilldown tabs split Now Evidence and Replay Correlation inside the RimWorld window', async ({
    page
  }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });

    await expect(hub).toBeVisible();
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
    expect(hubRect.width, 'RimWorld window should stay bounded by its readable-window width contract').toBeLessThanOrEqual(
      Math.min(860, page.viewportSize()!.width - 32) + 1
    );
    expect(hubRect.height, 'RimWorld window should be tall enough to read opened category content').toBeGreaterThanOrEqual(
      419
    );
    expect(
      hubRect.height,
      'RimWorld window should stay bounded instead of becoming a full modal on desktop'
    ).toBeLessThanOrEqual(561);
    const selectedAgentChromeVerticalFootprint =
      Math.max(focusRibbonRect.bottom, drilldownRect.bottom) - Math.min(focusRibbonRect.top, drilldownRect.top);
    expect(
      selectedAgentChromeVerticalFootprint,
      'Hub focus ribbon and desktop drilldown tabs should keep a compact vertical footprint'
    ).toBeLessThanOrEqual(198);
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), drilldownRect),
      'Selected-agent drilldown tabs should not cover the upper world drag lane'
    ).toBe(0);
    await expectLocatorInsideRect(drilldown, hub, 'Selected-agent drilldown tabs');

    await hub.evaluate((element) => {
      element.scrollTop = 720;
    });
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
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

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
  });
});
