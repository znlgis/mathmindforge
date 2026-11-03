/**
 * @mmf/game-forge 的包级出口。
 *
 * 关卡入口是**子路径导出**（./k-structure-pattern-path 等，见 package.json exports），
 * 由 apps/site/src/registry.ts 逐条动态 import —— 这样每关是一个独立 chunk，
 * 外壳的 registry 才不会被 20 关的代码拖进首屏。
 *
 * 这里刻意不 re-export 任何关卡模块：一句 export * from './levels/...'
 * 就会让所有关卡（连同 Phaser 画布场景）进入同一个 chunk，docs/02 §7.1 的
 * "外壳不 import Phaser" 与体积门禁都会失守。
 */
export {};
