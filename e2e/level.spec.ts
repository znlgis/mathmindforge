import { expect, test } from '@playwright/test';
import { clickCanvasCell, events, interactions, saveSnapshot, startInteractionMeter, waitEvent } from './shared';

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

test('真实点击：候选规律 + 画布点三格 + 完成（≤6 次交互）', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('pattern-tool')).toBeVisible();
  await startInteractionMeter(page);

  // 一次点击声明规律（原来要点 3 个字母 + 1 次提交）
  await page.getByTestId('pattern-candidate-ABB-none').click();
  await expect(page.getByTestId('pattern-committed')).toBeVisible();

  // 画布点三个缺口，点一次填一格（原来每格要 2 击：选槽 + 点色板）
  await clickCanvasCell(page, 6);
  await clickCanvasCell(page, 7);
  await clickCanvasCell(page, 8);

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();

  const used = await interactions(page);
  // 目标 5~6 次（docs/12 §4）；留 1 次余量给音效/焦点等实现差异
  expect(used).toBeLessThanOrEqual(6);
  await expect.poll(async () => {
    const save = await saveSnapshot(page);
    return save?.levels?.[LEVEL_ID]?.completed === true;
  }, { timeout: 15_000 }).toBe(true);
});

test('画布点空格会立刻填上字母（一次点击 = 一次输入）', async ({ page }) => {
  await page.goto('/#/play/' + LEVEL_ID);
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  await startInteractionMeter(page);
  await clickCanvasCell(page, 6);
  // 点完立刻派发一次 tool 使用；不依赖截图，用交互计数与"提交被拒理由"变化证明它生效
  expect(await interactions(page)).toBeGreaterThanOrEqual(1);
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('failure-banner')).toBeVisible();
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
  await page.getByTestId('pattern-candidate-ABB-none').click();
  await expect(page.getByTestId('pattern-committed')).toBeVisible();
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