import type { LevelId, StampId } from '@mmf/content/ids';

export interface DebugOptions {
  /** ?autoplay=1：自动通关；只对 DEV / webdriver 开放 */
  autoplay?: boolean;
  /** ?instant=1：跳过过场/动画等待 */
  instant?: boolean;
}

export interface LevelEventMap {
  'level:start': { levelId: LevelId; at: number };
  'level:ready': { levelId: LevelId };
  'level:retry': { levelId: LevelId; failureClass: string; variantId: string };
  'run:end': {
    levelId: LevelId;
    variantId: string;
    outcome: 'pass' | 'fail';
    failureClass?: string;
  };
  'level:complete': { levelId: LevelId; variantId: string; stamps: StampId[] };
  'level:exit': { reason: 'complete' | 'quit' | 'replay' };
}
