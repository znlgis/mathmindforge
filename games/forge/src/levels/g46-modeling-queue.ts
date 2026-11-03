import type { LevelManifest } from '@mmf/game-kit';
import { defineSimulateLevel } from '@mmf/templates/simulate';

const manifest: LevelManifest = {
  id: 'g46-modeling-queue',
  band: 'g46',
  thread: 'modeling',
  template: 'simulate',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 7,
  hasCanvas: false,
};

export default defineSimulateLevel(manifest);
