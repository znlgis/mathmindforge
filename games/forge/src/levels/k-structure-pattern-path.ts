import type { LevelManifest } from '@mmf/game-kit';
import { definePatternLevel } from '@mmf/templates/pattern';
import { DESIGN } from '@mmf/templates/layout';

const manifest: LevelManifest = {
  id: 'k-structure-pattern-path',
  band: 'k',
  thread: 'structure',
  template: 'pattern',
  designSize: DESIGN,
  estimatedMinutes: 5,
  hasCanvas: true,
};

export default definePatternLevel(manifest);
