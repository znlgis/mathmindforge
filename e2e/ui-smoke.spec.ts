import { expect, test } from '@playwright/test';

/**
 * UI 冒烟门禁（docs/12 §7-7 / P1-3 遗留项）：
 * **关键动作之后，可见区必须发生变化**。目的是拦住两类问题：
 *   1. "死按钮"——点了屏幕完全不变（历史上 inference/metrics/queue 的"查看区间/指标"就是这样）；
 *   2. "运行完没反馈"——调完参数点运行，指标区还是旧值。
 *
 * 做法：动作前后各取一次面板文本快照，断言两者不同。只看 DOM 文本/属性，
 * 不依赖截图，所以不会因为字体或渲染差异误报。
 */

async function panelSnapshot(page: import('@playwright/test').Page, testId: string): Promise<string> {
  const panel = page.getByTestId(testId);
  await expect(panel).toBeVisible();
  return (await panel.innerText()).replace(/\s+/g, ' ').trim();
}

interface SmokeCase {
  level: string;
  panel: string;
  setup: (page: import('@playwright/test').Page) => Promise<void>;
  label: string;
}

const CASES: SmokeCase[] = [
  {
    level: 'k-modeling-share',
    panel: 'distribute-tool',
    label: '分配盘：点 + 之后计数区必须变',
    setup: async (page) => { await page.getByTestId('dist-plus-0-cookie').click(); },
  },
  {
    level: 'g46-algorithm-payment',
    panel: 'payment-tool',
    label: '硬币台：放一枚硬币后合计必须变',
    setup: async (page) => { await page.getByTestId('payment-add-3').click(); },
  },
  {
    level: 'g79-structure-network',
    panel: 'network-tool',
    label: '路网图：选一条边后成本灯必须变',
    setup: async (page) => { await page.getByTestId('network-edge-ab').click(); },
  },
  {
    level: 'g79-algorithm-schedule',
    panel: 'schedule-tool',
    label: '课表：排一个课次后偏好/冲突灯必须变',
    setup: async (page) => { await page.getByTestId('schedule-cell-l1-s1').click(); },
  },
  {
    level: 'g1012-algorithm-frontier',
    panel: 'frontier-tool',
    label: '边权图：改一条边后贪心/最优必须变',
    setup: async (page) => { await page.getByTestId('frontier-plus-at').click(); },
  },
  {
    level: 'k-data-tally',
    panel: 'tally-tool',
    label: '统计条：倒出后采集区必须变',
    setup: async (page) => { await page.getByTestId('tally-dump').click(); },
  },
  {
    level: 'g79-data-sampling',
    panel: 'sampling-tool',
    label: '抽样：抽两批后累计样本必须变',
    setup: async (page) => { await page.getByTestId('sampling-two-batches').click(); },
  },
  {
    level: 'k-algorithm-train',
    panel: 'rule-tool',
    label: '程序列表：加一块积木后列表必须变',
    setup: async (page) => { await page.getByTestId('rule-add-forward').click(); },
  },
];

for (const smoke of CASES) {
  test('UI 冒烟：' + smoke.label, async ({ page }) => {
    await page.goto('/#/play/' + smoke.level);
    const before = await panelSnapshot(page, smoke.panel);
    await smoke.setup(page);
    await expect.poll(async () => panelSnapshot(page, smoke.panel), {
      timeout: 5_000,
      message: smoke.panel + ' 在关键动作后必须发生变化（死按钮/无反馈）',
    }).not.toBe(before);
  });
}
