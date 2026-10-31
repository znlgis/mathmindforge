import { z } from 'zod';
import {
  BADGE_IDS, BANDS, EVIDENCE_PHASES, LEVEL_IDS, TEMPLATE_IDS, THREADS, TOOL_IDS,
  VARIANT_AXES,
} from './ids';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #rrggbb');

const ToolSpecBase = {
  titleKey: z.string().min(1).max(80),
  descriptionKey: z.string().min(1).max(120),
  requiredArtifacts: z.array(z.string().min(1)).min(1),
};

export const ToolSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pattern'),
    ...ToolSpecBase,
    config: z.object({
      tokens: z.array(z.string().min(1)).min(2).max(4),
      maxPeriod: z.number().int().min(2).max(6).default(4),
      cells: z.array(z.number().int().min(0)).optional(),
    }),
  }),
  z.object({
    kind: z.literal('rule'),
    ...ToolSpecBase,
    config: z.object({ maxBlocks: z.number().int().min(1).max(64) }).passthrough(),
  }),
  z.object({
    kind: z.literal('construct'),
    ...ToolSpecBase,
    config: z.object({
      palette: z.array(z.object({
        id: z.string().min(1), label: z.string().min(1), shape: z.string().min(1),
      })).min(1),
      maxPieces: z.number().int().min(1).max(100),
      slots: z.array(z.number().int().min(0)).optional(),
    }),
  }),
  z.object({
    kind: z.literal('knob'),
    ...ToolSpecBase,
    config: z.object({
      keys: z.array(z.object({
        key: z.string().min(1), min: z.number(), max: z.number(),
        step: z.number().positive(), unit: z.string().max(8).optional(),
      })).min(1),
      sumTo: z.number().optional(),
    }),
  }),
  z.object({
    kind: z.literal('probe'),
    ...ToolSpecBase,
    config: z.object({
      sampleSizes: z.array(z.number().int().positive()).min(1),
      chart: z.string().max(40).optional(),
    }),
  }),
  z.object({
    kind: z.literal('counter'),
    ...ToolSpecBase,
    config: z.object({
      targetRange: z.tuple([z.number().int(), z.number().int()]).optional(),
      minTargetGap: z.number().int().min(0).optional(),
      denominationPool: z.array(z.number().int().positive()).optional(),
      premises: z.array(z.string().min(1)).optional(),
    }),
  }),
]);
export type ToolSpec = z.infer<typeof ToolSpecSchema>;

export const LevelSummarySchema = z.object({
  id: z.enum(LEVEL_IDS),
  title: z.string().min(1).max(24),
  emoji: z.string().min(1).max(8),
  color: hexColor.optional(),
  band: z.enum(BANDS),
  thread: z.enum(THREADS),
  template: z.enum(TEMPLATE_IDS),
  tools: z.array(z.enum(TOOL_IDS)).min(1),
  estimatedMinutes: z.number().int().min(3).max(15),
  thinkingTarget: z.string().min(1).max(60),
  difficulty: z.object({
    structure: z.number().int().min(1).max(5),
    representation: z.number().int().min(1).max(5),
    constraint: z.number().int().min(1).max(5),
    transfer: z.number().int().min(1).max(5),
  }),
  unlock: z.object({ after: z.array(z.enum(LEVEL_IDS)).default([]) }).optional(),
});
export type LevelSummary = z.infer<typeof LevelSummarySchema>;

export const FeedbackCopySchema = z.object({
  messageKey: z.string().min(1),
  hintKey: z.string().min(1),
  focus: z.string().min(1),
});

export const EvidenceCheckpointSchema = z.object({
  id: z.string().min(1),
  phase: z.enum(EVIDENCE_PHASES),
  require: z.string().min(1),
  descriptionKey: z.string().min(1),
});

export const LevelSolutionSchema = z.object({
  id: z.string().min(1),
  artifact: z.record(z.string(), z.unknown()),
});

export const NegativeSampleSchema = z.object({
  id: z.string().min(1),
  expectFailure: z.string().min(1),
  artifact: z.record(z.string(), z.unknown()),
});

export const LevelVariantSchema = z.object({
  id: z.string().min(1),
  axis: z.enum(VARIANT_AXES),
  patch: z.record(z.string(), z.unknown()),
});

export const LevelDetailSchema = z.object({
  id: z.enum(LEVEL_IDS),
  title: z.string().min(1).max(24),
  band: z.enum(BANDS),
  thread: z.enum(THREADS),
  template: z.enum(TEMPLATE_IDS),
  thinkingTarget: z.string().min(1).max(60),
  intro: z.string().min(1).max(120),
  prompt: z.string().min(1).max(120),
  done: z.string().min(1).max(120),
  retry: z.string().min(1).max(100),
  tools: z.array(ToolSpecSchema).min(1),
  requiredToolArtifacts: z.array(z.string().min(1)).min(1),
  levelScript: z.unknown(),
  evidencePlan: z.array(EvidenceCheckpointSchema).min(2),
  solutions: z.array(LevelSolutionSchema).min(2),
  negativeSamples: z.array(NegativeSampleSchema).min(3),
  variants: z.array(LevelVariantSchema).min(2),
  feedback: z.record(z.string(), FeedbackCopySchema),
  badges: z.array(z.enum(BADGE_IDS)).default([]),
  manualAudit: z.object({
    reviewed: z.boolean(),
    reviewer: z.string().min(1),
    reviewedAt: z.string().min(1),
    notesKey: z.string().optional(),
  }).optional(),
});
export type LevelDetail = z.infer<typeof LevelDetailSchema>;
