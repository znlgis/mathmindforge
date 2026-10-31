import { ProgressManager } from '@mmf/progress';
import { platform } from './platform';

export const progressManager = new ProgressManager(
  platform.storage,
  platform.evidenceStore,
  platform.now,
);
