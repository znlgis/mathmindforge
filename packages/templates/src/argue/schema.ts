import { z } from 'zod';

export const argueScriptSchema = z.object({
  mode: z.literal('tiling'),
  board: z.object({
    width: z.number().int().min(3).max(8),
    height: z.number().int().min(3).max(8),
    removed: z.array(z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
    })).max(12).default([]),
  }),
  claims: z.array(z.string().min(1)).min(2),
  warrants: z.array(z.enum(['coloring', 'parity', 'area'])).min(2),
  scopes: z.array(z.string().min(1)).min(1),
});
export type ArgueScript = z.infer<typeof argueScriptSchema>;

export const argueArtifactSchema = z.object({
  counts: z.object({
    black: z.number().int().min(0),
    white: z.number().int().min(0),
    cells: z.number().int().min(0),
  }),
  argument: z.object({
    claim: z.string().min(1),
    warrant: z.string().min(1),
    scope: z.string().min(1),
    evidence: z.object({
      black: z.number().int().min(0).optional(),
      white: z.number().int().min(0).optional(),
      cells: z.number().int().min(0).optional(),
    }),
  }),
});
export type ArgueArtifact = z.infer<typeof argueArtifactSchema>;

export interface BoardCell {
  x: number;
  y: number;
}
