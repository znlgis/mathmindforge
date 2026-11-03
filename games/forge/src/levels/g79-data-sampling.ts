import type { LevelManifest } from '@mmf/game-kit';
import { defineExperimentLevel } from '@mmf/templates/experiment';

const manifest: LevelManifest = {
  id: 'g79-data-sampling',
  band: 'g79',
  thread: 'data',
  template: 'experiment',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 7,
  hasCanvas: false,
  runEnabled: false,
};

export default defineExperimentLevel(manifest);
