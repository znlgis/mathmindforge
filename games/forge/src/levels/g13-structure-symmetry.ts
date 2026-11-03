import type { LevelManifest } from '@mmf/game-kit';
import { definePatternLevel } from '@mmf/templates/pattern';
import { DESIGN } from '@mmf/templates/layout';

const manifest: LevelManifest = {
  id: 'g13-structure-symmetry',
  band: 'g13',
  thread: 'structure',
  template: 'pattern',
  designSize: DESIGN,
  estimatedMinutes: 6,
  hasCanvas: true,
  runEnabled: true,
};

export default definePatternLevel(manifest);
