import { expect, test } from '@playwright/test';
import { clickCanvasCell, clickRuleCell, interactions, startInteractionMeter, waitAdvance } from './shared';

/**
 * 交互次数预算（docs/12 §4 / §7-3，docs/13 自动判题后重算，本轮去卡片化后再次压缩）。
 *
 * 目的：把"每关最少几次点击"钉成门禁，防止以后又长回仪式步骤或死按钮。
 * 口径：Playwright 真实派发的 click + change 事件（fill/selectOption 都会触发 change）。
 * 自动判题之后不再有「完成」这一击；工具卡外壳去掉之后，也没有"展开卡片"这一击。
 * 余量：目标值 +1，容纳音效/焦点等实现差异；超出即说明交互退化。
 */

interface Budget {
  id: string;
  target: number;
  run: (page: import('@playwright/test').Page) => Promise<void>;
}

const BUDGETS: Budget[] = [
  {
    id: 'k-structure-pattern-path',
    target: 3,
    async run(page) {
      // 画布点三个空格；规律由填法自动反推，没有"先点候选规律"这一步
      await clickCanvasCell(page, 6);
      await clickCanvasCell(page, 7);
      await clickCanvasCell(page, 8);
    },
  },
  {
    id: 'g13-structure-symmetry',
    target: 3,
    async run(page) {
      await clickCanvasCell(page, 3);
      await clickCanvasCell(page, 4);
      await clickCanvasCell(page, 5);
    },
  },
  {
    id: 'k-algorithm-train',
    target: 2,
    async run(page) {
      // 画布是唯一作答面：点星星格（自动收集）→ 点终点格
      await clickRuleCell(page, 2, 0);
      await clickRuleCell(page, 4, 0);
    },
  },
  {
    id: 'k-modeling-share',
    target: 4,
    async run(page) {
      await page.getByTestId('dist-plus-0-cookie').click();
      await page.getByTestId('dist-plus-0-cookie').click();
      await page.getByTestId('dist-plus-0-apple').click();
      await page.getByTestId('dist-copy-first').click();
    },
  },
  {
    id: 'g79-structure-network',
    target: 4,
    async run(page) {
      for (const edge of ['ab', 'bc', 'bd', 'ce']) {
        await page.getByTestId('network-edge-' + edge).click();
      }
    },
  },
  {
    id: 'g79-algorithm-schedule',
    target: 4,
    async run(page) {
      for (const [lesson, slot] of [['l1', 's1'], ['l2', 's2'], ['l3', 's2'], ['l4', 's3']] as const) {
        await page.getByTestId('schedule-cell-' + lesson + '-' + slot).click();
      }
    },
  },
  {
    id: 'g1012-algorithm-frontier',
    target: 1,
    async run(page) {
      await page.getByTestId('frontier-plus-at').click();
    },
  },
  {
    id: 'k-data-tally',
    // 面板平铺后自动倒出；4 次数字框输入 + 1 次结论 chip = 5
    target: 5,
    async run(page) {
      for (const [id, count] of [['circle', '6'], ['square', '5'], ['triangle', '6'], ['star', '3']] as const) {
        const input = page.getByTestId('tally-input-' + id);
        await input.fill(count);
        await input.blur();
      }
      await page.getByTestId('tally-claim-most-circle').click();
    },
  },
  {
    id: 'g79-data-sampling',
    target: 1,
    async run(page) {
      // 面板平铺后自动抽两批，只点一次结论
      await page.getByTestId('sampling-claim').click();
    },
  },
  {
    id: 'g1012-data-inference',
    target: 1,
    async run(page) {
      await page.getByTestId('inference-a-higher').click();
    },
  },
  {
    id: 'g1012-structure-invariant',
    target: 1,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
  {
    id: 'g13-modeling-pack',
    target: 4,
    async run(page) {
      // 每盒三类各一件的黄金解：先配第一个盒子，再一键照分
      await page.getByTestId('dist-plus-0-block').click();
      await page.getByTestId('dist-plus-0-ball').click();
      await page.getByTestId('dist-plus-0-book').click();
      await page.getByTestId('dist-copy-first').click();
    },
  },
  {
    id: 'g46-algorithm-payment',
    // 2 枚硬币 + 填目标金额 + 3 个面额复选 + 点前提 = 8 次真实操作；
    // 面额是 checkbox，click 之后浏览器还会派发一次 change，计量器各记一次 → 记 10。
    target: 9,
    async run(page) {
      await page.getByTestId('payment-add-3').click();
      await page.getByTestId('payment-add-3').click();
      const target = page.getByTestId('counter-target');
      await target.fill('10');
      await target.blur();
      for (const denom of ['1', '3', '4']) {
        await page.getByTestId('counter-denom-' + denom).click();
      }
      await page.getByTestId('counter-premise-greedy-optimal').click();
    },
  },
  {
    id: 'g13-data-weather',
    target: 5,
    async run(page) {
      for (const [id, count] of [['sunny', '5'], ['cloudy', '4'], ['rainy', '3'], ['snowy', '2']] as const) {
        const input = page.getByTestId('tally-input-' + id);
        await input.fill(count);
        await input.blur();
      }
      await page.getByTestId('tally-claim-most-sunny').click();
    },
  },
  {
    id: 'g1012-modeling-winrate',
    target: 4,
    async run(page) {
      // 3 个数字框填 50/50/0（凑满就自动跑出采样结果），再点结论
      for (const [key, value] of [['attack', '50'], ['defense', '50'], ['economy', '0']] as const) {
        const input = page.getByTestId('knob-' + key);
        await input.fill(value);
        await input.blur();
      }
      await page.getByTestId('sample-claim').click();
    },
  },
  {
    id: 'g46-modeling-queue',
    target: 1,
    async run(page) {
      const serviceTime = page.getByTestId('knob-serviceTime');
      await serviceTime.fill('2');
      await serviceTime.blur();
    },
  },
  {
    id: 'g79-modeling-dispatch',
    target: 1,
    async run(page) {
      const vehicles = page.getByTestId('knob-vehicles');
      await vehicles.fill('3');
      await vehicles.blur();
    },
  },
  {
    id: 'g13-algorithm-route',
    // 画布点格画路线：5 次点格就是全部答案输入（没有「完成」）
    target: 5,
    async run(page) {
      for (const [x, y] of [[2, 0], [4, 0], [4, 2], [4, 4], [0, 4]] as const) {
        await clickRuleCell(page, x, y);
      }
    },
  },
  {
    id: 'g46-data-invariant',
    target: 1,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
  {
    id: 'g46-structure-tiling',
    target: 1,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
];

for (const budget of BUDGETS) {
  test('交互预算：' + budget.id + ' ≤ ' + (budget.target + 1), async ({ page }) => {
    await page.goto('/#/play/' + budget.id);
    await expect(page.getByTestId('level-auto-judge')).toBeVisible();
    await startInteractionMeter(page);
    await budget.run(page);
    // 没有「完成」这一击：答案填完宿主自动判题、答对自动进下一关
    expect(await waitAdvance(page, budget.id)).toBe(true);
    const used = await interactions(page);
    expect(used, budget.id + ' 用了 ' + used + ' 次交互').toBeLessThanOrEqual(budget.target + 1);
  });
}
