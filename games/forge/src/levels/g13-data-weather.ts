import type { LevelManifest } from '@mmf/game-kit';
import { defineExperimentLevel } from '@mmf/templates/experiment';

const manifest: LevelManifest = {
  id: 'g13-data-weather',
  band: 'g13',
  thread: 'data',
  template: 'experiment',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 6,
  hasCanvas: false,
};

export default defineExperimentLevel(manifest);
