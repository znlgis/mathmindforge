import type {
  ArtifactSummary, ClaimInput, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions,
  ToolStateMap, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import type { RuntimeVariant } from '../shared/types';
import { simulateDuel } from './duel';
import {
  actionsFor, parseScript, summarizeArtifact, transferFailureClass, transferVariants, validateArtifact,
} from './logic';
import { MAX_MATCHES } from './schema';
import type { DuelParams, DuelScript, ExperimentScript, TallyScript } from './schema';
import { countsOf, normalizeCounts } from './tally';

/**
 * experiment 模板的运行时：复用 shared/runtime 的动作驱动骨架，
 * 自己只实现 tally / duel 两种状态机（apply / artifact / checkpoints / toolState）。
 * 没有画布：一切交互都来自探针与旋钮动作。
 */

interface DuelSample {
  seed: number;
  n: number;
  wins: number;
  winRate: number;
  ci: [number, number];
  values: number[];
}

interface ExperimentState {
  collected: string[];
  tallyCounts: Record<string, number> | null;
  draftParams: Record<string, number>;
  params: DuelParams | null;
  sample: DuelSample | null;
  claim: ClaimInput | null;
  focusId?: string;
}

function defaultParams(script: DuelScript): DuelParams {
  if (script.initialParams) return { ...script.initialParams };
  const share = Math.floor(script.resources / 3 / script.step) * script.step;
  return { attack: share, defense: share, economy: script.resources - share * 2 };
}

function initialStateOf(script: ExperimentScript): ExperimentState {
  if (script.mode === 'tally') {
    return {
      collected: [],
      tallyCounts: null,
      draftParams: {},
      params: null,
      sample: null,
      claim: null,
    };
  }
  const initial = defaultParams(script);
  return {
    collected: [],
    tallyCounts: null,
    draftParams: { attack: initial.attack, defense: initial.defense, economy: initial.economy },
    params: null,
    sample: null,
    claim: null,
  };
}

const PARAM_KEYS = ['attack', 'defense', 'economy'] as const;
type ParamKey = (typeof PARAM_KEYS)[number];

function isParamKey(key: string): key is ParamKey {
  return (PARAM_KEYS as readonly string[]).includes(key);
}

function tallyDatasetSummary(script: TallyScript, collected: readonly string[]) {
  const counts = countsOf(collected, script);
  const values = collected.map((item) => {
    const index = script.categories.findIndex((category) => category.id === item);
    return index < 0 ? 0 : index;
  });
  return {
    id: 'dataset-tally',
    n: collected.length,
    values,
    counts,
    digest: digest(counts),
  };
}

function createAdapter(detail: LevelDetail): RuntimeAdapter<ExperimentState> {
  const script = parseScript(detail.levelScript);

  function applyTally(state: ExperimentState, action: LevelAction): AdapterResult<ExperimentState> {
    if (script.mode !== 'tally') return { state, error: '这一关不是计数关。' };
    switch (action.type) {
      case 'probe/sample': {
        if (state.collected.length >= script.items.length) {
          return { state, error: '这一筐已经采完了，去看统计条。' };
        }
        const requested = action.payload.n;
        const take = typeof requested === 'number' && Number.isFinite(requested)
          ? Math.max(1, Math.floor(requested))
          : script.batchSize;
        const next = script.items.slice(state.collected.length, state.collected.length + take);
        const collected = [...state.collected, ...next];
        return {
          state: { ...state, collected },
          evidence: {
            phase: 'observe',
            tool: 'probe',
            action: action.type,
            metrics: { collected: collected.length, added: next.length },
          },
        };
      }
      case 'probe/tally': {
        if (state.collected.length < script.items.length) {
          return { state, error: '先把整筐采完，再记录统计条。' };
        }
        const counts = normalizeCounts(script, action.payload.counts);
        return {
          state: { ...state, tallyCounts: counts },
          evidence: {
            phase: 'construct',
            tool: 'probe',
            action: action.type,
            metrics: { total: Object.values(counts).reduce((sum, value) => sum + value, 0) },
          },
        };
      }
      case 'probe/clear': {
        return {
          state: { ...state, tallyCounts: null, claim: null },
          evidence: { phase: 'revise', tool: 'probe', action: action.type },
        };
      }
      case 'probe/focus': {
        return {
          state: { ...state, focusId: action.payload.id },
          evidence: { phase: 'observe', tool: 'probe', action: action.type, metrics: { focus: 1 } },
        };
      }
      case 'probe/claim': {
        const claim = action.payload.claim;
        if (!claim || claim.kind !== 'count-compare') {
          return { state, error: '这一类关卡要用“最多/最少”的比较结论。' };
        }
        if (!script.categories.some((category) => category.id === claim.category)) {
          return { state, error: '这个类别不在这筐图形里。' };
        }
        if (claim.direction !== 'most' && claim.direction !== 'least') {
          return { state, error: '先选“最多”还是“最少”。' };
        }
        return {
          state: { ...state, claim },
          evidence: {
            phase: 'result',
            tool: 'probe',
            action: action.type,
            metrics: { n: claim.n },
          },
        };
      }
      default:
        return { state, error: '这个动作在计数关里没有意义。' };
    }
  }

  function applyDuel(state: ExperimentState, action: LevelAction): AdapterResult<ExperimentState> {
    if (script.mode !== 'duel') return { state, error: '这一关不是胜率实验。' };
    switch (action.type) {
      case 'knob/set': {
        const key = action.payload.key;
        if (!isParamKey(key)) return { state, error: '这一关只有 attack / defense / economy 三个旋钮。' };
        const value = action.payload.value;
        if (!Number.isInteger(value) || value < 0 || value > script.resources) {
          return { state, error: '旋钮值要是 0 到 ' + script.resources + ' 之间的整数。' };
        }
        if (value % script.step !== 0) {
          return { state, error: '旋钮要按 ' + script.step + ' 的倍数调。' };
        }
        const committed = state.params;
        const changed = !committed || committed[key] !== value;
        return {
          state: {
            ...state,
            draftParams: { ...state.draftParams, [key]: value },
            params: changed ? null : state.params,
            sample: changed ? null : state.sample,
            claim: changed ? null : state.claim,
          },
          evidence: { phase: 'hypothesize', tool: 'knob', action: action.type, metrics: { value } },
        };
      }
      case 'knob/commit': {
        const draft = state.draftParams;
        const params: DuelParams = {
          attack: draft.attack ?? 0,
          defense: draft.defense ?? 0,
          economy: draft.economy ?? 0,
        };
        const sum = params.attack + params.defense + params.economy;
        if (sum !== script.resources) {
          return { state, error: '三个旋钮加起来要正好是 ' + script.resources + ' 点，现在是 ' + sum + ' 点。' };
        }
        return {
          state: { ...state, params, sample: null, claim: null },
          evidence: {
            phase: 'hypothesize',
            tool: 'knob',
            action: action.type,
            metrics: { attack: params.attack, defense: params.defense, economy: params.economy },
          },
        };
      }
      case 'knob/reset': {
        const initial = defaultParams(script);
        return {
          state: {
            ...state,
            draftParams: { attack: initial.attack, defense: initial.defense, economy: initial.economy },
            params: null,
            sample: null,
            claim: null,
          },
          evidence: { phase: 'revise', tool: 'knob', action: action.type },
        };
      }
      case 'knob/run': {
        // 宿主若显示“运行”按钮，就按“确认当前配置 + 跑满默认局数”处理，避免出现死按钮。
        const draft = state.draftParams;
        const params: DuelParams = {
          attack: draft.attack ?? 0,
          defense: draft.defense ?? 0,
          economy: draft.economy ?? 0,
        };
        const sum = params.attack + params.defense + params.economy;
        if (sum !== script.resources) {
          return { state, error: '三个旋钮加起来要正好是 ' + script.resources + ' 点，现在是 ' + sum + ' 点。' };
        }
        const seed = script.seeds[script.seedIndex] ?? script.seeds[0] ?? 1;
        const run = simulateDuel(script, params, seed, script.matches);
        return {
          state: {
            ...state,
            params,
            sample: {
              seed,
              n: run.n,
              wins: run.wins,
              winRate: run.winRate,
              ci: run.ci,
              values: run.values,
            },
            claim: null,
          },
          evidence: {
            phase: 'run',
            tool: 'knob',
            action: action.type,
            metrics: { n: run.n, winRate: Math.round(run.winRate * 1000) / 1000 },
          },
        };
      }
      case 'probe/sample': {
        if (!state.params) {
          return { state, error: '先把旋钮调好并确认配置，再采样。' };
        }
        const requested = action.payload.n;
        const n = typeof requested === 'number' && Number.isFinite(requested)
          ? Math.floor(requested)
          : script.matches;
        if (n < 1 || n > MAX_MATCHES) return { state, error: '采样局数要在 1 到 ' + MAX_MATCHES + ' 之间。' };
        const seed = script.seeds[script.seedIndex] ?? script.seeds[0] ?? 1;
        const result = simulateDuel(script, state.params, seed, n);
        const sample: DuelSample = {
          seed,
          n: result.n,
          wins: result.wins,
          winRate: result.winRate,
          ci: result.ci,
          values: result.values,
        };
        return {
          state: { ...state, sample, claim: null },
          evidence: {
            phase: 'run',
            tool: 'probe',
            action: action.type,
            metrics: { n: result.n, winRate: Math.round(result.winRate * 1000) / 1000 },
          },
        };
      }
      case 'probe/clear': {
        return {
          state: { ...state, sample: null, claim: null },
          evidence: { phase: 'revise', tool: 'probe', action: action.type },
        };
      }
      case 'probe/focus': {
        return {
          state: { ...state, focusId: action.payload.id },
          evidence: { phase: 'observe', tool: 'probe', action: action.type, metrics: { focus: 1 } },
        };
      }
      case 'probe/claim': {
        if (!state.sample) return { state, error: '先跑一次采样，再用这次数据下结论。' };
        const claim = action.payload.claim;
        if (!claim || claim.kind !== 'stat' || claim.statistic !== 'proportion') {
          return { state, error: '要用“比例”这个统计量来写结论。' };
        }
        if (!(claim.value >= 0 && claim.value <= 1)) {
          return { state, error: '胜率要在 0 到 1 之间。' };
        }
        return {
          state: { ...state, claim },
          evidence: {
            phase: 'result',
            tool: 'probe',
            action: action.type,
            metrics: { value: claim.value, n: claim.n },
          },
        };
      }
      default:
        return { state, error: '这个动作在胜率实验里没有意义。' };
    }
  }

  function artifactOf(state: ExperimentState): unknown {
    if (script.mode === 'tally') {
      if (state.collected.length < script.items.length) return null;
      if (!state.tallyCounts || !state.claim) return null;
      return {
        dataset: { n: state.collected.length, counts: countsOf(state.collected, script) },
        tally: { counts: state.tallyCounts },
        claim: state.claim,
      };
    }
    if (!state.params || !state.sample || !state.claim) return null;
    return {
      params: { ...state.params },
      dataset: {
        n: state.sample.n,
        wins: state.sample.wins,
        seed: state.sample.seed,
        winRate: state.sample.winRate,
        ci: state.sample.ci,
      },
      claim: state.claim,
    };
  }

  return {
    initialState(): ExperimentState {
      return initialStateOf(script);
    },
    apply(state, action): AdapterResult<ExperimentState> {
      return script.mode === 'tally' ? applyTally(state, action) : applyDuel(state, action);
    },
    artifact(state) {
      return artifactOf(state);
    },
    artifactSummaries(state): ArtifactSummary[] {
      return summarizeArtifact(detail, artifactOf(state));
    },
    checkpoints(state): Record<string, boolean> {
      if (script.mode === 'tally') {
        return {
          sample: state.collected.length >= script.items.length,
          tally: state.tallyCounts !== null,
          claim: state.claim !== null,
        };
      }
      return {
        strategy: state.params !== null,
        run: state.sample !== null,
        claim: state.claim !== null,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      if (script.mode === 'tally') {
        return {
          probe: {
            dataset: state.collected.length > 0 ? tallyDatasetSummary(script, state.collected) : undefined,
            items: [...state.collected],
            tally: state.tallyCounts ?? {},
            claim: state.claim ?? undefined,
            focusId: state.focusId,
          },
        };
      }
      const sample = state.sample;
      return {
        knob: {
          values: { ...state.draftParams },
        },
        probe: {
          dataset: sample
            ? {
                id: 'dataset-duel',
                n: sample.n,
                values: [...sample.values],
                counts: {
                  wins: sample.wins,
                  losses: sample.n - sample.wins,
                  seed: sample.seed,
                },
                digest: digest({ n: sample.n, wins: sample.wins, seed: sample.seed }),
              }
            : undefined,
          claim: state.claim ?? undefined,
          focusId: state.focusId,
        },
      };
    },
    validate(_detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
      return validateArtifact(detail, variant, artifact);
    },
    actionsFor(_detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
      return actionsFor(detail, variant, artifact);
    },
    transferVariants(): RuntimeVariant[] {
      return transferVariants(detail);
    },
    transferFailureClass(): string {
      return transferFailureClass(detail);
    },
  };
}

export function createExperimentRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return createRuntimeWithAdapter(detail, opts, createAdapter(detail));
}
