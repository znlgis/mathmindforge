import { z } from 'zod';
import type { ZodType } from 'zod';
import type { TemplateId } from '@mmf/content/ids';
import { patternScriptSchema } from './pattern/schema';
import { ruleScriptSchema } from './rule/schema';
import { constructScriptSchema } from './construct/schema';
import { networkScriptSchema } from './construct/network';
import { scheduleScriptSchema } from './construct/schedule';
import { frontierScriptSchema } from './construct/frontier';
import { simulateScriptSchema } from './simulate/schema';
import { queueScriptSchema } from './simulate/queue';
import { experimentScriptSchema } from './experiment/schema';
import { samplingScriptSchema } from './experiment/sampling';
import { inferenceScriptSchema } from './experiment/inference';
import { argueScriptSchema } from './argue/schema';

/**
 * 模板 id → 关卡脚本 schema。M1 已实现 pattern/rule/construct/simulate/experiment；
 * argue 仍用 z.unknown() 占位。用 Record<TemplateId, ZodType> 约束：
 * 契约多一个模板而这里没登记，typecheck 会报。
 */
export const templateSchemas: Record<TemplateId, ZodType> = {
  pattern: patternScriptSchema,
  rule: ruleScriptSchema,
  construct: z.discriminatedUnion('mode', [constructScriptSchema, networkScriptSchema, scheduleScriptSchema, frontierScriptSchema]),
  simulate: z.discriminatedUnion('mode', [simulateScriptSchema, queueScriptSchema]),
  experiment: z.discriminatedUnion('mode', [experimentScriptSchema, samplingScriptSchema, inferenceScriptSchema]),
  argue: argueScriptSchema,
};
