import type { Locale, ToolId } from '@mmf/content/ids';
import type { LevelSummary } from '@mmf/content';
import type { DimensionView, ReportModel, TrailItem } from './types';

const TOOL_LABELS_EN: Record<ToolId, string> = {
  pattern: 'Pattern cards',
  rule: 'Rule cards',
  construct: 'Build blocks',
  knob: 'Parameter knobs',
  probe: 'Data probe',
  counter: 'Counterexample probe',
};

const PHASE_LABELS_EN: Record<string, string> = {
  observe: 'Observe',
  hypothesize: 'Hypothesize',
  construct: 'Build',
  run: 'Run',
  result: 'Result',
  revise: 'Revise',
  generalize: 'Transfer',
  argue: 'Argue',
};

const DIM_LABELS_EN: Record<string, string> = {
  structure: 'Structure',
  rule: 'Rule',
  model: 'Model',
  boundary: 'Boundary',
};

const DIM_TEXT_EN: Record<string, readonly [string, string, string, string]> = {
  structure: [
    'No observation record yet. Look and try before you build.',
    'You look before you act.',
    'You look before you act and can complete the structure main line.',
    'You can also apply the rule to a rotated map.',
  ],
  rule: [
    'No rule building yet. Start with a task that only needs order and repeat.',
    'You can build order and repeat into a rule.',
    'After a failure, you can look back and fix the step that does not hold.',
    'Your rule still holds on a rotated map.',
  ],
  model: [
    'No parameter tuning yet. Turn a knob and watch the numbers move.',
    'You tune parameters, read results, then decide the next step.',
    'You can bring the metrics into the target range.',
    'With another random seed, your plan still holds.',
  ],
  boundary: [
    'No payment or counterexample practice yet. Start with exact payment.',
    'You can pay exactly with limited materials.',
    'You look for counterexamples where the easy method fails.',
    'You can find a counterexample and use it in a new situation.',
  ],
};

const SIGNAL_LABELS_EN: Record<string, string> = {
  'structure-observe-coverage': 'Levels with observation records',
  'structure-mainline-completed': 'Structure main levels completed',
  'structure-transfer-stamps': 'Transfer stamps',
  'rule-levels-completed': 'Rule levels completed',
  'rule-revised-levels': 'Levels revised after failure',
  'rule-transfer-levels': 'Rule levels with transfer stamps',
  'rule-run-events': 'Program runs',
  'model-knob-probe-events': 'Parameter and data events',
  'model-levels-completed': 'Simulation / experiment levels completed',
  'model-multi-variant': 'Levels completed under another condition',
  'boundary-payment-completed': 'Payment level completed',
  'boundary-counterexamples': 'Valid counterexamples',
  'boundary-transfer-stamps': 'Transfer stamps',
};

const PRIVACY_EN = 'All data stays on this device. No accuracy rate, drill count or ranking.';

function titleOf(summaries: readonly LevelSummary[], levelId: string): string {
  const summary = summaries.find((item) => item.id === levelId);
  return summary?.titleEn ?? summary?.title ?? levelId;
}

function localizeDimension(dimension: DimensionView): DimensionView {
  return {
    ...dimension,
    label: DIM_LABELS_EN[dimension.id] ?? dimension.label,
    summary: DIM_TEXT_EN[dimension.id]?.[dimension.band] ?? dimension.summary,
    signals: dimension.signals.map((signal) => ({
      ...signal,
      label: SIGNAL_LABELS_EN[signal.id] ?? signal.label,
    })),
  };
}

export function localizeDimensions(dimensions: DimensionView[], locale: Locale): DimensionView[] {
  return locale === 'en' ? dimensions.map(localizeDimension) : dimensions;
}

export function localizeTrail(
  items: TrailItem[],
  summaries: readonly LevelSummary[],
  locale: Locale,
): TrailItem[] {
  if (locale !== 'en') return items;
  return items.map((item) => {
    const title = titleOf(summaries, item.levelId);
    const phaseLabel = PHASE_LABELS_EN[item.phase] ?? item.phase;
    const toolLabel = item.tool ? TOOL_LABELS_EN[item.tool] : undefined;
    let label = title + ' · ' + phaseLabel;
    if (toolLabel) label += ' · ' + toolLabel;
    if (item.action) label += ': ' + item.action;
    if (item.outcome === 'pass') label += ' (passed)';
    else if (item.outcome === 'fail') label += item.failureClass ? ' (failed: ' + item.failureClass + ')' : ' (failed)';
    return { ...item, title, phaseLabel, toolLabel, label };
  });
}

export function localizeReport(
  report: ReportModel,
  summaries: readonly LevelSummary[],
  locale: Locale,
): ReportModel {
  if (locale !== 'en') return report;
  return {
    ...report,
    nickname: report.nickname === '小工匠' ? 'Little Maker' : report.nickname,
    tools: report.tools.map((tool) => ({ ...tool, label: TOOL_LABELS_EN[tool.tool] ?? tool.label })),
    levels: report.levels.map((level) => ({ ...level, title: titleOf(summaries, level.levelId) })),
    dimensions: localizeDimensions(report.dimensions, locale),
    recommendations: report.recommendations.map((item) => ({
      ...item,
      title: titleOf(summaries, item.levelId ?? '') === (item.levelId ?? '')
        ? (item.title === '再做一次' ? 'Try again' : item.title === '换一种做法' ? 'Try another way' : item.title)
        : titleOf(summaries, item.levelId ?? ''),
      reason: item.levelId
        ? 'Try this level next.'
        : (item.reason.includes('更快的做法') ? 'Pick a level you want to review and solve it faster than last time.' : 'Use another tool or transfer variant to push the weakest dimension.'),
    })),
    privacyNote: PRIVACY_EN,
  };
}
