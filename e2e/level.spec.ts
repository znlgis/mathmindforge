import { expect, test } from '@playwright/test';
import { events, saveSnapshot, waitEvent } from './shared';

const LEVEL_ID = 'k-structure-pattern-path';

test('工坊首页可以进入首关', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-start')).toBeVisible();
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('level-card-' + LEVEL_ID)).toBeVisible();
  await page.getByTestId('level-enter-' + LEVEL_ID).click();
  await expect(page.getByTestId('workshop-view')).toBeVisible();
  await expect(page.getByTestId('level-canvas')).toBeVisible();
});

test('autoplay 通关并写入存档', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID + '?autoplay=1&instant=1');
  expect(await waitEvent(page, 'level:complete:' + LEVEL_ID)).toBe(true);
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
  const names = await events(page);
  expect(names).toContain('level:complete:' + LEVEL_ID);
});

test('没有使用工具时提交会被拒绝', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-dock')).toBeVisible();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('failure-banner')).toBeVisible();
  const save = await saveSnapshot(page);
  expect(save?.levels?.[LEVEL_ID]?.completed ?? false).toBe(false);
});

test('真实点击工具台可以通关（不靠 autoplay）', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('pattern-tool')).toBeVisible();

  // 观察两格，满足 observe 检查点
  await page.getByTestId('pattern-inspect-0').click();
  await page.getByTestId('pattern-inspect-1').click();

  // 拼出 ABB 的重复单元并提交
  await page.getByTestId('pattern-token-A').click();
  await page.getByTestId('pattern-token-B').click();
  await page.getByTestId('pattern-token-B').click();
  await page.getByTestId('pattern-commit').click();
  await expect(page.getByTestId('pattern-committed')).toBeVisible();

  // 给三个缺口分别放 A / B / B
  for (const [slot, token] of [[6, 'A'], [7, 'B'], [8, 'B']] as const) {
    await page.getByTestId('construct-slot-' + slot).click();
    await page.getByTestId('construct-place-' + token).click();
  }

  await page.getByTestId('level-run').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
});

test('运行时不发外网请求，断网后工具仍可操作', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(request.url());
  });

  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('pattern-tool')).toBeVisible();
  await context.setOffline(true);
  await page.getByTestId('pattern-inspect-0').click();
  await expect(page.getByText('已经观察 1 格')).toBeVisible();
  await context.setOffline(false);
  expect(external).toEqual([]);
});

test('刷新后完成状态仍在', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID + '?autoplay=1&instant=1');
  expect(await waitEvent(page, 'level:complete:' + LEVEL_ID)).toBe(true);
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
  await page.reload();
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
});
