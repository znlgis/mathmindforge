import type {
  LevelContext, LevelDetail, LevelManifest, LevelModule, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { createExperimentRuntime } from './verifier';

/**
 * experiment 模板：无画布关卡（分类计数 / 胜率实验）。
 * 情境全部由工具面板承担，mount 只做占位，不创建 Phaser 实例。
 */
export function defineExperimentLevel(manifest: LevelManifest): LevelModule {
  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createExperimentRuntime(detail, opts);
    },
    async mount(_ctx: LevelContext, _runtime: LevelRuntime): Promise<void> {
      // 无画布：宿主会把作答面板拉满宽度，这里不需要渲染任何东西。
    },
    async unmount(): Promise<void> {
      // 无资源需要释放。
    },
    pause(): void {
      // 无动画/音频，暂停即空实现。
    },
    resume(): void {
      // 同上。
    },
  };
}
