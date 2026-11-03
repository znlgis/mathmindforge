import type { LevelManifest } from '@mmf/game-kit';
import { defineConstructLevel } from '@mmf/templates/construct';

const manifest: LevelManifest = {
  id: 'g1012-algorithm-frontier',
  band: 'g1012',
  thread: 'algorithm',
  template: 'construct',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 8,
  hasCanvas: false,
};

export default defineConstructLevel(manifest);