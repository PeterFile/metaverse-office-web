import { expect, test, type Locator, type Page } from '@playwright/test';

const POLL_INTERVAL_MS = 15_000;
const POLL_WAIT_MS = POLL_INTERVAL_MS + 1_000;

test.describe('operator shell keyboard smoke', () => {
  test('navigates watch topology and evidence surfaces with Tab + Enter/Space', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Operator Shell' })).toBeVisible();

    const watchTargetButton = page.getByRole('button', {
      name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
    });
    await tabToElement(page, watchTargetButton);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeVisible();

    const workflowPanel = page.getByRole('complementary', { name: 'Workflow panel' });
    const workflowCorrelationButton = workflowPanel.getByRole('button', {
      name: 'Open correlation corr-growth-lead-review'
    });
    await tabToElement(page, workflowCorrelationButton);
    await page.keyboard.press('Space');

    await expect(
      page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
    ).toBeVisible();

    const correlationPanel = page.getByRole('region', { name: 'Correlation drilldown' });
    const participantButton = correlationPanel
      .getByRole('list', { name: 'Correlation participants' })
      .getByRole('button', {
        name: 'Select workflow for team-lead'
      });
    await tabToElement(page, participantButton);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Workflow: Team Lead' })).toBeVisible();

    const incidentFeedPanel = page.getByRole('region', { name: 'Global incident feed' });
    const incidentCorrelationButton = incidentFeedPanel.getByRole('button', {
      name: 'Inspect correlation corr-revenue-handoff'
    });
    await tabToElement(page, incidentCorrelationButton);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Correlation: corr-revenue-handoff' })).toBeVisible();

    const incidentWorkflowButton = incidentFeedPanel.getByRole('button', {
      name: 'Select workflow for growth-revenue'
    });
    await tabToElement(page, incidentWorkflowButton);
    await page.keyboard.press('Space');

    await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeVisible();
  });

  test('keeps the narrow responsive layout operable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 1200 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Operator Shell' })).toBeVisible();

    const contentShell = page.locator('.app-shell__content');
    const operationsShell = page.locator('.app-shell__operations');
    const officeGrid = page.getByRole('region', { name: 'Office grid' });

    expect(countGridTracks(await contentShell.evaluate((element) => getComputedStyle(element).gridTemplateColumns))).toBe(1);
    expect(
      countGridTracks(await operationsShell.evaluate((element) => getComputedStyle(element).gridTemplateColumns))
    ).toBe(1);

    const officeGridBox = await boundingBoxOrThrow(officeGrid);
    const leadDeskBox = await boundingBoxOrThrow(
      page.locator('article').filter({ has: page.getByRole('heading', { name: 'Team Lead Desk' }) })
    );
    const appDeskBox = await boundingBoxOrThrow(
      page.locator('article').filter({ has: page.getByRole('heading', { name: 'App Engineering Desk' }) })
    );
    const meetingZoneBox = await boundingBoxOrThrow(
      page.locator('article').filter({ has: page.getByRole('heading', { name: 'Meeting Zone' }) })
    );

    expect(leadDeskBox.width).toBeGreaterThan(officeGridBox.width * 0.8);
    expect(meetingZoneBox.width).toBeGreaterThan(officeGridBox.width * 0.8);
    expect(appDeskBox.width).toBeLessThan(officeGridBox.width * 0.7);

    const workflowPanel = await openGrowthWorkflowViaWatchTopology(page);
    const workflowCorrelationButton = workflowPanel.getByRole('button', {
      name: 'Open correlation corr-growth-lead-review'
    });
    await tabToElement(page, workflowCorrelationButton);
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
    ).toBeVisible();

    const incidentFeedPanel = page.getByRole('region', { name: 'Global incident feed' });
    const watchTopologyPanel = page.getByRole('region', { name: 'Watch topology' });
    const correlationPanel = page.getByRole('region', { name: 'Correlation drilldown' });

    const incidentFeedBox = await boundingBoxOrThrow(incidentFeedPanel);
    const watchTopologyBox = await boundingBoxOrThrow(watchTopologyPanel);
    const correlationBox = await boundingBoxOrThrow(correlationPanel);

    expect(Math.abs(incidentFeedBox.x - watchTopologyBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(watchTopologyBox.x - correlationBox.x)).toBeLessThanOrEqual(1);
    expect(watchTopologyBox.y).toBeGreaterThan(incidentFeedBox.y);
    expect(correlationBox.y).toBeGreaterThan(watchTopologyBox.y);

    await expectNoHorizontalOverflow(page);
  });

  test(
    'keeps last-good overview/workflow/incident/correlation surfaces visible during degraded refresh polls',
    async ({ page }, testInfo) => {
      test.slow();
      await configureSmokeScenario(page, 'degraded-refresh', testInfo.testId);
      await page.goto('/');
      const workflowPanel = await openGrowthWorkflowViaWatchTopology(page);
      const incidentFeedPanel = page.getByRole('region', { name: 'Global incident feed' });

      const workflowCorrelationButton = workflowPanel.getByRole('button', {
        name: 'Open correlation corr-growth-lead-review'
      });
      await tabToElement(page, workflowCorrelationButton);
      await page.keyboard.press('Enter');

      await expect(
        page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
      ).toBeVisible();
      await expect(
        incidentFeedPanel.getByRole('button', { name: 'Inspect correlation corr-revenue-handoff' })
      ).toBeVisible();

      await page.waitForTimeout(POLL_WAIT_MS);

      await expect(
        page.getByText(
          'Overview refresh degraded. Showing last good data. Reason: overview refresh failed'
        )
      ).toBeVisible();
      await expect(
        page.getByText(
          'Workflow refresh degraded. Showing last good data. Reason: workflow refresh failed'
        )
      ).toBeVisible();
      await expect(
        page.getByText(
          'Incident feed refresh degraded. Showing last good data. Reason: incident refresh failed'
        )
      ).toBeVisible();
      await expect(
        page.getByText(
          'Correlation refresh degraded. Showing last good data. Reason: correlation refresh failed'
        )
      ).toBeVisible();

      await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
      ).toBeVisible();
      await expect(workflowCorrelationButton).toBeVisible();
      await expect(
        incidentFeedPanel.getByRole('button', { name: 'Inspect correlation corr-revenue-handoff' })
      ).toBeVisible();
    }
  );

  test(
    'clears stale workflow/correlation selection only after evidence vanishes and later polls return 404',
    async ({ page }, testInfo) => {
      test.slow();
      await page.goto('/');
      const workflowPanel = await openGrowthWorkflowViaWatchTopology(page);

      const workflowCorrelationButton = workflowPanel.getByRole('button', {
        name: 'Open correlation corr-growth-lead-review'
      });
      await tabToElement(page, workflowCorrelationButton);
      await page.keyboard.press('Enter');

      await expect(
        page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
      ).toBeVisible();

      await configureSmokeScenario(page, 'stale-selection-404', testInfo.testId);
      await page.waitForTimeout(POLL_WAIT_MS);

      await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
      ).toBeVisible();
      await expect(
        workflowPanel.getByRole('button', { name: 'Open correlation corr-growth-lead-review' })
      ).toHaveCount(0);
      await expect(
        page.getByText(
          'Growth Revenue Agent is absent from the current office overview. Workflow evidence remains available, but the office grid and watch topology cannot highlight this agent.'
        )
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
        })
      ).toHaveCount(0);
      await expect(
        page.getByText('Select an agent to inspect incidents, interactions, and replay evidence.')
      ).toHaveCount(0);
      await expect(
        page.getByText('Select a correlation id from workflow or incident feed.')
      ).toHaveCount(0);

      await page.waitForTimeout(POLL_WAIT_MS);

      await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Correlation: corr-growth-lead-review' })
      ).toHaveCount(0);
      await expect(
        page.getByText('Select an agent to inspect incidents, interactions, and replay evidence.')
      ).toBeVisible();
      await expect(
        page.getByText('Select a correlation id from workflow or incident feed.')
      ).toBeVisible();
      await expect(page.getByText('unknown agent growth-revenue')).toHaveCount(0);
      await expect(page.getByText('unknown correlation corr-growth-lead-review')).toHaveCount(0);
    }
  );
});

async function openGrowthWorkflowViaWatchTopology(page: Page) {
  await expect(page.getByRole('heading', { name: 'Operator Shell' })).toBeVisible();

  const watchTargetButton = page.getByRole('button', {
    name: 'Select target Growth Revenue Agent from Team Lead (lead watch)'
  });
  await tabToElement(page, watchTargetButton);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Workflow: Growth Revenue Agent' })).toBeVisible();

  return page.getByRole('complementary', { name: 'Workflow panel' });
}

async function configureSmokeScenario(
  page: Page,
  scenario: 'degraded-refresh' | 'stale-selection-404',
  runSeed: string
) {
  const runId = `${sanitizeCookieValue(runSeed)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  await page.context().addCookies([
    {
      name: 'browser_smoke_mode',
      value: scenario,
      url: 'http://127.0.0.1/'
    },
    {
      name: 'browser_smoke_run',
      value: runId,
      url: 'http://127.0.0.1/'
    }
  ]);
}

function sanitizeCookieValue(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function countGridTracks(gridTemplateColumns: string) {
  const normalized = gridTemplateColumns.trim();
  if (!normalized || normalized === 'none') {
    return 0;
  }

  const splitTopLevelTokens = (value: string) => {
    const tokens: string[] = [];
    let tokenStart = -1;
    let parenthesisDepth = 0;
    let bracketDepth = 0;

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];

      if (tokenStart === -1 && !/\s/.test(char)) {
        tokenStart = index;
      }

      if (char === '(') {
        parenthesisDepth += 1;
      } else if (char === ')') {
        parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      } else if (char === '[') {
        bracketDepth += 1;
      } else if (char === ']') {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }

      if (tokenStart !== -1 && parenthesisDepth === 0 && bracketDepth === 0 && /\s/.test(char)) {
        tokens.push(value.slice(tokenStart, index));
        tokenStart = -1;
      }
    }

    if (tokenStart !== -1) {
      tokens.push(value.slice(tokenStart));
    }

    return tokens.filter(Boolean);
  };

  const countTrackList = (value: string): number => {
    const tokens = splitTopLevelTokens(value);
    let trackCount = 0;

    for (const token of tokens) {
      if (token.startsWith('[') && token.endsWith(']')) {
        continue;
      }

      if (token.startsWith('repeat(') && token.endsWith(')')) {
        const inner = token.slice('repeat('.length, -1);
        let parenthesisDepth = 0;
        let bracketDepth = 0;
        let separatorIndex = -1;

        for (let index = 0; index < inner.length; index += 1) {
          const char = inner[index];
          if (char === '(') {
            parenthesisDepth += 1;
          } else if (char === ')') {
            parenthesisDepth = Math.max(0, parenthesisDepth - 1);
          } else if (char === '[') {
            bracketDepth += 1;
          } else if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
          } else if (char === ',' && parenthesisDepth === 0 && bracketDepth === 0) {
            separatorIndex = index;
            break;
          }
        }

        if (separatorIndex === -1) {
          trackCount += 1;
          continue;
        }

        const repeatCountToken = inner.slice(0, separatorIndex).trim();
        const repeatedTrackList = inner.slice(separatorIndex + 1).trim();
        const repeatCount = Number.parseInt(repeatCountToken, 10);
        const repeatedTrackCount = countTrackList(repeatedTrackList);

        trackCount += Number.isFinite(repeatCount)
          ? repeatCount * repeatedTrackCount
          : repeatedTrackCount;
        continue;
      }

      trackCount += 1;
    }

    return trackCount;
  };

  return countTrackList(normalized);
}

async function boundingBoxOrThrow(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowPx).toBeLessThanOrEqual(1);
}

async function tabToElement(page: Page, locator: Locator, maxTabs = 250): Promise<void> {
  await expect(locator).toBeVisible();

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');

    const isFocused = await locator
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (isFocused) {
      return;
    }
  }

  throw new Error(`tab_navigation_failed:${await locator.getAttribute('aria-label')}`);
}
