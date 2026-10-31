import type {
  BadgeId, EvidencePhase, LevelId, Locale, StampId, ToolId,
} from '@mmf/content/ids';

export const SAVE_SCHEMA_VERSION = 1;

export type ArtifactKind =
  | 'pattern-rule' | 'repair-set' | 'program' | 'placement-set' | 'tally'
  | 'params' | 'dataset' | 'claim' | 'counterexample' | 'argument';

export interface ArtifactSummary {
  id: string;
  kind: ArtifactKind;
  digest: string;
  summary: string;
}

export type Scaffold = 'none' | 'env' | 'tool' | 'demo';

/** 运行时只产出草稿；id/profileId/at 由外壳补齐后成为 EvidenceEvent */
export interface EvidenceDraft {
  phase: EvidencePhase;
  variantId: string;
  tool?: ToolId;
  action: string;
  artifact?: ArtifactSummary;
  outcome?: 'info' | 'pass' | 'fail';
  failureClass?: string;
  metrics?: Record<string, number>;
  scaffold?: Scaffold;
}

export interface EvidenceEvent extends EvidenceDraft {
  v: 1;
  id: string;
  at: number;
  profileId: string;
  levelId: LevelId;
  revision?: number;
}

export interface EvidenceAggregate {
  total: number;
  byLevel: Record<string, number>;
  byTool: Record<ToolId, number>;
  byPhase: Partial<Record<EvidencePhase, number>>;
  byFailure: Record<string, number>;
  lastAggregatedAt: number;
}

export interface LevelProgress {
  levelId: LevelId;
  completed: boolean;
  completedVariants: string[];
  stamps: StampId[];
  attempts: number;
  lastPlayedAt: number | null;
  lastOutcome?: {
    at: number;
    stamps: StampId[];
    failureClassesSeen: string[];
    revisionCount: number;
    materials: string[];
  };
}

export interface ToolUsage {
  uses: number;
  lastUsedAt: number | null;
  lastArtifact?: { kind: string; summary: string };
}

export interface JournalEntry {
  id: string;
  at: number;
  levelId: LevelId;
  variantId: string;
  stamps: StampId[];
  toolIds: ToolId[];
  failureClasses: string[];
  revisionCount: number;
  note?: string;
}

export interface BadgeAward {
  awardedAt: number;
  evidenceRefs: string[];
}

export interface SaveData {
  schemaVersion: number;
  updatedAt: number;
  profile: {
    id: string;
    nickname: string;
    startBand: string;
    createdAt: number;
  };
  levels: Record<LevelId, LevelProgress>;
  tools: Record<ToolId, ToolUsage>;
  badges: Partial<Record<BadgeId, BadgeAward>>;
  journal: JournalEntry[];
}

export interface EvidenceRecord {
  version: 1;
  events: EvidenceEvent[];
}

export interface SettingsValues {
  locale: Locale;
  muted: boolean;
  reducedMotion: boolean;
  hints: 'auto' | 'manual' | 'off';
}
