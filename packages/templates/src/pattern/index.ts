import type { LevelModule, LevelManifest } from '@mmf/game-kit';
import { createPhaserGame } from '@mmf/canvas-kit';
import { createPatternScene } from './scene';
import { createPatternRuntime } from './runtime';
import type { LevelContext, LevelRuntime, LevelDetail, RuntimeOptions } from '@mmf/game-kit';

export function definePatternLevel(manifest: LevelManifest): LevelModule {
  let game: { destroy(removeCanvas: boolean): void; loop: { sleep(): void; wake(): void } } | null = null;

  return {
    manifest,
    createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
      return createPatternRuntime(detail, opts);
    },
    async mount(ctx: LevelContext, runtime: LevelRuntime): Promise<void> {
      if (!ctx.canvasHost) return;
      game = createPhaserGame(ctx.canvasHost, {
        designSize: manifest.designSize,
        scenes: [createPatternScene(ctx, runtime)],
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
