import { expect, test } from '@playwright/test';
import { clickCanvasCell, clickRuleCell, interactions, startInteractionMeter } from './shared';

/**
 * 交互次数预算（docs/12 §4 / §7-3）。
 *
 * 目的：把"每关最少几次点击"钉成门禁，防止以后又长回仪式步骤或死按钮。
 * 口径：Playwright 真实派发的 click + change 事件（fill/selectOption 都会触发 change）。
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
    target: 6,
    async run(page) {
      await page.getByTestId('pattern-candidate-ABB-none').click();
      await clickCanvasCell(page, 6);
      await clickCanvasCell(page, 7);
      await clickCanvasCell(page, 8);
    },
  },
  {
    id: 'g13-structure-symmetry',
    target: 8,
    async run(page) {
      await page.getByTestId('pattern-candidate-ABC-reflect').click();
      await clickCanvasCell(page, 3);
      await clickCanvasCell(page, 4);
      await clickCanvasCell(page, 5);
    },
  },
  {
    id: 'k-algorithm-train',
    target: 7,
    async run(page) {
      for (const block of ['forward', 'forward', 'collect', 'forward', 'forward']) {
        await page.getByTestId('rule-add-' + block).click();
      }
    },
  },
  {
    id: 'k-modeling-share',
    target: 6,
    async run(page) {
      await page.getByTestId('dist-plus-0-cookie').click();
      await page.getByTestId('dist-plus-0-cookie').click();
      await page.getByTestId('dist-plus-0-apple').click();
      await page.getByTestId('dist-copy-first').click();
    },
  },
  {
    id: 'g79-structure-network',
    target: 6,
    async run(page) {
      for (const edge of ['ab', 'bc', 'bd', 'ce']) {
        await page.getByTestId('network-edge-' + edge).click();
      }
    },
  },
  {
    id: 'g79-algorithm-schedule',
    target: 6,
    async run(page) {
      for (const [lesson, slot] of [['l1', 's1'], ['l2', 's2'], ['l3', 's2'], ['l4', 's3']] as const) {
        await page.getByTestId('schedule-cell-' + lesson + '-' + slot).click();
      }
    },
  },
  {
    id: 'g1012-algorithm-frontier',
    target: 3,
    async run(page) {
      await page.getByTestId('frontier-plus-at').click();
    },
  },
  {
    id: 'k-data-tally',
    // 3 次点击（倒出 + 选答案 + 完成）+ 4 次数字框输入 = 7 次交互，上限 8
    target: 7,
    async run(page) {
      await page.getByTestId('tally-dump').click();
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
    target: 4,
    async run(page) {
      await page.getByTestId('sampling-two-batches').click();
      await page.getByTestId('sampling-claim').click();
    },
  },
  {
    id: 'g1012-data-inference',
    target: 3,
    async run(page) {
      await page.getByTestId('inference-a-higher').click();
    },
  },
  {
    id: 'g1012-structure-invariant',
    target: 4,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
  {
    id: 'g13-modeling-pack',
    target: 6,
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
    target: 11,
    async run(page) {
      await page.getByTestId('payment-add-3').click();
      await page.getByTestId('payment-add-3').click();
      await page.getByTestId('tool-card-toggle-counter-1').click();
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
    target: 8,
    async run(page) {
      await page.getByTestId('tally-dump').click();
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
    target: 7,
    async run(page) {
      // 3 个数字框填 50/50/0，再跑满 1000 局并下结论
      for (const [key, value] of [['attack', '50'], ['defense', '50'], ['economy', '0']] as const) {
        const input = page.getByTestId('knob-' + key);
        await input.fill(value);
        await input.blur();
      }
      await page.getByTestId('knob-run').click();
      // 结论按钮在第二张卡（数据采集器）里，先展开再点——这是 1 次真实交互
      await page.getByTestId('tool-card-toggle-probe-1').click();
      await page.getByTestId('sample-claim').click();
    },
  },
  {
    id: 'g46-modeling-queue',
    target: 5,
    async run(page) {
      const serviceTime = page.getByTestId('knob-serviceTime');
      await serviceTime.fill('2');
      await serviceTime.blur();
      await page.getByTestId('knob-run').click();
    },
  },
  {
    id: 'g79-modeling-dispatch',
    target: 5,
    async run(page) {
      const vehicles = page.getByTestId('knob-vehicles');
      await vehicles.fill('3');
      await vehicles.blur();
      await page.getByTestId('knob-run').click();
    },
  },
  {
    id: 'g13-algorithm-route',
    // 画布点格画路线：5 次点格（引擎编译成展开版程序）+ 完成 = 6 击（docs/12 §4）
    target: 6,
    async run(page) {
      for (const [x, y] of [[2, 0], [4, 0], [4, 2], [4, 4], [0, 4]] as const) {
        await clickRuleCell(page, x, y);
      }
    },
  },
  {
    id: 'g46-data-invariant',
    target: 5,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
  {
    id: 'g46-structure-tiling',
    target: 5,
    async run(page) {
      await page.getByTestId('argue-warrant-coloring').click();
    },
  },
];

for (const budget of BUDGETS) {
  test('交互预算：' + budget.id + ' ≤ ' + (budget.target + 1), async ({ page }) => {
    await page.goto('/#/play/' + budget.id);
    await expect(page.getByTestId('level-submit')).toBeVisible();
    await startInteractionMeter(page);
    await budget.run(page);
    await page.getByTestId('level-submit').click();
    await expect(page.getByTestId('completion-panel')).toBeVisible();
    const used = await interactions(page);
    // 打通这一关用掉的真实交互次数（含最后一次「完成」）
    expect(used, budget.id + ' 用了 ' + used + ' 次交互').toBeLessThanOrEqual(budget.target + 1);
  });
}