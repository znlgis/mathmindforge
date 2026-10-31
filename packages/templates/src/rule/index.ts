import type {
  LevelContext, LevelDetail, LevelManifest, LevelModule, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { createPhaserGame } from '@mmf/canvas-kit';
import { createRuleRuntime } from './runtime';
import { createRuleScene } from './scene';

/** 规则关的设计画布；游戏入口直接用它当 designSize。 */
export const RULE_DESIGN = { width: 720, height: 720 } as const;

/**
 * 规则关入口：运行时来自共享适配器，画布是 5×5 的路线图纸。
 * unmount 时连同 canvas 一起销毁，重进关卡不会留下旧场景。
 */
export function defineRuleLevel(manifest: LevelManifest): LevelModule {
  let game: { destroy(removeCanvas: boolean): void; loop: { sleep(): void; wake(): void } } | null = null;

  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createRuleRuntime(detail, opts);
    },
    async mount(ctx: LevelContext, runtime: LevelRuntime): Promise<void> {
      if (!ctx.canvasHost) return;
      game = createPhaserGame(ctx.canvasHost, {
        designSize: manifest.designSize,
        scenes: [createRuleScene(ctx, runtime)],
      });
    },
    async unmount(): Promise<void> {
      game?.destroy(true);
      game = null;
    },
    pause(): void {
      game?.loop.sleep();
    },
    resume(): void {
      game?.loop.wake();
    },
  };
}
