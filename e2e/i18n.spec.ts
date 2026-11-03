import { expect, test } from '@playwright/test';

test('界面可切英文，并在刷新后记住选择', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '数思工坊' })).toBeVisible();

  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('heading', { name: 'Math Mind Forge' })).toBeVisible();
  await expect(page.getByTestId('home-start')).toContainText('Enter the workshop');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Math Mind Forge' })).toBeVisible();

  await page.goto('/#/forge');
  await expect(page.getByRole('heading', { name: 'Thinking star map' })).toBeVisible();

  await page.goto('/#/play/k-structure-pattern-path');
  await expect(page.getByTestId('level-submit')).toContainText('Check structure');
  await expect(page.getByTestId('level-run')).toContainText('Run');

  await page.goto('/#/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('heading', { name: '数思工坊' })).toBeVisible();
});
