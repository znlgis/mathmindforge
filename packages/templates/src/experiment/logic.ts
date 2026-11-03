import type { ClaimInput, LevelAction, Verdict } from '@mmf/game-kit';
import type { LevelDetail } from '@mmf/content';
import { digest } from '@mmf/toolkit/shared';
import type { RuntimeVariant } from '../shared/types';
import {
  DUEL_FAILURE_CLASSES, checkDuelArtifact, paramsValid, simulateDuel,
} from './duel';
import { experimentScriptSchema } from './schema';
import type { DuelParams, DuelScript, ExperimentScript, TallyScript } from './schema';
import {
  TALLY_FAILURE_CLASSES, checkTallyArtifact, extremes, tallyDigest, truthCounts,
} from './tally';

/**
 * experiment 模板的构建期/审计侧纯逻辑：
 * parseScript / validateArtifact / actionsFor / reachableFailureClasses / transferVariants。
 * 不含 Phaser、Vue、DOM，也不含任何随机与时间。
 */

export type ExperimentVariant = RuntimeVariant;

export function parseScript(input: unknown): ExperimentScript {
  return experimentScriptSchema.parse(input);
}

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)) {
      out[key] = mergeRecord(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function applyVariant(script: ExperimentScript, variant: RuntimeVariant): ExperimentScript {
  if (!variant.patch || Object.keys(variant.patch).length === 0) return script;
  return experimentScriptSchema.parse(mergeRecord(
    script as unknown as Record<string, unknown>,
    variant.patch,
  ));
}

function percent(value: number): string {
  return (Math.round(value * 1000) / 10).toFixed(1) + '%';
}

interface RawTallyArtifact {
  dataset?: { n?: unknown; counts?: unknown };
  tally?: { counts?: unknown };
  claim?: unknown;
}

function tallyArtifactSummaries(artifact: unknown): Verdict['artifacts'] {
  const raw = (artifact && typeof artifact === 'object' ? artifact : {}) as RawTallyArtifact;
  const out: Verdict['artifacts'] = [];
  const dataset = raw.dataset;
  if (dataset && dataset.counts && typeof dataset.counts === 'object') {
    const counts = dataset.counts as Record<string, number>;
    out.push({
      id: 'dataset',
      kind: 'dataset',
      digest: digest(counts),
      summary: (typeof dataset.n === 'number' ? dataset.n : 0) + ' 个',
    });
  }
  const tally = raw.tally;
  if (tally && tally.counts && typeof tally.counts === 'object') {
    const counts = tally.counts as Record<string, number>;
    out.push({
      id: 'tally',
      kind: 'tally',
      digest: tallyDigest(counts),
      summary: Object.entries(counts).map(([id, value]) => id + ':' + value).join(' '),
    });
  }
  const claim = raw.claim as ClaimInput | undefined;
  if (claim && claim.kind === 'count-compare') {
    out.push({
      id: 'claim',
      kind: 'claim',
      digest: digest(claim),
      summary: (claim.direction === 'most' ? '最多 ' : '最少 ') + claim.category
        + (claim.tiedWith && claim.tiedWith.length > 0 ? ' 并列 ' + claim.tiedWith.join('/') : ''),
    });
  }
  return out;
}

interface RawDuelArtifact {
  params?: Partial<DuelParams>;
  dataset?: { n?: number; wins?: number; seed?: number; winRate?: number; ci?: [number, number] };
  claim?: ClaimInput;
}

function duelArtifactSummaries(artifact: unknown): Verdict['artifacts'] {
  const raw = (artifact && typeof artifact === 'object' ? artifact : {}) as RawDuelArtifact;
  const out: Verdict['artifacts'] = [];
  const params = raw.params;
  if (params && typeof params.attack === 'number' && typeof params.defense === 'number'
    && typeof params.economy === 'number') {
    out.push({
      id: 'params',
      kind: 'params',
      digest: digest(params),
      summary: '攻 ' + params.attack + ' / 守 ' + params.defense + ' / 经 ' + params.economy,
    });
  }
  const dataset = raw.dataset;
  if (dataset && typeof dataset.n === 'number' && dataset.n > 0) {
    out.push({
      id: 'dataset',
      kind: 'dataset',
      digest: digest({ n: dataset.n, wins: dataset.wins ?? 0, seed: dataset.seed ?? 0 }),
      summary: dataset.n + ' 局 · 胜率 ' + percent(dataset.winRate ?? 0),
    });
  }
  const claim = raw.claim;
  if (claim && claim.kind === 'stat' && claim.statistic === 'proportion') {
    out.push({
      id: 'claim',
      kind: 'claim',
      digest: digest(claim),
      summary: '胜率 ' + percent(claim.value) + ' · n=' + claim.n,
    });
  }
  return out;
}

function asParams(input: Partial<DuelParams> | undefined): DuelParams | undefined {
  if (!input) return undefined;
  const { attack, defense, economy } = input;
  if (typeof attack !== 'number' || typeof defense !== 'number' || typeof economy !== 'number') return undefined;
  if (!Number.isInteger(attack) || !Number.isInteger(defense) || !Number.isInteger(economy)) return undefined;
  return { attack, defense, economy };
}

function validateTally(script: TallyScript, variant: RuntimeVariant, artifact: unknown): Verdict {
  const check = checkTallyArtifact(script, artifact);
  const artifacts = tallyArtifactSummaries(artifact);
  if (check.passed) {
    return {
      passed: true,
      stamps: variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer'],
      missingEvidence: [],
      artifacts,
      metrics: check.metrics,
    };
  }
  return {
    passed: false,
    stamps: [],
    failure: {
      class: check.failureClass ?? 'probe-tally-wrong',
      variantId: variant.id,
      causes: check.causes,
    },
    missingEvidence: [],
    artifacts,
    metrics: check.metrics,
  };
}

function validateDuel(script: DuelScript, variant: RuntimeVariant, artifact: unknown): Verdict {
  const raw = (artifact && typeof artifact === 'object' ? artifact : {}) as RawDuelArtifact;
  const seedIndex = script.seedIndex;
  const seed = script.seeds[seedIndex] ?? script.seeds[0] ?? 1;
  const isTransfer = variant.axis === 'transfer';
  const check = checkDuelArtifact(script, {
    params: asParams(raw.params),
    dataset: raw.dataset,
    claim: raw.claim,
    seed,
    checkClaim: !isTransfer,
  });
  const artifacts = duelArtifactSummaries(artifact);
  if (check.passed) {
    return {
      passed: true,
      stamps: isTransfer ? ['argument', 'transfer'] : ['argument'],
      missingEvidence: [],
      artifacts,
      metrics: check.metrics,
    };
  }
  let failureClass = check.failureClass ?? 'exp-not-run';
  if (isTransfer && failureClass === 'exp-below-baseline') failureClass = 'exp-overfit-seed';
  return {
    passed: false,
    stamps: [],
    failure: { class: failureClass, variantId: variant.id, causes: check.causes },
    missingEvidence: [],
    artifacts,
    metrics: check.metrics,
  };
}

export function validateArtifact(
  detail: LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): Verdict {
  const script = applyVariant(parseScript(detail.levelScript), variant);
  if (script.mode === 'tally') return validateTally(script, variant, artifact);
  return validateDuel(script, variant, artifact);
}

function tallyActions(script: TallyScript, artifact: unknown): LevelAction[] {
  const raw = (artifact ?? {}) as RawTallyArtifact;
  const counts = (raw.tally?.counts ?? raw.dataset?.counts ?? truthCounts(script)) as Record<string, number>;
  const actions: LevelAction[] = [];
  // 与界面一致：一次「全部倒出来」就把整筐采完（payload.n 交给运行时按剩余量切片）。
  actions.push({ type: 'probe/sample', payload: { n: script.items.length } });
  actions.push({ type: 'probe/tally', payload: { counts: { ...counts } } });
  const claim = raw.claim as ClaimInput | undefined;
  if (claim) actions.push({ type: 'probe/claim', payload: { claim } });
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

function duelActions(script: DuelScript, artifact: unknown): LevelAction[] {
  const raw = (artifact ?? {}) as RawDuelArtifact;
  const params = asParams(raw.params) ?? script.initialParams ?? { attack: 0, defense: 0, economy: script.resources };
  const actions: LevelAction[] = [];
  for (const key of ['attack', 'defense', 'economy'] as const) {
    actions.push({ type: 'knob/set', payload: { key, value: params[key] } });
  }
  // 唯一的运行入口：knob/run 同时锁定配置并按 script.matches 跑满（界面不再有「锁定配置」按钮）。
  actions.push({ type: 'knob/run', payload: {} });
  const claim = raw.claim;
  if (claim) actions.push({ type: 'probe/claim', payload: { claim } });
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function actionsFor(
  detail: LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): LevelAction[] {
  const script = applyVariant(parseScript(detail.levelScript), variant);
  return script.mode === 'tally' ? tallyActions(script, artifact) : duelActions(script, artifact);
}

export function summarizeArtifact(detail: LevelDetail, artifact: unknown): Verdict['artifacts'] {
  const script = parseScript(detail.levelScript);
  return script.mode === 'tally' ? tallyArtifactSummaries(artifact) : duelArtifactSummaries(artifact);
}

export function reachableFailureClasses(detail: LevelDetail): string[] {
  const script = parseScript(detail.levelScript);
  return script.mode === 'tally' ? [...TALLY_FAILURE_CLASSES] : [...DUEL_FAILURE_CLASSES];
}

/**
 * 迁移门：tally 只换外观（不做 transfer）；duel 换到 B 种子再验一次胜率基线。
 */
export function transferVariants(detail: LevelDetail): RuntimeVariant[] {
  const script = parseScript(detail.levelScript);
  if (script.mode !== 'duel') return [];
  if (script.seeds.length < 2) return [];
  return [{ id: 'v-seed-b', axis: 'transfer', patch: { seedIndex: 1 } }];
}

export function transferFailureClass(detail: LevelDetail): string {
  const script = parseScript(detail.levelScript);
  return script.mode === 'duel' ? 'exp-overfit-seed' : 'transfer-failed';
}

/** 校验脚本自身与内容一致（供 content:check / 测试使用）。 */
export function scriptIssues(script: ExperimentScript): string[] {
  const issues: string[] = [];
  if (script.mode === 'tally') {
    const known = new Set(script.categories.map((category) => category.id));
    for (const item of script.items) {
      if (!known.has(item)) issues.push('items 里有未登记的类别：' + item);
    }
    const truth = truthCounts(script);
    for (const category of script.categories) {
      if ((truth[category.id] ?? 0) !== category.count) {
        issues.push('类别数量与 items 不符：' + category.id + ' 声明 ' + category.count
          + '，实际 ' + (truth[category.id] ?? 0));
      }
    }
    const { most, least } = extremes(truth);
    if (most.length === 0) issues.push('items 为空');
    if (least.length === 0) issues.push('缺少最少类别');
  } else {
    if (!paramsValid(script, script.initialParams ?? undefined)) {
      const initial = script.initialParams;
      if (initial) issues.push('initialParams 不是合法配置');
    }
    for (const opponent of script.opponents) {
      if (opponent.attack + opponent.defense + opponent.economy !== 100) {
        issues.push('对手加点不等于 100：' + opponent.id);
      }
    }
    if (script.seeds.length < 2) issues.push('duel 至少需要 A/B 两个种子');
  }
  return issues;
}

/** 供测试/审计重算：给定参数与局数直接拿结果。 */
export function measureDuel(script: DuelScript, params: DuelParams, seedIndex = 0, n = script.matches) {
  const seed = script.seeds[seedIndex] ?? script.seeds[0] ?? 1;
  return simulateDuel(script, params, seed, n);
}
