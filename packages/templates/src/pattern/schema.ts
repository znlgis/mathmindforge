import { z } from 'zod';

export const patternScriptSchema = z.object({
  scenario: z.object({
    kind: z.literal('path'),
    length: z.number().int().min(3).max(24),
    visible: z.array(z.string().min(1).nullable()).min(3).max(24),
    startIndex: z.number().int().min(0).max(12).default(0),
    symbols: z.record(z.string(), z.string()).optional(),
  }),
  pattern: z.object({
    allowedPeriods: z.array(z.number().int().min(2).max(6)).min(1),
    allowedTransforms: z.array(z.enum(['none', 'mirror', 'rotate', 'shift'])).min(1),
    ambiguous: z.boolean().default(false),
  }),
});
export type PatternScript = z.infer<typeof patternScriptSchema>;

export const patternArtifactSchema = z.object({
  patternRule: z.object({
    tokens: z.array(z.string().min(1)).min(2).max(6),
    period: z.number().int().min(2).max(6),
    transform: z.enum(['none', 'mirror', 'rotate', 'shift']),
  }),
  repair: z.array(z.object({ index: z.number().int().min(0), token: z.string().min(1) })),
});
export type PatternArtifact = z.infer<typeof patternArtifactSchema>;
