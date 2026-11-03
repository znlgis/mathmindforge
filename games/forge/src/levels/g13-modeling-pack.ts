import type { LevelManifest } from '@mmf/game-kit';
import { defineConstructLevel } from '@mmf/templates/construct';

const manifest: LevelManifest = {
  id: 'g13-modeling-pack',
  band: 'g13',
  thread: 'modeling',
  template: 'construct',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 6,
  hasCanvas: false,
  runEnabled: false,
};

export default defineConstructLevel(manifest);
