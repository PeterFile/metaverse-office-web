import { expect, test } from '@playwright/test';

test.describe('operator shell active queue smoke', () => {
  test('shows the active queue loading state explicitly while the initial queue request is pending', async ({ page }) => {
    let releaseOperations: (() => void) | null = null;
    let operationsRequestCount = 0;

    await page.route('**/office/operations?limit=4', async (route) => {
      operationsRequestCount += 1;
      if (operationsRequestCount === 1) {
        await new Promise<void>((resolve) => {
          releaseOperations = resolve;
        });
      }

      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByText('Loading operations queue...')).toBeVisible();

    expect(releaseOperations).not.toBeNull();
    releaseOperations!();

    await expect(
      detailsPanel.getByRole('button', {
        name: 'Inspect Growth Revenue Agent from active queue'
      })
    ).toBeVisible();
  });

  test('shows active queue failures explicitly instead of pretending empty on the default Hub open', async ({ page }) => {
    await page.route('**/office/operations?limit=4', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'internal_error',
          details: 'operations refresh failed'
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByText('Unable to load active queue. operations refresh failed')).toBeVisible();
    await expect(detailsPanel.getByText('No active operations queue.')).toHaveCount(0);
  });

  test('keeps filtered active queue loading, empty, and error states explicit', async ({ page }) => {
    let releasePlanningOperations: (() => void) | null = null;
    let planningOperationsRequestCount = 0;
    const filteredOperationStates: string[] = [];

    await page.route('**/office/operations**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== '/office/operations' ||
        url.searchParams.get('limit') !== '4' ||
        url.searchParams.has('agent_id')
      ) {
        await route.continue();
        return;
      }

      const state = url.searchParams.get('state');
      if (state === 'planning') {
        filteredOperationStates.push(state);
        planningOperationsRequestCount += 1;
        if (planningOperationsRequestCount === 1) {
          await new Promise<void>((resolve) => {
            releasePlanningOperations = resolve;
          });
          const response = await route.fetch();
          await route.fulfill({ response });
          return;
        }

        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'internal_error',
            details: 'planning queue refresh failed'
          })
        });
        return;
      }

      if (state === 'reviewing') {
        filteredOperationStates.push(state);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generated_at: '2026-03-16T09:00:00.000Z',
            summary: {
              item_count: 0,
              blocked_count: 0,
              reboot_recommended_count: 0,
              state_buckets: {},
              severity_buckets: {
                normal: 0,
                yellow: 0,
                orange: 0,
                red: 0
              }
            },
            items: []
          })
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const stateFilter = queueSection.getByRole('combobox', { name: 'Filter active queue by state' });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(stateFilter).toBeVisible();
    await expect(stateFilter).toContainText('All states (2)');
    await expect(stateFilter).toContainText('Planning (1)');
    await expect(stateFilter).toContainText('Reviewing (1)');

    await stateFilter.selectOption('planning');
    await expect(queueSection.getByText('Loading active queue for Planning state...')).toBeVisible();
    await expect.poll(() => filteredOperationStates.filter((state) => state === 'planning').length).toBe(1);

    expect(releasePlanningOperations).not.toBeNull();
    releasePlanningOperations!();

    await expect(queueSection.getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })).toBeVisible();
    await expect(queueSection.getByRole('button', { name: 'Inspect Team Lead from active queue' })).toHaveCount(0);

    await stateFilter.selectOption('reviewing');
    await expect(queueSection.getByText('No active queue items for Reviewing state.')).toBeVisible();
    await expect.poll(() => filteredOperationStates.filter((state) => state === 'reviewing').length).toBe(1);

    await stateFilter.selectOption('planning');
    await expect(queueSection.getByText('Unable to load active queue for Planning state. planning queue refresh failed')).toBeVisible();
    await expect.poll(() => filteredOperationStates.filter((state) => state === 'planning').length).toBe(2);
  });
});
