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
