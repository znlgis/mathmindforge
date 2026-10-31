import type {
  Band, EvidencePhase, LevelId, Locale, ShippedLevelId, StampId, ThreadId, TemplateId, ToolId,
} from '@mmf/content/ids';
import type { LevelDetail } from '@mmf/content';
import type { ArtifactSummary, EvidenceDraft } from './save';
import type { PlatformServices } from './services';
import type { DebugOptions, LevelEventMap } from './events';

export interface LevelManifest {
  id: ShippedLevelId;
  band: Band;
  thread: ThreadId;
  template: TemplateId;
  designSize: { width: number; height: number };
  estimatedMinutes: number;
  hasCanvas: boolean;
}

export interface LevelContext {
  container: HTMLElement;
  canvasHost: HTMLElement | null;
  manifest: LevelManifest;
  detail: LevelDetail;
  services: PlatformServices;
  locale: Locale;
  reducedMotion: boolean;
  completedBefore: boolean;
  debug?: DebugOptions;
  emit<K extends keyof LevelEventMap>(type: K, payload: LevelEventMap[K]): void;
  requestExit(reason?: 'quit' | 'replay'): void;
}

export interface LevelModule {
  manifest: LevelManifest;
  createRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime;
  mount(ctx: LevelContext, runtime: LevelRuntime): Promise<void>;
  unmount(): Promise<void>;
  pause(): void;
  resume(): void;
}

export interface RuntimeOptions {
  seed: number;
  now: () => number;
  locale: Locale;
  reducedMotion: boolean;
  autoplay?: boolean;
  onEvidence?: (draft: EvidenceDraft) => void;
}

export type PatternTransform = 'none' | 'mirror' | 'rotate' | 'shift';

export interface ProgramBlock {
  id: string;
  op: 'forward' | 'left' | 'right' | 'collect' | 'repeat' | 'if-wall';
  n?: number;
  children?: ProgramBlock[];
}

export interface PiecePlacementInput {
  id: string;
  shape: string;
  x: number;
  y: number;
  rot?: 0 | 90 | 180 | 270;
  flip?: boolean;
}

export interface TallyArtifact {
  counts: Record<string, number>;
  order?: string[];
}

export type ClaimInput =
  | { kind: 'count-compare'; category: string; direction: 'most' | 'least'; tiedWith?: string[]; n: number }
  | { kind: 'stat'; statistic: 'mean' | 'proportion'; value: number; n: number; ci?: [number, number] }
  | { kind: 'difference'; delta: number; ci: [number, number]; n: number };

export interface CounterPatch {
  ruleId: string;
  instance: Record<string, unknown>;
  premiseId?: string;
}

export interface ActionPayloadMap {
  'pattern/inspect': { index: number };
  'pattern/setCycle': { cycle: string[]; transform: PatternTransform };
  'pattern/preview': Record<string, never>;
  'pattern/commit': Record<string, never>;
  'construct/place': { piece: PiecePlacementInput };
  'construct/remove': { pieceId: string };
  'run': Record<string, never>;
  'submit': Record<string, never>;
  'reset': Record<string, never>;
}

export type LevelAction = {
  [K in keyof ActionPayloadMap]: { type: K; payload: ActionPayloadMap[K] };
}[keyof ActionPayloadMap];

export interface FailureCause {
  kind: 'cell' | 'step' | 'constraint' | 'variant' | 'claim' | 'sample';
  ref: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

export interface FailureReport {
  class: string;
  variantId?: string;
  causes: FailureCause[];
}

export interface EvidenceRequirement {
  checkpointId: string;
  phase: EvidencePhase;
  messageKey: string;
  actionHint: string;
}

export interface Verdict {
  passed: boolean;
  stamps: StampId[];
  failure?: FailureReport;
  missingEvidence: EvidenceRequirement[];
  metrics?: Record<string, number>;
  artifacts: ArtifactSummary[];
}

export interface RunRecord {
  id: string;
  variantId: string;
  at: number;
  outcome: 'pass' | 'fail';
  failureClass?: string;
  metrics?: Record<string, number>;
  artifactDigests: string[];
  durationMs: number;
}

export interface PatternToolState {
  inspected: number[];
  cycle?: string[];
  transform?: PatternTransform;
  committed: boolean;
}

export interface RuleToolState {
  program: ProgramBlock[];
  selectedId?: string;
  lastTrace?: { steps: number; failureStep?: number; failureClass?: string };
}

export interface ConstructToolState {
  pieces: PiecePlacementInput[];
  selectedId?: string;
}

export interface KnobToolState {
  values: Record<string, number>;
  lastRunId?: string;
}

export interface ProbeToolState {
  dataset?: {
    id: string;
    n: number;
    values: number[];
    groups?: Record<string, number[]>;
    digest: string;
  };
  claim?: ClaimInput;
  focusId?: string;
}

export interface CounterToolState {
  draft: CounterPatch;
  lastTest?: { ruleId: string; passed: boolean; failedPremise?: string };
}

export interface ToolStateMap {
  pattern: PatternToolState;
  rule: RuleToolState;
  construct: ConstructToolState;
  knob: KnobToolState;
  probe: ProbeToolState;
  counter: CounterToolState;
}

export interface ToolUsageState {
  used: number;
  lastAction?: string;
}

export interface RunSnapshot {
  levelId: LevelId;
  variantId: string;
  phase: 'idle' | 'observing' | 'editing' | 'running' | 'failed' | 'passed';
  artifacts: ArtifactSummary[];
  toolState: Partial<ToolStateMap>;
  toolUsage: Record<ToolId, ToolUsageState>;
  checkpoints: Record<string, boolean>;
  runs: RunRecord[];
  lastRun?: RunRecord;
  verdict?: Verdict;
  stamps: StampId[];
  revision: number;
  updatedAt: number;
}

export interface ActionResult {
  ok: boolean;
  snapshot: RunSnapshot;
  verdict?: Verdict;
  reason?: 'invalid-action' | 'not-ready' | 'blocked';
  message?: string;
}

export interface LevelRuntime {
  readonly detail: LevelDetail;
  snapshot(): RunSnapshot;
  subscribe(listener: (snapshot: RunSnapshot) => void): () => void;
  dispatch(action: LevelAction): Promise<ActionResult>;
  autoplay(): Promise<ActionResult>;
  reset(): Promise<void>;
}

