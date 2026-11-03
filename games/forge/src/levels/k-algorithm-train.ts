import type { LevelManifest } from '@mmf/game-kit';
import { defineRuleLevel } from '@mmf/templates/rule';

const manifest: LevelManifest = {
  id: 'k-algorithm-train',
  band: 'k',
  thread: 'algorithm',
  template: 'rule',
  designSize: { width: 720, height: 720 },
  // 与 levels/k-algorithm-train.json 的 estimatedMinutes 对齐（星图卡片显示的是内容值）。
  estimatedMinutes: 5,
  hasCanvas: true,
};

export default defineRuleLevel(manifest);
