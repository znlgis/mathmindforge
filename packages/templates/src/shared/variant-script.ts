import type { LevelDetail } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';

/**
 * variant.patch 是**结构化覆盖**（docs/02 §7.5）：base 变体原样返回；
 * 其他变体把 patch 浅合并进 levelScript，再交给各模式的 zod schema 解析
 * （parse 会补默认值，所以 patch 不必写全）。
 *
 * 之前部分模式的 validateArtifact 直接读 detail.levelScript、忽略 variant，
 * 导致"迁移/表征变体"根本没过变体脚本——是休眠缺陷（当前 transferVariants 为空，
 * 走不到这条路径）。这里统一收口，模式实现只接 script。
 */
export function scriptForVariant<T>(
  detail: LevelDetail,
  variant: RuntimeVariant,
  parse: (input: unknown) => T,
): T {
  if (!variant || variant.id === 'base' || !variant.patch || Object.keys(variant.patch).length === 0) {
    return parse(detail.levelScript);
  }
  const base = detail.levelScript;
  if (!base || typeof base !== 'object' || Array.isArray(base)) return parse(base);
  return parse({ ...(base as Record<string, unknown>), ...variant.patch });
}
