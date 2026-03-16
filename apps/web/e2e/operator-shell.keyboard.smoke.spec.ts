import { expect, test } from '@playwright/test';

test.describe('AI Town shell smoke', () => {
  test('renders the new default shell and allows roster-driven selection', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    const inspectButton = page.getByRole('button', { name: 'Inspect Growth Revenue Agent' });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click({ force: true });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByText('Prepare handoff notes')).toBeVisible();
    await expect(detailsPanel.getByText('meeting-zone', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByText('Lead completed the revenue handoff')).toBeVisible();
  });
});
