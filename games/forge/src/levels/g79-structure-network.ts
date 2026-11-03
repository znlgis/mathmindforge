import type { LevelManifest } from '@mmf/game-kit';
import { defineConstructLevel } from '@mmf/templates/construct';

const manifest: LevelManifest = {
  id: 'g79-structure-network',
  band: 'g79',
  thread: 'structure',
  template: 'construct',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 7,
  hasCanvas: false,
};

export default defineConstructLevel(manifest);
