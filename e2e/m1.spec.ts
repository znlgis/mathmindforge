import { expect, test } from '@playwright/test';
import { SHIPPED_LEVEL_IDS } from '../packages/content/src/ids';
import { openTool, saveSnapshot, waitEvent } from './shared';

const M1_LEVELS = SHIPPED_LEVEL_IDS.filter((id) => id !== 'k-structure-pattern-path');

for (const levelId of M1_LEVELS) {
  test('M1 autoplay：' + levelId, async ({ page }) => {
    await page.goto('/#/play/' + levelId + '?autoplay=1&instant=1');
    expect(await waitEvent(page, 'level:complete:' + levelId, 30_000)).toBe(true);
    await expect.poll(async () => {
      const save = await saveSnapshot(page);
      return save?.levels?.[levelId]?.completed === true;
    }, { timeout: 20_000 }).toBe(true);
  });

  test('M1 无工具提交被拒：' + levelId, async ({ page }) => {
    await page.goto('/#/play/' + levelId);
    await expect(page.getByTestId('level-dock')).toBeVisible();
    await page.getByTestId('level-submit').click();
    await expect(page.getByTestId('failure-banner')).toBeVisible();
    const save = await saveSnapshot(page);
    expect(save?.levels?.[levelId]?.completed ?? false).toBe(false);
  });
}

test('真实点击：最少枚数支付 + 反例可以通关', async ({ page }) => {
  await page.goto('/#/play/g46-algorithm-payment');
  await expect(page.getByTestId('payment-tool')).toBeVisible();

  await page.getByTestId('payment-add-3').click();
  await page.getByTestId('payment-add-3').click();
  await expect(page.getByTestId('payment-total')).toContainText('2 枚');

  await openTool(page, 'counter', 1);
  await page.getByTestId('counter-target').fill('10');
  await page.getByTestId('counter-target').blur();
  await page.getByTestId('counter-denom-1').click();
  await page.getByTestId('counter-denom-3').click();
  await page.getByTestId('counter-denom-4').click();
  await page.getByTestId('counter-test').click();
  await expect(page.getByTestId('counter-result')).toContainText('贪心不是最优');
  await page.getByTestId('counter-premise').selectOption('greedy-optimal');
  await page.getByTestId('counter-commit').click();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：分类小站采样、记录、下结论可以通关', async ({ page }) => {
  await page.goto('/#/play/k-data-tally');
  await expect(page.getByTestId('tally-tool')).toBeVisible();

  for (let i = 0; i < 4; i += 1) {
    await page.getByTestId('tally-sample').click();
  }
  await expect(page.getByTestId('tally-count')).toHaveText('20');

  for (const [id, count] of [['circle', 6], ['square', 5], ['triangle', 6], ['star', 3]] as const) {
    for (let i = 0; i < count; i += 1) {
      await page.getByTestId('tally-plus-' + id).click();
    }
  }

  await page.getByTestId('tally-claim-most').click();
  await page.getByTestId('tally-category-circle').click();
  await page.getByTestId('tally-claim-submit').click();
  await expect(page.getByTestId('tally-claim-ready')).toBeVisible();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：结构不变量论证可以通关', async ({ page }) => {
  await page.goto('/#/play/g1012-structure-invariant');
  await expect(page.getByTestId('domino-tool')).toBeVisible();

  // 先真的铺一块，满足 attempt 检查点
  await page.getByTestId('domino-cell-0-1').click();
  await page.getByTestId('domino-cell-0-2').click();

  await openTool(page, 'probe', 1);
  await page.getByTestId('invariant-sample').click();
  await expect(page.getByTestId('invariant-counts')).toContainText('11');

  await expect(page.getByTestId('argument-board')).toBeVisible();
  await page.getByTestId('argue-claim').selectOption('impossible');
  await page.getByTestId('argue-warrant').selectOption('coloring');
  await page.getByTestId('argue-attach').click();
  await page.getByTestId('argue-scope').selectOption('domino-tiling');
  await page.getByTestId('argue-commit').click();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：公平分点心可以通关', async ({ page }) => {
  await page.goto('/#/play/k-modeling-share');
  await expect(page.getByTestId('distribute-tool')).toBeVisible();

  for (const container of [0, 1, 2, 3]) {
    await page.getByTestId('dist-plus-' + container + '-cookie').click();
    await page.getByTestId('dist-plus-' + container + '-cookie').click();
    await page.getByTestId('dist-plus-' + container + '-apple').click();
  }

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：规则小火车可以通关', async ({ page }) => {
  await page.goto('/#/play/k-algorithm-train');
  await expect(page.getByTestId('rule-tool')).toBeVisible();

  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-collect').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-commit').click();
  await page.getByTestId('level-run').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：对称补墙可以通关', async ({ page }) => {
  await page.goto('/#/play/g13-structure-symmetry');
  await expect(page.getByTestId('pattern-tool')).toBeVisible();

  await page.getByTestId('pattern-inspect-0').click();
  await page.getByTestId('pattern-inspect-1').click();
  await page.getByTestId('pattern-token-A').click();
  await page.getByTestId('pattern-token-B').click();
  await page.getByTestId('pattern-token-C').click();
  await page.getByTestId('pattern-transform').selectOption('reflect');
  await page.getByTestId('pattern-commit').click();

  await openTool(page, 'construct', 1);
  for (const [slot, token] of [[3, 'C'], [4, 'B'], [5, 'A']] as const) {
    await page.getByTestId('construct-slot-' + slot).click();
    await page.getByTestId('construct-place-' + token).click();
  }

  await page.getByTestId('level-run').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('完成面板显示变体通行证', async ({ page }) => {
  await page.goto('/#/play/g13-algorithm-route?autoplay=1');
  await expect(page.getByTestId('completion-panel')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('variant-passport')).toBeVisible();
  await expect(page.getByTestId('variant-passport')).toContainText('v-rotate-90');
  await expect(page.getByTestId('variant-passport')).toContainText('通过');
});

test('真实点击：抽样调查员可以通关', async ({ page }) => {
  await page.goto('/#/play/g79-data-sampling');
  await expect(page.getByTestId('sampling-tool')).toBeVisible();

  await page.getByTestId('sampling-sample-20').click();
  await page.getByTestId('sampling-sample-20').click();
  await expect(page.getByTestId('sampling-count')).toContainText('40');
  await expect(page.getByTestId('sampling-ci')).toBeVisible();

  await page.getByTestId('sampling-claim').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：路网规划师可以通关', async ({ page }) => {
  await page.goto('/#/play/g79-structure-network');
  await expect(page.getByTestId('network-tool')).toBeVisible();

  for (const edge of ['ab', 'bc', 'bd', 'ce']) {
    await page.getByTestId('network-edge-' + edge).click();
  }
  await expect(page.getByTestId('network-cost')).toContainText('6');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：证据裁判可以通关', async ({ page }) => {
  await page.goto('/#/play/g1012-data-inference');
  await expect(page.getByTestId('inference-tool')).toBeVisible();
  await page.getByTestId('inference-focus').click();
  await page.getByTestId('inference-a-higher').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：课表编排师可以通关', async ({ page }) => {
  await page.goto('/#/play/g79-algorithm-schedule');
  await expect(page.getByTestId('schedule-tool')).toBeVisible();

  await page.getByTestId('schedule-select-l1').selectOption('s1');
  await page.getByTestId('schedule-select-l2').selectOption('s2');
  await page.getByTestId('schedule-select-l3').selectOption('s2');
  await page.getByTestId('schedule-select-l4').selectOption('s3');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：贪心边界可以通关', async ({ page }) => {
  await page.goto('/#/play/g1012-algorithm-frontier');
  await expect(page.getByTestId('frontier-tool')).toBeVisible();

  await page.getByTestId('frontier-cost-sa').selectOption('1');
  await page.getByTestId('frontier-cost-sb').selectOption('2');
  await page.getByTestId('frontier-cost-at').selectOption('9');
  await page.getByTestId('frontier-cost-bt').selectOption('1');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});
