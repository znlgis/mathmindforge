import type { LevelContext, LevelDetail, LevelManifest, LevelModule, LevelRuntime, RuntimeOptions } from '@mmf/game-kit';
import { createArgueRuntime } from './runtime';

export { createArgueRuntime } from './runtime';
export { argueVerifier } from './logic';

export function defineArgueLevel(manifest: LevelManifest): LevelModule {
  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createArgueRuntime(detail, opts);
    },
    async mount(_ctx: LevelContext, _runtime: LevelRuntime): Promise<void> {
      // 无画布：这一关的作答面就是论证板（ArgumentBoard）。
    },
    async unmount(): Promise<void> {},
    pause(): void {},
    resume(): void {},
  };
}
