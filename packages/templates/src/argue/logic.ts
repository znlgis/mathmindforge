import type {
  ArtifactSummary, FailureCause, LevelAction, LevelDetail, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import type { RuntimeVariant } from '../shared/types';
import { argueScriptSchema } from './schema';
import type { ArgueScript } from './schema';
import { boardCounts, rotateRemoved } from './engine';
import type { BoardCounts } from './engine';

export const FAILURE_CLASSES = [
  'argue-claim-unsupported',
  'argue-warrant-unsupported',
  'argue-invariant-false',
  'argue-evidence-missing',
  'argue-scope-wrong',
  'argue-not-general',
] as const;
export type ArgueFailureClass = (typeof FAILURE_CLASSES)[number];

export const BASE_VARIANT: RuntimeVariant = { id: 'base', axis: 'structure', patch: {} };

export function parseScript(input: unknown): ArgueScript {
  return argueScriptSchema.parse(input);
}

export function applyVariant(input: ArgueScript | LevelDetail, variant: RuntimeVariant): ArgueScript {
  const script = 'levelScript' in input ? parseScript(input.levelScript) : input;
  const quarter = Number(variant.patch?.rotate ?? 0);
  if (quarter === 90 || quarter === 1) return rotateRemoved(script, 1);
  if (quarter === 180 || quarter === 2) return rotateRemoved(script, 2);
  if (quarter === 270 || quarter === 3) return rotateRemoved(script, 3);
  return script;
}

function failure(classId: string, messageKey: string, ref = 'argument'): Verdict {
  const causes: FailureCause[] = [{ kind: 'claim', ref, messageKey }];
  return { passed: false, stamps: [], failure: { class: classId, causes }, missingEvidence: [], artifacts: [] };
}

export function summarizeArgument(_script: ArgueScript, artifact: unknown): ArtifactSummary[] {
  const raw = artifact as { counts?: BoardCounts; argument?: { claim?: string; warrant?: string; scope?: string } } | null;
  if (!raw || !raw.counts || !raw.argument) return [];
  return [
    {
      id: 'counts',
      kind: 'dataset',
      digest: digest(raw.counts),
      summary: raw.counts.black + ' 黑 / ' + raw.counts.white + ' 白 / ' + raw.counts.cells + ' 格',
    },
    {
      id: 'argument',
      kind: 'argument',
      digest: digest(raw.argument),
      summary: (raw.argument.claim ?? '?') + ' · ' + (raw.argument.warrant ?? '?') + ' · ' + (raw.argument.scope ?? '?'),
    },
  ];
}

export function validateArtifact(
  input: ArgueScript | LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): Verdict {
  const script = applyVariant(input, variant);
  const actual = boardCounts(script);
  const raw = artifact as {
    counts?: BoardCounts;
    argument?: {
      claim?: string;
      warrant?: string;
      scope?: string;
      evidence?: { black?: number; white?: number; cells?: number };
    };
  } | null;
  if (!raw || !raw.counts || !raw.argument) {
    return failure('argue-evidence-missing', '还缺一份论证证书：先统计黑白格，再选择主张与依据。');
  }
  const { argument, counts } = raw;
  if (!argument.claim || !argument.warrant || !argument.scope) {
    return failure('argue-evidence-missing', '论证还缺主张、依据或适用范围。');
  }
  if (argument.claim !== 'impossible') {
    return failure('argue-claim-unsupported', '这个图形确实拼不出来；主张选错了。');
  }
  if (counts.black !== actual.black || counts.white !== actual.white || counts.cells !== actual.cells) {
    return failure('argue-invariant-false', '统计数字和图形对不上：先重新数一遍黑白格。');
  }
  if (argument.warrant === 'coloring') {
    const evidence = argument.evidence ?? {};
    if (evidence.black !== actual.black || evidence.white !== actual.white) {
      return failure('argue-invariant-false', '染色证据没有挂上当前图形的黑白格数量。');
    }
    if (actual.black === actual.white) {
      return failure('argue-invariant-false', '黑白格数量相等时，染色法不能直接排除铺满。');
    }
  } else if (argument.warrant === 'parity') {
    const evidence = argument.evidence ?? {};
    if (evidence.cells !== actual.cells) {
      return failure('argue-invariant-false', '奇偶证据的格子数不对。');
    }
    if (actual.cells % 2 === 0) {
      return failure('argue-invariant-false', '格子数是偶数，奇偶法不能直接排除。');
    }
  } else {
    return failure('argue-warrant-unsupported', '这条依据在这一关还检验不了，换一条能验证的。');
  }
  if (argument.scope !== 'domino-tiling') {
    return failure('argue-scope-wrong', '适用范围要写明：这是 1×2 多米诺铺砌。');
  }
  const stamps: Verdict['stamps'] = ['argument'];
  if (variant.id !== 'base') stamps.push('transfer');
  return {
    passed: true,
    stamps,
    missingEvidence: [],
    artifacts: summarizeArgument(script, artifact),
  };
}

export function actionsFor(
  input: ArgueScript | LevelDetail,
  _variant: RuntimeVariant,
  artifact: unknown,
): LevelAction[] {
  const raw = artifact as { counts?: BoardCounts; argument?: { warrant?: string } } | null;
  const script = 'levelScript' in input ? parseScript(input.levelScript) : input;
  const first = script.board.removed.length > 0 ? script.board.removed[0] : { x: 0, y: 0 };
  const actions: LevelAction[] = [];
  // 先真的放一块多米诺（attempt 检查点），再由工具算证据、写证书。
  actions.push({
    type: 'construct/place',
    payload: { piece: { id: 'domino-0', shape: 'h', x: first.x + 1, y: first.y } },
  });
  actions.push({ type: 'probe/sample', payload: {} });
  actions.push({ type: 'argue/setClaim', payload: { claim: 'impossible' } });
  actions.push({ type: 'argue/setWarrant', payload: { warrant: raw?.argument?.warrant ?? 'coloring' } });
  actions.push({ type: 'argue/attachEvidence', payload: {} });
  actions.push({ type: 'argue/setScope', payload: { scope: 'domino-tiling' } });
  actions.push({ type: 'argue/commit', payload: {} });
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_input?: ArgueScript | LevelDetail): string[] {
  return [...FAILURE_CLASSES];
}

export function transferVariants(_detail: LevelDetail): RuntimeVariant[] {
  return [
    { id: 'v-rotate-90', axis: 'structure', patch: { rotate: 90 } },
    { id: 'v-rotate-180', axis: 'structure', patch: { rotate: 180 } },
  ];
}

export function transferFailureClass(_detail: LevelDetail): string {
  return 'argue-not-general';
}

export const argueVerifier = {
  parseScript,
  validateArtifact,
  actionsFor,
  applyVariant,
  reachableFailureClasses,
  transferVariants,
  transferFailureClass,
};
