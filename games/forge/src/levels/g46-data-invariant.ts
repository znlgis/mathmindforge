import type { LevelManifest } from '@mmf/game-kit';
import { defineArgueLevel } from '@mmf/templates/argue';

const manifest: LevelManifest = {
  id: 'g46-data-invariant',
  band: 'g46',
  thread: 'data',
  template: 'argue',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 6,
  hasCanvas: false,
  runEnabled: false,
};

export default defineArgueLevel(manifest);
