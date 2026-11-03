import type { LevelManifest } from '@mmf/game-kit';
import { defineArgueLevel } from '@mmf/templates/argue';

const manifest: LevelManifest = {
  id: 'g46-data-invariant',
  band: 'g46',
  thread: 'data',
  template: 'argue',
  designSize: { width: 0, height: 0 },
  // 与 levels/g46-data-invariant.json 的 estimatedMinutes 对齐。
  estimatedMinutes: 8,
  hasCanvas: false,
};

export default defineArgueLevel(manifest);
