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
  await expect(page.getByTestId('level-card-k-structure-pattern-path')).toContainText('Pattern Tinkerer');

  await page.goto('/#/play/k-structure-pattern-path');
  await expect(page.getByText('Pattern Tinkerer').first()).toBeVisible();
  await expect(page.getByTestId('level-submit')).toContainText('Check structure');
  await expect(page.getByTestId('level-run')).toContainText('Run');

  await page.goto('/#/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('heading', { name: '数思工坊' })).toBeVisible();
});

test('英文界面下证据与报告也是英文', async ({ page }) => {
  await page.goto('/#/play/k-structure-pattern-path?autoplay=1&instant=1');
  await page.waitForTimeout(1200);

  await page.goto('/#/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('heading', { name: 'Math Mind Forge' })).toBeVisible();

  await page.goto('/#/badges');
  await expect(page.getByTestId('badges-view')).toBeVisible();
  await expect(page.getByTestId('badge-pattern-spotter')).toContainText('Pattern Spotter');

  await page.goto('/#/journal');
  await expect(page.getByTestId('journal-view')).toBeVisible();

  await page.goto('/#/report');
  await expect(page.getByTestId('adult-gate')).toBeVisible();
  const hold = page.getByTestId('adult-hold');
  const box = await hold.boundingBox();
  if (!box) throw new Error('adult-hold 没有可点击区域');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId('report-view')).toBeVisible();
  await expect(page.getByText('All data stays on this device')).toBeVisible();
});
