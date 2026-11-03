import type { ZodType } from 'zod';
import type { TemplateId } from '@mmf/content/ids';
import { patternScriptSchema } from './pattern/schema';
import { ruleScriptSchema } from './rule/schema';
import { constructScriptSchema } from './construct/schema';
import { simulateScriptSchema } from './simulate/schema';
import { experimentScriptSchema } from './experiment/schema';
import { argueScriptSchema } from './argue/schema';

/**
 * 模板 id → 关卡脚本 schema。M1 已实现 pattern/rule/construct/simulate/experiment；
 * argue 仍用 z.unknown() 占位。用 Record<TemplateId, ZodType> 约束：
 * 契约多一个模板而这里没登记，typecheck 会报。
 */
export const templateSchemas: Record<TemplateId, ZodType> = {
  pattern: patternScriptSchema,
  rule: ruleScriptSchema,
  construct: constructScriptSchema,
  simulate: simulateScriptSchema,
  experiment: experimentScriptSchema,
  argue: argueScriptSchema,
};
