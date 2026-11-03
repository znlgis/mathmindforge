import type { LevelManifest } from '@mmf/game-kit';
import { defineRuleLevel } from '@mmf/templates/rule';

const manifest: LevelManifest = {
  id: 'k-algorithm-train',
  band: 'k',
  thread: 'algorithm',
  template: 'rule',
  designSize: { width: 720, height: 720 },
  estimatedMinutes: 6,
  hasCanvas: true,
  runEnabled: true,
};

export default defineRuleLevel(manifest);
