import Phaser from 'phaser';
import { PALETTE } from './theme';

export interface CreateGameOptions {
  /** 设计尺寸（关卡模板声明的逻辑画布，如 900×560）。 */
  designSize: { width: number; height: number };
  /** 关卡场景，按顺序注册；Phaser 自动启动第一个。 */
  scenes: Phaser.Types.Scenes.SceneType[];
}

/**
 * 在 host 里启动 Phaser：AUTO 渲染器、FIT + CENTER_BOTH 适配、无音频。
 * 尺寸始终用设计尺寸，CSS 缩放交给 Scale Manager，绘制坐标因此可以写死。
 */
export function createPhaserGame(host: HTMLElement, opts: CreateGameOptions): Phaser.Game {
  const width = opts.designSize.width;
  const height = opts.designSize.height;

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width,
    height,
    backgroundColor: PALETTE.paper,
    banner: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
    },
    audio: { noAudio: true },
    scene: opts.scenes,
  });
}
