import type { LevelManifest } from '@mmf/game-kit';
import { defineArgueLevel } from '@mmf/templates/argue';

const manifest: LevelManifest = {
  id: 'g1012-structure-invariant',
  band: 'g1012',
  thread: 'structure',
  template: 'argue',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 10,
  hasCanvas: false,
  runEnabled: false,
};

export default defineArgueLevel(manifest);
