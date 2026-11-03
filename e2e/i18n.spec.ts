import { expect, test } from '@playwright/test';
import { waitEvent } from './shared';

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
  await expect(page.getByTestId('level-submit')).toContainText('Finish');
  await expect(page.getByTestId('level-run')).toContainText('Try it');

  await page.goto('/#/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('heading', { name: '数思工坊' })).toBeVisible();
});

test('英文界面下证据与报告也是英文', async ({ page }) => {
  await page.goto('/#/play/k-structure-pattern-path?autoplay=1&instant=1');
  // 宿主要在落盘后才发 level:complete，等到它就说明存档与徽章都就位了
  expect(await waitEvent(page, 'level:complete:k-structure-pattern-path')).toBe(true);

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
  // 成人门走键盘长按：既去掉 3300ms 硬等待，又覆盖"长按的键盘替代"路径
  const hold = page.getByTestId('adult-hold');
  await hold.focus();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('report-view')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up('Space');
  await expect(page.getByText('All data stays on this device')).toBeVisible();
});
