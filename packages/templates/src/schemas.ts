import { z } from 'zod';
import type { ZodType } from 'zod';
import type { TemplateId } from '@mmf/content/ids';
import { patternScriptSchema } from './pattern/schema';

/**
 * 模板 id → 关卡脚本 schema。M0 只实现了 pattern；
 * 其余模板先用 z.unknown() 占位，等对应模板 PR 替换。
 * 用 Record<TemplateId, ZodType> 约束：契约多一个模板而这里没登记，typecheck 会报。
 */
export const templateSchemas: Record<TemplateId, ZodType> = {
  pattern: patternScriptSchema,
  rule: z.unknown(),
  construct: z.unknown(),
  simulate: z.unknown(),
  experiment: z.unknown(),
  argue: z.unknown(),
};
