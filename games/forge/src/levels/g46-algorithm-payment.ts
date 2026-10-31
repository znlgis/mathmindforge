import type { LevelManifest } from '@mmf/game-kit';
import { defineConstructLevel } from '@mmf/templates/construct';

/**
 * 最少枚数支付：construct（mode payment）+ counter（mode payment）。
 * 没有画布：收款台、面额盘、反例对比都住在 ToolDock 里，宿主要隐藏"运行"。
 */
const manifest: LevelManifest = {
  id: 'g46-algorithm-payment',
  band: 'g46',
  thread: 'algorithm',
  template: 'construct',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 8,
  hasCanvas: false,
  runEnabled: false,
};

export default defineConstructLevel(manifest);
