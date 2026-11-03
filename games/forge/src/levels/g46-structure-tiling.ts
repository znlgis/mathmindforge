import type { LevelManifest } from '@mmf/game-kit';
import { defineArgueLevel } from '@mmf/templates/argue';

const manifest: LevelManifest = {
  id: 'g46-structure-tiling',
  band: 'g46',
  thread: 'structure',
  template: 'argue',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 8,
  hasCanvas: false,
  runEnabled: false,
};

export default defineArgueLevel(manifest);
