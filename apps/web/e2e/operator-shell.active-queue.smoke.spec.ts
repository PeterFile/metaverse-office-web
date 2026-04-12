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
});
