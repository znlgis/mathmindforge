import { expect, test } from '@playwright/test';
import { SHIPPED_LEVEL_IDS } from '../packages/content/src/ids';
import { clickCanvasCell, clickRuleCell, saveSnapshot, startInteractionMeter, interactions, waitAdvance, waitEvent } from './shared';

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
}

test('20 关都没有「完成」按钮，只显示自动判题提示', async ({ page }) => {
  for (const levelId of SHIPPED_LEVEL_IDS) {
    await page.goto('/#/play/' + levelId);
    await expect(page.getByTestId('workshop-view')).toBeVisible();
    await expect(page.getByTestId('level-submit')).toHaveCount(0);
    await expect(page.getByTestId('level-auto-judge')).toBeVisible();
    // 本轮简化：玩家看不到任何「工具卡」这一层
    await expect(page.getByTestId('tool-card-toggle-pattern-0')).toHaveCount(0);
    await expect(page.getByTestId('tool-card-toggle-rule-0')).toHaveCount(0);
    await expect(page.getByTestId('tool-card-toggle-construct-0')).toHaveCount(0);
  }
});

test('真实点击：最少枚数支付 + 反例 → 自动判题自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g46-algorithm-payment');
  await expect(page.getByTestId('payment-tool')).toBeVisible();

  await page.getByTestId('payment-add-3').click();
  await page.getByTestId('payment-add-3').click();
  await expect(page.getByTestId('payment-total')).toContainText('2 枚');

  // 反例面板直接平铺在作答区：填目标金额 + 勾面额 + 点失效前提（编辑即自动测试，没有"测试/提交"按钮）
  await page.getByTestId('counter-target').fill('10');
  await page.getByTestId('counter-target').blur();
  await page.getByTestId('counter-denom-1').click();
  await page.getByTestId('counter-denom-3').click();
  await page.getByTestId('counter-denom-4').click();
  await expect(page.getByTestId('counter-live')).toContainText('贪心');
  // 点失效前提就是最后一步答案：点完自动判题
  await page.getByTestId('counter-premise-greedy-optimal').click();

  expect(await waitAdvance(page, 'g46-algorithm-payment')).toBe(true);
});

test('真实点击：分类小站进入即倒出，填数字 + 选答案 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/k-data-tally');
  await expect(page.getByTestId('tally-tool')).toBeVisible();

  // 面板平铺后自动把整筐倒出来（没有"全部倒出来/采集一把"按钮）
  await expect(page.getByTestId('tally-count')).toHaveText('20');
  for (const [id, count] of [['circle', '6'], ['square', '5'], ['triangle', '6'], ['star', '3']] as const) {
    const input = page.getByTestId('tally-input-' + id);
    await input.fill(count);
    await input.blur();
  }
  // 结论是一个 chip：点哪一类最多就是一次作答
  await page.getByTestId('tally-claim-most-circle').click();

  expect(await waitAdvance(page, 'k-data-tally')).toBe(true);
});

test('真实点击：结构不变量只需点一条依据 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g1012-structure-invariant');
  await expect(page.getByTestId('argument-board')).toBeVisible();

  // 论证板是这一关唯一作答面：点「黑白染色」= 自动挂证据 + 自动推结论 + 自动填范围
  await page.getByTestId('argue-warrant-coloring').click();
  await expect(page.getByTestId('argue-claim')).toContainText('不可能铺满');
  await expect(page.getByTestId('argue-evidence')).toBeVisible();

  expect(await waitAdvance(page, 'g1012-structure-invariant')).toBe(true);
});

test('真实点击：公平分点心配一盘后一键照分 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/k-modeling-share');
  await expect(page.getByTestId('distribute-tool')).toBeVisible();

  await page.getByTestId('dist-plus-0-cookie').click();
  await page.getByTestId('dist-plus-0-cookie').click();
  await page.getByTestId('dist-plus-0-apple').click();
  await page.getByTestId('dist-copy-first').click();
  await expect(page.getByTestId('dist-container-3')).toContainText('3 / 4');

  expect(await waitAdvance(page, 'k-modeling-share')).toBe(true);
});

test('真实点击：规则小火车在画布上点两格 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/k-algorithm-train');
  await expect(page.getByTestId('level-canvas')).toBeVisible();

  // 没有积木面板：画布是唯一作答面。点星星格（自动收集）→ 点终点格。
  await clickRuleCell(page, 2, 0);
  await clickRuleCell(page, 4, 0);

  expect(await waitAdvance(page, 'k-algorithm-train')).toBe(true);
});

test('真实点击：对称补墙在画布上点三格 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g13-structure-symmetry');
  await expect(page.getByTestId('level-canvas')).toBeVisible();

  // 没有规律候选卡：点三格补缺口，规律由填法自动反推（先 A/B/C 的重复读法）。
  await clickCanvasCell(page, 3);
  await clickCanvasCell(page, 4);
  await clickCanvasCell(page, 5);

  expect(await waitAdvance(page, 'g13-structure-symmetry')).toBe(true);
});

test('真实点击：规则关在画布上点格子画路线 → 自动进下一关（≤6 击）', async ({ page }) => {
  await page.goto('/#/play/g13-algorithm-route');
  await expect(page.getByTestId('level-canvas')).toBeVisible();
  await startInteractionMeter(page);

  // 起点 (0,0) 朝东：点 5 个拐点，引擎编译成展开版程序（不自动压缩成重复块）
  for (const [x, y] of [[2, 0], [4, 0], [4, 2], [4, 4], [0, 4]] as const) {
    await clickRuleCell(page, x, y);
  }

  expect(await waitAdvance(page, 'g13-algorithm-route')).toBe(true);

  const used = await interactions(page);
  // 5 次点格就是全部答案输入（没有「完成」）
  expect(used).toBeLessThanOrEqual(6);
});

test('过关遮罩记迁移门结果（换表征变体）', async ({ page }) => {
  // pattern 关有真的换表征迁移门：A/B 换成形状之后规律仍要成立
  await page.goto('/#/play/k-structure-pattern-path?autoplay=1');
  await expect(page.getByTestId('level-success')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('variant-passport')).toContainText('v-relabel-shapes');
  await expect(page.getByTestId('variant-passport')).toContainText('✓');
});

test('真实点击：抽样调查员进入即抽两批，点结论 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g79-data-sampling');
  await expect(page.getByTestId('sampling-tool')).toBeVisible();

  // 面板一出现就自动抽两批（没有"抽两批/再抽 N 个"按钮）
  await expect(page.getByTestId('sampling-count')).toContainText('40');
  await expect(page.getByTestId('sampling-batch-2')).toBeVisible();
  await expect(page.getByTestId('sampling-ci')).toBeVisible();
  await page.getByTestId('sampling-claim').click();

  expect(await waitAdvance(page, 'g79-data-sampling')).toBe(true);
});

test('真实点击：路网规划师在图上点四条边 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g79-structure-network');
  await expect(page.getByTestId('network-tool')).toBeVisible();

  for (const edge of ['ab', 'bc', 'bd', 'ce']) {
    await page.getByTestId('network-edge-' + edge).click();
  }
  await expect(page.getByTestId('network-cost')).toContainText('6');
  await expect(page.getByTestId('network-components')).toContainText('1');

  expect(await waitAdvance(page, 'g79-structure-network')).toBe(true);
});

test('真实点击：证据裁判点一个结论 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g1012-data-inference');
  await expect(page.getByTestId('inference-tool')).toBeVisible();

  await page.getByTestId('inference-a-higher').click();

  expect(await waitAdvance(page, 'g1012-data-inference')).toBe(true);
});

test('真实点击：课表编排师点四个格子 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g79-algorithm-schedule');
  await expect(page.getByTestId('schedule-tool')).toBeVisible();

  for (const [lesson, slot] of [['l1', 's1'], ['l2', 's2'], ['l3', 's2'], ['l4', 's3']] as const) {
    await page.getByTestId('schedule-cell-' + lesson + '-' + slot).click();
  }
  await expect(page.getByTestId('schedule-bonus')).toContainText('2');

  expect(await waitAdvance(page, 'g79-algorithm-schedule')).toBe(true);
});

test('真实点击：贪心边界点一下边权 → 自动进下一关', async ({ page }) => {
  await page.goto('/#/play/g1012-algorithm-frontier');
  await expect(page.getByTestId('frontier-tool')).toBeVisible();

  // 默认全 5；把「甲→终点」那条边加一格，贪心就不再最优
  await page.getByTestId('frontier-plus-at').click();
  await expect(page.getByTestId('frontier-live')).toContainText('贪心');

  expect(await waitAdvance(page, 'g1012-algorithm-frontier')).toBe(true);
});

test('真实点击：排队规划师填一个旋钮就自动运行并过关', async ({ page }) => {
  await page.goto('/#/play/g46-modeling-queue');
  await expect(page.getByTestId('knob-tool')).toBeVisible();

  const serviceTime = page.getByTestId('knob-serviceTime');
  await serviceTime.fill('2');
  await serviceTime.blur();

  expect(await waitAdvance(page, 'g46-modeling-queue')).toBe(true);
});

test('真实点击：调度员填一个旋钮就自动运行并过关', async ({ page }) => {
  await page.goto('/#/play/g79-modeling-dispatch');
  await expect(page.getByTestId('knob-tool')).toBeVisible();

  const vehicles = page.getByTestId('knob-vehicles');
  await vehicles.fill('3');
  await vehicles.blur();

  expect(await waitAdvance(page, 'g79-modeling-dispatch')).toBe(true);
});

test('真实点击：胜率实验室填满 100 点 + 下结论就过关', async ({ page }) => {
  await page.goto('/#/play/g1012-modeling-winrate');
  await expect(page.getByTestId('knob-tool')).toBeVisible();

  for (const [key, value] of [['attack', '50'], ['defense', '50'], ['economy', '0']] as const) {
    const input = page.getByTestId('knob-' + key);
    await input.fill(value);
    await input.blur();
  }
  // 参数一凑满 100 点就自动跑出采样结果；结论面板直接平铺在下面
  const claim = page.getByTestId('sample-claim');
  await expect(claim).toBeEnabled();
  await claim.click();

  expect(await waitAdvance(page, 'g1012-modeling-winrate')).toBe(true);
});

/**
 * 错误原因必须"直出"（docs/13 §3）：答错不是一个泛泛的"还差一点"，
 * 而是写明哪条判定没过、下一步该看什么。
 */
test('错误原因直出：tally 统计条填错 → 横幅点名统计条对不上', async ({ page }) => {
  await page.goto('/#/play/k-data-tally');
  await expect(page.getByTestId('tally-tool')).toBeVisible();
  await expect(page.getByTestId('tally-count')).toHaveText('20');
  for (const [id, count] of [['circle', '1'], ['square', '1'], ['triangle', '1'], ['star', '1']] as const) {
    const input = page.getByTestId('tally-input-' + id);
    await input.fill(count);
    await input.blur();
  }
  await page.getByTestId('tally-claim-most-circle').click();
  const banner = page.getByTestId('failure-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('统计条和筐里的图形对不上');
});

test('错误原因直出：network 不连通 → 横幅说还有站点没连进路网', async ({ page }) => {
  await page.goto('/#/play/g79-structure-network');
  await expect(page.getByTestId('network-tool')).toBeVisible();
  // 4 条边（= 站点数 - 1）才会触发自动判题；这一组成本 6 ≤ 预算 9，但 A 站孤立。
  for (const edge of ['bd', 'cd', 'de', 'ce']) {
    await page.getByTestId('network-edge-' + edge).click();
  }
  const banner = page.getByTestId('failure-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('还有站点没有连进路网');
});
