import type { LevelManifest } from '@mmf/game-kit';
import { defineSimulateLevel } from '@mmf/templates/simulate';

const manifest: LevelManifest = {
  id: 'g79-modeling-dispatch',
  band: 'g79',
  thread: 'modeling',
  template: 'simulate',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 10,
  hasCanvas: false,
  // 丘验/模拟关由工具按钮运行，宿主隐藏大「运行」。
};

export default defineSimulateLevel(manifest);
