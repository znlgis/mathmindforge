import { expect, test } from '@playwright/test';
import { SHIPPED_LEVEL_IDS } from '../packages/content/src/ids';
import { clickCanvasCell, openTool, saveSnapshot, waitEvent } from './shared';

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

  // 反例卡：填目标金额 + 勾面额 + 点失效前提 chip（编辑即自动测试，没有"测试/提交"按钮）
  await openTool(page, 'counter', 1);
  await page.getByTestId('counter-target').fill('10');
  await page.getByTestId('counter-target').blur();
  await page.getByTestId('counter-denom-1').click();
  await page.getByTestId('counter-denom-3').click();
  await page.getByTestId('counter-denom-4').click();
  await expect(page.getByTestId('counter-live')).toContainText('贪心');
  await page.getByTestId('counter-premise-greedy-optimal').click();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：分类小站一次倒出、填数字、选答案可以通关', async ({ page }) => {
  await page.goto('/#/play/k-data-tally');
  await expect(page.getByTestId('tally-tool')).toBeVisible();

  // 一次倒出整筐（不再连点 4 次采集），然后用 4 个数字框填统计条（不再点 20 次 +1）
  await page.getByTestId('tally-dump').click();
  for (const [id, count] of [['circle', '6'], ['square', '5'], ['triangle', '6'], ['star', '3']] as const) {
    const input = page.getByTestId('tally-input-' + id);
    await input.fill(count);
    await input.blur();
  }
  // 结论是一个 chip：点哪一类最多就是一次作答
  await page.getByTestId('tally-claim-most-circle').click();
  await expect(page.getByTestId('tally-claim-ready')).toBeVisible();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：结构不变量只需点一条依据即可通关', async ({ page }) => {
  await page.goto('/#/play/g1012-structure-invariant');
  await expect(page.getByTestId('argument-board')).toBeVisible();

  // 一行组装：点「黑白染色」= 选依据 + 自动挂证据 + 自动推结论 + 自动填范围
  await page.getByTestId('argue-warrant-coloring').click();
  await expect(page.getByTestId('argue-claim')).toContainText('不可能铺满');
  await expect(page.getByTestId('argue-evidence')).toBeVisible();

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：公平分点心配一盘后一键照分', async ({ page }) => {
  await page.goto('/#/play/k-modeling-share');
  await expect(page.getByTestId('distribute-tool')).toBeVisible();

  await page.getByTestId('dist-plus-0-cookie').click();
  await page.getByTestId('dist-plus-0-cookie').click();
  await page.getByTestId('dist-plus-0-apple').click();
  await page.getByTestId('dist-copy-first').click();
  await expect(page.getByTestId('dist-container-3')).toContainText('3 / 4');

  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：规则小火车拼好后直接完成', async ({ page }) => {
  await page.goto('/#/play/k-algorithm-train');
  await expect(page.getByTestId('rule-tool')).toBeVisible();

  // 没有"提交程序"按钮了：程序拼好就是答案
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-collect').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('rule-add-forward').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：对称补墙在画布上点三格', async ({ page }) => {
  await page.goto('/#/play/g13-structure-symmetry');
  await expect(page.getByTestId('pattern-tool')).toBeVisible();

  // 点候选 chip 一次＝声明规律；之后画布缺口各点一次直接落答案
  await page.getByTestId('pattern-candidate-ABC-reflect').click();
  await expect(page.getByTestId('pattern-committed')).toBeVisible();
  await clickCanvasCell(page, 3);
  await clickCanvasCell(page, 4);
  await clickCanvasCell(page, 5);
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('完成面板显示变体通行证（换表征迁移门）', async ({ page }) => {
  // pattern 关现在有真的换表征迁移门：A/B 换成形状之后规律仍要成立（docs/12 遗留项 1）
  await page.goto('/#/play/k-structure-pattern-path?autoplay=1');
  await expect(page.getByTestId('completion-panel')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('variant-passport')).toBeVisible();
  await expect(page.getByTestId('variant-passport')).toContainText('v-relabel-shapes');
  await expect(page.getByTestId('variant-passport')).toContainText('通过');
});

test('真实点击：抽样调查员一次抽两批', async ({ page }) => {
  await page.goto('/#/play/g79-data-sampling');
  await expect(page.getByTestId('sampling-tool')).toBeVisible();

  await page.getByTestId('sampling-two-batches').click();
  await expect(page.getByTestId('sampling-count')).toContainText('40');
  await expect(page.getByTestId('sampling-batch-2')).toBeVisible();
  await expect(page.getByTestId('sampling-ci')).toBeVisible();
  await page.getByTestId('sampling-claim').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：路网规划师在图上点四条边', async ({ page }) => {
  await page.goto('/#/play/g79-structure-network');
  await expect(page.getByTestId('network-tool')).toBeVisible();

  for (const edge of ['ab', 'bc', 'bd', 'ce']) {
    await page.getByTestId('network-edge-' + edge).click();
  }
  await expect(page.getByTestId('network-cost')).toContainText('6');
  await expect(page.getByTestId('network-components')).toContainText('1');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：证据裁判点一个结论', async ({ page }) => {
  await page.goto('/#/play/g1012-data-inference');
  await expect(page.getByTestId('inference-tool')).toBeVisible();

  await page.getByTestId('inference-a-higher').click();
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：课表编排师点四个格子', async ({ page }) => {
  await page.goto('/#/play/g79-algorithm-schedule');
  await expect(page.getByTestId('schedule-tool')).toBeVisible();

  for (const [lesson, slot] of [['l1', 's1'], ['l2', 's2'], ['l3', 's2'], ['l4', 's3']] as const) {
    await page.getByTestId('schedule-cell-' + lesson + '-' + slot).click();
  }
  await expect(page.getByTestId('schedule-bonus')).toContainText('2');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});

test('真实点击：贪心边界点一下边权', async ({ page }) => {
  await page.goto('/#/play/g1012-algorithm-frontier');
  await expect(page.getByTestId('frontier-tool')).toBeVisible();

  // 默认全 5；把「甲→终点」那条边加一格，贪心就不再最优
  await page.getByTestId('frontier-plus-at').click();
  await expect(page.getByTestId('frontier-live')).toContainText('贪心');
  await page.getByTestId('level-submit').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
});