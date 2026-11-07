import type {
  LevelContext,
  LevelDetail,
  LevelManifest,
  LevelModule,
  LevelRuntime,
  RuntimeOptions,
} from '@mmf/game-kit';
import { createSimulateRuntime } from './verifier';

export { createSimulateRuntime } from './verifier';
export { simulateVerifier, FAILURE_CLASSES } from './logic';
export type { SimulateScript, SimulateArtifact } from './schema';
export { simulateScriptSchema, simulateArtifactSchema } from './schema';

/**
 * g79 城市调度：无画布关卡。
 * 交互全在作答区（KnobTool）里，宿主把面板区拉满宽度即可，
 * 所以 mount 故意什么都不挂，只保留 LevelModule 的形状。
 */
export function defineSimulateLevel(manifest: LevelManifest): LevelModule {
  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createSimulateRuntime(detail, opts);
    },
    async mount(_ctx: LevelContext, _runtime: LevelRuntime): Promise<void> {
      // 无画布：不创建 Phaser 实例，也不碰 canvasHost。
    },
    async unmount(): Promise<void> {
      // 无画布，无需销毁。
    },
    pause(): void {
      // 无画布，无需暂停。
    },
    resume(): void {
      // 无画布，无需恢复。
    },
  };
}
