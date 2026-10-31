import type { LevelManifest } from '@mmf/game-kit';
import { defineExperimentLevel } from '@mmf/templates/experiment';

/** 无画布实验关：情境在工具面板里，designSize 为 0×0，宿主隐藏“运行”。 */
const manifest: LevelManifest = {
  id: 'k-data-tally',
  band: 'k',
  thread: 'data',
  template: 'experiment',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 5,
  hasCanvas: false,
  runEnabled: false,
};

export default defineExperimentLevel(manifest);
