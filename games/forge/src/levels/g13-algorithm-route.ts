import type { LevelManifest } from '@mmf/game-kit';
import { RULE_DESIGN, defineRuleLevel } from '@mmf/templates/rule';

const manifest: LevelManifest = {
  id: 'g13-algorithm-route',
  band: 'g13',
  thread: 'algorithm',
  template: 'rule',
  designSize: RULE_DESIGN,
  estimatedMinutes: 8,
  hasCanvas: true,
};

export default defineRuleLevel(manifest);
