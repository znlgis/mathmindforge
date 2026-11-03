import type {
  BadgeId, EvidencePhase, LevelId, StampId, ToolId,
} from '@mmf/content/ids';
import type { EvidenceEvent, SaveData } from '@mmf/game-kit';
import type { LevelSummary } from '@mmf/content';

export type EvidenceDimensionId = 'structure' | 'rule' | 'model' | 'boundary';

export interface DimensionSignal {
  id: string;
  label: string;
  value: number;
  sample: number;
  band: 0 | 1 | 2 | 3;
}

export interface DimensionView {
  id: EvidenceDimensionId;
  label: string;
  band: 0 | 1 | 2 | 3;
  summary: string;
  signals: DimensionSignal[];
}

export interface Recommendation {
  levelId?: LevelId;
  title: string;
  reason: string;
}

export interface EvidenceProfile {
  version: 1;
  dimensions: DimensionView[];
  recommendations: Recommendation[];
  toolUses: { tool: ToolId; count: number }[];
  eventCount: number;
}

export interface TrailItem {
  id: string;
  at: number;
  levelId: LevelId;
  title: string;
  phase: EvidencePhase;
  phaseLabel: string;
  tool?: ToolId;
  toolLabel?: string;
  action: string;
  outcome: 'info' | 'pass' | 'fail';
  failureClass?: string;
  label: string;
}

export interface BadgeView {
  id: BadgeId;
  earned: boolean;
  awardedAt?: number;
  title: string;
  criteria: string;
  progress: { current: number; target: number };
}

export interface ReportLevelRow {
  levelId: LevelId;
  title: string;
  completed: boolean;
  stamps: StampId[];
  lastPlayedAt: number | null;
  variantCount: number;
}

export interface ReportModel {
  generatedAt: number;
  nickname: string;
  periodDays: number;
  tools: { tool: ToolId; label: string; uses: number }[];
  levels: ReportLevelRow[];
  dimensions: DimensionView[];
  recommendations: Recommendation[];
  totalJournal: number;
  totalEvents: number;
  privacyNote: string;
}

export interface ReportPack {
  version: 1;
  generatedAt: number;
  nickname?: string;
  tools: { tool: string; uses: number }[];
  levels: { id: string; title: string; completed: boolean; stamps: string[] }[];
  dimensions: { id: string; band: number; summary: string }[];
  recommendations: { title: string; reason: string }[];
}

export interface EvidenceBuildInput {
  save: SaveData;
  events: EvidenceEvent[];
  summaries: readonly LevelSummary[];
  now: number;
}
