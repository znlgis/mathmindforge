import type {
  LevelContext, LevelDetail, LevelManifest, LevelModule, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { createConstructRuntime } from './runtime';

export { createConstructRuntime } from './runtime';
export { constructVerifier } from './logic';

/**
 * construct 模板的关卡入口。
 * 支付关没有画布：收款台、面额盘、反例面板全部由 ToolDock 承担，mount 是空操作。
 */
export function defineConstructLevel(manifest: LevelManifest): LevelModule {
  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createConstructRuntime(detail, opts);
    },
    async mount(_ctx: LevelContext, _runtime: LevelRuntime): Promise<void> {
      // 无画布关卡：宿主会把 ToolDock 拉满宽度。
    },
    async unmount(): Promise<void> {
      // 没有 Phaser 实例需要销毁。
    },
    pause(): void {
      // 无画布，无需暂停。
    },
    resume(): void {
      // 无画布，无需恢复。
    },
  };
}
