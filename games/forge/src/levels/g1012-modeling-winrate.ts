import type { LevelManifest } from '@mmf/game-kit';
import { defineExperimentLevel } from '@mmf/templates/experiment';

/** 无画布实验关：旋钮 + 采样，designSize 为 0×0，宿主隐藏“运行”。 */
const manifest: LevelManifest = {
  id: 'g1012-modeling-winrate',
  band: 'g1012',
  thread: 'modeling',
  template: 'experiment',
  designSize: { width: 0, height: 0 },
  estimatedMinutes: 10,
  hasCanvas: false,
  runEnabled: false,
};

export default defineExperimentLevel(manifest);
