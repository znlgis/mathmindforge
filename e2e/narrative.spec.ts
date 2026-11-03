import { expect, test } from '@playwright/test';
import { waitEvent } from './shared';

test('完成两关后日志、徽章与报告可用', async ({ page }) => {
  await page.goto('/#/play/k-structure-pattern-path?autoplay=1&instant=1');
  expect(await waitEvent(page, 'level:complete:k-structure-pattern-path')).toBe(true);

  const second = await page.context().newPage();
  await second.goto('/#/play/g46-algorithm-payment?autoplay=1&instant=1');
  expect(await waitEvent(second, 'level:complete:g46-algorithm-payment')).toBe(true);
  await second.close();
  // 第二个页面写入了 IndexedDB；原页面 Pinia 快照还是旧的，刷新重新读档。
  await page.reload();

  await page.goto('/#/journal');
  await expect(page.getByTestId('journal-view')).toBeVisible();
  await expect(page.getByTestId('journal-entry').first()).toBeVisible();

  await page.goto('/#/badges');
  await expect(page.getByTestId('badges-view')).toBeVisible();
  await expect(page.getByTestId('badge-pattern-spotter')).toBeVisible();
  await expect(page.getByTestId('badge-earned-pattern-spotter')).toBeVisible();
  await expect(page.getByTestId('badge-earned-builder')).toBeVisible();

  await page.goto('/#/report');
  await expect(page.getByTestId('adult-gate')).toBeVisible();
  // 成人门走键盘长按：既去掉 3300ms 硬等待，又覆盖"长按的键盘替代"路径
  const hold = page.getByTestId('adult-hold');
  await hold.focus();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('report-view')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up('Space');
  await expect(page.getByText('数据只在本机')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mmf-report.json');

  // 再把这个证据包只读导入，验证"教师/家长拿到文件也能看"。
  const filePath = await download.path();
  if (!filePath) throw new Error('download 没有落在临时路径');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('report-import').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
  await expect(page.getByTestId('report-imported')).toBeVisible();
  await expect(page.getByTestId('report-imported')).toContainText('只读');
});
