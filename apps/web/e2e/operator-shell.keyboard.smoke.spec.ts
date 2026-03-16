import { expect, test } from '@playwright/test';

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
});
