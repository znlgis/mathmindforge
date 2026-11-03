import type { LevelManifest } from '@mmf/game-kit';
import { defineExperimentLevel } from '@mmf/templates/experiment';

const manifest: LevelManifest = {
  id: 'g1012-data-inference',
  band: 'g1012',
  thread: 'data',
  template: 'experiment',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 8,
  hasCanvas: false,
  runEnabled: false,
};

export default defineExperimentLevel(manifest);
