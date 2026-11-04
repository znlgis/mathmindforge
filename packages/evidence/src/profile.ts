/**
 * 四维画像：把存档 + 证据事件折成结构 / 规则 / 模型 / 边界四句中文观察。
 *
 * 纪律（docs/07 §1.3）：
 * - 纯函数：不读时钟、不碰 DOM / 存储 / 网络，所有输入由调用方传入；
 * - 只描述行为，不给分数、正确率、刷题量或排名；
 * - 每一档都能由现有 6 关产生，不假设 20 关全部上线。
 *
 * now 由调用方传入：画像本身不落时间戳，保留形参以对齐 docs/07 §1.2 的签名。
 */
import type { LevelId, ToolId } from '@mmf/content/ids';
import { TOOL_IDS } from '@mmf/content/ids';
import type { EvidenceEvent, LevelProgress, SaveData } from '@mmf/game-kit';
import type { LevelSummary } from '@mmf/content';
import type {
  DimensionSignal,
  DimensionView,
  EvidenceDimensionId,
  EvidenceProfile,
  Recommendation,
} from './types';

type Band = 0 | 1 | 2 | 3;

const MAX_RECOMMENDATIONS = 3;
const TOP_BAND: Band = 3;

/** 四维标签。 */
const DIMENSION_LABELS: Record<EvidenceDimensionId, string> = {
  structure: '结构',
  rule: '规则',
  model: '模型',
  boundary: '边界',
};

/** 四维中文档位描述：数组索引即 band，句子只讲行为，不含数字。 */
const DIMENSION_TEXT: Record<EvidenceDimensionId, readonly [string, string, string, string]> = {
  structure: [
    '还没有留下观察记录，先在关卡里多看、多试，再动手也不迟。',
    '你会先观察再动手。',
    '你会先观察再动手，也能把结构主线走通。',
    '你会先观察再动手，也能把规则用到转过方向的地图上。',
  ],
  rule: [
    '还没开始拆规则，可以先从一个只靠顺序和重复就能解决的小任务入手。',
    '你能把顺序和重复拼成一条规则。',
    '你能在失败之后回看，并改掉规则里不成立的那一步。',
    '你的规则换一张转过方向的地图也站得住。',
  ],
  model: [
    '还没动过参数，先推一推旋钮，看看数字会怎么变。',
    '你会先调参数、看结果，再决定下一步。',
    '你能把指标调进要求范围里。',
    '换一组随机种子，你的方案依然稳定。',
  ],
  boundary: [
    '还没做过支付和反例的练习，可以从“钱要正好付清”开始。',
    '你能用有限的材料把账付清。',
    '你会主动去找那种让顺手的办法失效的反例。',
    '你既找得到反例，也能把它用到新的情境里。',
  ],
};

/** 防御性过滤：事件来自存储，坏行只跳过它自己。 */
function validEvents(events: readonly EvidenceEvent[]): EvidenceEvent[] {
  const out: EvidenceEvent[] = [];
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    out.push(event);
  }
  return out;
}

function levelState(save: SaveData, levelId: LevelId): LevelProgress | undefined {
  if (!save || typeof save !== 'object' || !save.levels) return undefined;
  if (!Object.prototype.hasOwnProperty.call(save.levels, levelId)) return undefined;
  return save.levels[levelId];
}

/**
 * 工具次数：证据事件优先；某件工具在事件里没有记录时，回落到存档里的使用次数。
 * 结果按次数降序，同分时按 TOOL_IDS 的固定顺序，保证渲染稳定。
 */
export function toolUseCounts(
  save: SaveData,
  events: readonly EvidenceEvent[],
): { tool: ToolId; count: number }[] {
  const fromEvents = new Map<ToolId, number>();
  for (const event of validEvents(events)) {
    const tool = event.tool;
    if (typeof tool !== 'string') continue;
    if (!(TOOL_IDS as readonly string[]).includes(tool)) continue;
    const typed = tool as ToolId;
    fromEvents.set(typed, (fromEvents.get(typed) ?? 0) + 1);
  }

  const rows: { tool: ToolId; count: number }[] = [];
  for (const tool of TOOL_IDS) {
    const stored = save && save.tools ? save.tools[tool] : undefined;
    const storedUses = stored && typeof stored.uses === 'number' && Number.isFinite(stored.uses)
      ? Math.max(0, Math.trunc(stored.uses))
      : 0;
    const eventUses = fromEvents.get(tool) ?? 0;
    const count = eventUses > 0 ? eventUses : storedUses;
    if (count > 0) rows.push({ tool, count });
  }
  rows.sort((a, b) => b.count - a.count || TOOL_IDS.indexOf(a.tool) - TOOL_IDS.indexOf(b.tool));
  return rows;
}

function lowestDimension(dimensions: readonly DimensionView[]): DimensionView | null {
  let lowest: DimensionView | null = null;
  for (const dimension of dimensions) {
    if (lowest === null || dimension.band < lowest.band) lowest = dimension;
  }
  if (lowest === null || lowest.band >= TOP_BAND) return null;
  return lowest;
}

/**
 * 推荐（docs/07 §1.5）：按摘要顺序找未完成关卡，最多 3 条；
 * 全部完成后改为“再做一次 / 换一种做法”，并指向目前最薄的一维。
 */
function buildRecommendations(
  summaries: readonly LevelSummary[],
  completed: ReadonlySet<LevelId>,
  dimensions: readonly DimensionView[],
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  if (summaries.length === 0) return recommendations;

  const pending = summaries.filter((summary) => !completed.has(summary.id));
  if (pending.length > 0) {
    for (const summary of pending.slice(0, MAX_RECOMMENDATIONS)) {
      recommendations.push({
        levelId: summary.id,
        title: '试试「' + summary.title + '」',
        reason: '这一关练的是：' + summary.thinkingTarget + '。',
      });
    }
    return recommendations;
  }

  recommendations.push({
    title: '再做一次',
    reason: '挑一关最想复盘的，用比上次更快的做法再来一遍，看看差别在哪。',
  });
  const lowest = lowestDimension(dimensions);
  recommendations.push(
    lowest
      ? { title: '换一种做法', reason: '换一种工具或迁移变体，把「' + lowest.label + '」这一维再往前推一档。' }
      : { title: '换一种做法', reason: '四维都已经走到最高档，可以打开报告，回看自己的思路轨迹。' },
  );
  return recommendations;
}

export function buildEvidenceProfile(
  save: SaveData,
  events: EvidenceEvent[],
  summaries: readonly LevelSummary[],
  _now: number,
): EvidenceProfile {
  const safeEvents = validEvents(events);
  const levels: Record<LevelId, LevelProgress> = save && save.levels
    ? save.levels
    : ({} as Record<LevelId, LevelProgress>);

  const completed = new Set<LevelId>();
  const transferred = new Set<LevelId>();
  let revisedCount = 0;
  for (const level of Object.values(levels)) {
    if (level?.completed !== true) continue;
    completed.add(level.levelId);
    if (Array.isArray(level.stamps) && level.stamps.includes('transfer')) transferred.add(level.levelId);
    if ((level.lastOutcome?.revisionCount ?? 0) > 0) revisedCount += 1;
  }

  const observed = new Set<string>();
  let counterexamplePasses = 0;
  let runEvents = 0;
  let knobProbeEvents = 0;
  for (const event of safeEvents) {
    if (event.phase === 'observe' && typeof event.levelId === 'string' && event.levelId.length > 0) {
      observed.add(event.levelId);
    }
    if (event.artifact?.kind === 'counterexample' && event.outcome === 'pass') counterexamplePasses += 1;
    if (event.phase === 'run') runEvents += 1;
    if (event.tool === 'knob' || event.tool === 'probe') knobProbeEvents += 1;
  }

  const structureLevels = summaries.filter((summary) => summary.thread === 'structure');
  const ruleLevels = summaries.filter((summary) => summary.thread === 'algorithm');
  const modelLevels = summaries.filter(
    (summary) => summary.template === 'simulate' || summary.template === 'experiment',
  );

  const completedStructure = structureLevels.filter((summary) => completed.has(summary.id)).length;
  const completedRule = ruleLevels.filter((summary) => completed.has(summary.id)).length;
  const completedModel = modelLevels.filter((summary) => completed.has(summary.id)).length;
  const ruleVariantLevels = ruleLevels.filter((summary) => {
    const state = levelState(save, summary.id);
    return completed.has(summary.id)
      && Array.isArray(state?.completedVariants)
      && (state?.completedVariants?.length ?? 0) > 0;
  }).length;
  // transferred 仍被结构/建模线消费，保留。
  void transferred;

  let multiVariantModel = 0;
  for (const summary of modelLevels) {
    const state = levelState(save, summary.id);
    if (state?.completed === true
      && Array.isArray(state.completedVariants)
      && state.completedVariants.length >= 2) {
      multiVariantModel += 1;
    }
  }

  const paymentCompleted = completed.has('g46-algorithm-payment');
  const anyTransfer = transferred.size > 0;

  const structureBand: Band = anyTransfer ? 3 : completedStructure > 0 ? 2 : observed.size > 0 ? 1 : 0;
  const ruleBand: Band = ruleVariantLevels > 0
    ? 3
    : completedRule > 0 && revisedCount > 0
      ? 2
      : completedRule > 0
        ? 1
        : 0;
  const modelBand: Band = multiVariantModel > 0 ? 3 : completedModel > 0 ? 2 : knobProbeEvents > 0 ? 1 : 0;
  const boundaryBand: Band = counterexamplePasses > 0 && anyTransfer
    ? 3
    : counterexamplePasses > 0
      ? 2
      : paymentCompleted
        ? 1
        : 0;

  const structureSignals: DimensionSignal[] = [
    {
      id: 'structure-observe-coverage',
      label: '有观察记录的关卡',
      value: observed.size,
      sample: summaries.length,
      band: observed.size > 0 ? 1 : 0,
    },
    {
      id: 'structure-mainline-completed',
      label: '完成的结构主线关卡',
      value: completedStructure,
      sample: structureLevels.length,
      band: completedStructure > 0 ? 2 : 0,
    },
    {
      id: 'structure-transfer-stamps',
      label: '迁移印章',
      value: transferred.size,
      sample: Math.max(completed.size, 1),
      band: anyTransfer ? 3 : 0,
    },
  ];

  const ruleSignals: DimensionSignal[] = [
    {
      id: 'rule-levels-completed',
      label: '完成的规则关',
      value: completedRule,
      sample: ruleLevels.length,
      band: completedRule > 0 ? 1 : 0,
    },
    {
      id: 'rule-revised-levels',
      label: '失败后修订过的关卡',
      value: revisedCount,
      sample: Math.max(completed.size, 1),
      band: completedRule > 0 && revisedCount > 0 ? 2 : 0,
    },
    {
      // rule 模板不再有迁移门（旋转是刚体变换，恒真，见 docs/12 遗留项 1），
      // 所以"带迁移印章的规则关"永远是 0。这里换成规则线真正可观测的信号：
      // 在多张地图上跑通过程序的关卡数（变体通行证里出现过的规则关）。
      id: 'rule-variant-levels',
      label: '在多张地图上跑通过程序的规则关',
      value: ruleVariantLevels,
      sample: ruleLevels.length,
      band: ruleVariantLevels > 0 ? 3 : 0,
    },
    {
      id: 'rule-run-events',
      label: '程序运行记录',
      value: runEvents,
      sample: Math.max(safeEvents.length, 1),
      band: completedRule > 0 && runEvents > 0 ? 1 : 0,
    },
  ];

  const modelSignals: DimensionSignal[] = [
    {
      id: 'model-knob-probe-events',
      label: '调节参数与采集数据',
      value: knobProbeEvents,
      sample: Math.max(safeEvents.length, 1),
      band: knobProbeEvents > 0 ? 1 : 0,
    },
    {
      id: 'model-levels-completed',
      label: '完成的模拟 / 实验关',
      value: completedModel,
      sample: modelLevels.length,
      band: completedModel > 0 ? 2 : 0,
    },
    {
      id: 'model-multi-variant',
      label: '换过条件仍完成的关卡',
      value: multiVariantModel,
      sample: Math.max(completedModel, 1),
      band: multiVariantModel > 0 ? 3 : 0,
    },
  ];

  const boundarySignals: DimensionSignal[] = [
    {
      id: 'boundary-payment-completed',
      label: '完成支付关',
      value: paymentCompleted ? 1 : 0,
      sample: 1,
      band: paymentCompleted ? 1 : 0,
    },
    {
      id: 'boundary-counterexamples',
      label: '找到的有效反例',
      value: counterexamplePasses,
      sample: 1,
      band: counterexamplePasses > 0 ? 2 : 0,
    },
    {
      id: 'boundary-transfer-stamps',
      label: '迁移印章',
      value: transferred.size,
      sample: 2,
      band: counterexamplePasses > 0 && anyTransfer ? 3 : 0,
    },
  ];

  const dimensions: DimensionView[] = [
    {
      id: 'structure',
      label: DIMENSION_LABELS.structure,
      band: structureBand,
      summary: DIMENSION_TEXT.structure[structureBand],
      signals: structureSignals,
    },
    {
      id: 'rule',
      label: DIMENSION_LABELS.rule,
      band: ruleBand,
      summary: DIMENSION_TEXT.rule[ruleBand],
      signals: ruleSignals,
    },
    {
      id: 'model',
      label: DIMENSION_LABELS.model,
      band: modelBand,
      summary: DIMENSION_TEXT.model[modelBand],
      signals: modelSignals,
    },
    {
      id: 'boundary',
      label: DIMENSION_LABELS.boundary,
      band: boundaryBand,
      summary: DIMENSION_TEXT.boundary[boundaryBand],
      signals: boundarySignals,
    },
  ];

  return {
    version: 1,
    dimensions,
    recommendations: buildRecommendations(summaries, completed, dimensions),
    toolUses: toolUseCounts(save, safeEvents),
    eventCount: safeEvents.length,
  };
}