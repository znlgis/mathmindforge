import { expect, test } from '@playwright/test';
import { clickCanvasCell, events, interactions, saveSnapshot, startInteractionMeter, waitAdvance, waitEvent } from './shared';

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

test('宿主没有「完成」按钮：填完自动判题', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-auto-judge')).toBeVisible();
  await expect(page.getByTestId('level-submit')).toHaveCount(0);
});

test('关卡里没有工具卡：模式关只留画布 + 动作条', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  // 旧的「模式卡 / 构造块 / 规则卡」卡片已经整层移除
  await expect(page.getByTestId('tool-card')).toHaveCount(0);
  await expect(page.getByTestId('pattern-tool')).toHaveCount(0);
  await expect(page.getByTestId('level-dock')).toHaveCount(0);
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

test('没作答时不会自动判题，也不会过关', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-auto-judge')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('level-success')).toHaveCount(0);
  await expect(page.getByTestId('failure-banner')).toHaveCount(0);
  const save = await saveSnapshot(page);
  expect(save?.levels?.[LEVEL_ID]?.completed ?? false).toBe(false);
});

test('真实点击：画布点三个空格 → 自动判题自动进下一关（≤4 次交互）', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  await startInteractionMeter(page);

  // 没有「先声明规律」这一步：点空格补字母，规律由填法自动反推。
  await clickCanvasCell(page, 6);
  await clickCanvasCell(page, 7);
  await clickCanvasCell(page, 8);

  // 没有「完成」：填完就自动判，答对直接进下一关
  expect(await waitAdvance(page, LEVEL_ID)).toBe(true);

  const used = await interactions(page);
  // 3 次画布点击就是全部答案输入；留 1 次余量
  expect(used).toBeLessThanOrEqual(4);
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
});

test('只补一格（答案没填完）不会判题', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  await clickCanvasCell(page, 6);
  await page.waitForTimeout(1500);
  expect(await waitEvent(page, 'level:complete:' + LEVEL_ID, 300)).toBe(false);
  await expect(page.getByTestId('level-success')).toHaveCount(0);
});

test('运行时不发外网请求，断网后仍可作答', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(request.url());
  });

  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  await context.setOffline(true);
  await clickCanvasCell(page, 6);
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
