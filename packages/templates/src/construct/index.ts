import type {
  LevelContext, LevelDetail, LevelManifest, LevelModule, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { createConstructRuntime } from './verifier';

export { createConstructRuntime } from './verifier';
export { constructVerifier } from './verifier';

export function defineConstructLevel(manifest: LevelManifest): LevelModule {
  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createConstructRuntime(detail, opts);
    },
    async mount(_ctx: LevelContext, _runtime: LevelRuntime): Promise<void> {},
    async unmount(): Promise<void> {},
    pause(): void {},
    resume(): void {},
  };
}
