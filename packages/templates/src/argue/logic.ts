import type {
  ArtifactSummary, FailureCause, LevelAction, LevelDetail, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import type { RuntimeVariant } from '../shared/types';
import { argueScriptSchema } from './schema';
import type { ArgueScript } from './schema';
import { boardCounts, rotateRemoved, rotationFlipsColoring, warrantDecides } from './engine';
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
  // 选项表来自关卡脚本：模板不写死某一关的主张/依据/范围措辞，否则内容一换词就判定漂移。
  if (!script.claims.includes(argument.claim)) {
    return failure('argue-claim-unsupported', '这条主张不在这一关的选项里。');
  }
  if (argument.claim !== 'impossible') {
    return failure('argue-claim-unsupported', '这个图形确实拼不出来；主张选错了。');
  }
  if (counts.black !== actual.black || counts.white !== actual.white || counts.cells !== actual.cells) {
    return failure('argue-invariant-false', '统计数字和图形对不上：先重新数一遍黑白格。');
  }
  if (!script.warrants.includes(argument.warrant as ArgueScript['warrants'][number])) {
    return failure('argue-warrant-unsupported', '这条依据不在这一关的选项里。');
  }
  if (argument.warrant === 'coloring') {
    const evidence = argument.evidence ?? {};
    if (evidence.black !== actual.black || evidence.white !== actual.white) {
      return failure('argue-invariant-false', '染色证据没有挂上当前图形的黑白格数量。');
    }
    if (!warrantDecides('coloring', actual)) {
      return failure('argue-invariant-false', '黑白格数量相等时，染色法不能直接排除铺满。');
    }
  } else if (argument.warrant === 'parity' || argument.warrant === 'area') {
    // 奇偶与面积是同一个量：每块 1×2 骨牌都盖住 2 格，所以只由总格数的奇偶决定。
    // 以前 area 一律判「检验不了」，但它在奇数格棋盘上和奇偶一样成立——那不是思维陷阱，是命名陷阱。
    const evidence = argument.evidence ?? {};
    if (evidence.cells !== actual.cells) {
      return failure('argue-invariant-false', '奇偶证据的格子数不对。');
    }
    if (!warrantDecides(argument.warrant, actual)) {
      return failure('argue-invariant-false', '格子数是偶数，奇偶法不能直接排除。');
    }
  } else {
    return failure('argue-warrant-unsupported', '这条依据在这一关还检验不了，换一条能验证的。');
  }
  if (!script.scopes.includes(argument.scope)) {
    return failure('argue-scope-wrong', '适用范围不在这一关的选项里：这是 1×2 多米诺铺砌。');
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

/**
 * 黄金动作序列：和论证板的一次点击完全同构——数黑白格、选依据（其余自动补齐）、
 * 提交论证（幂等）、宿主完成。没有「先放一块骨牌」「先挂证据」「先选范围」这类仪式动作。
 */
export function actionsFor(
  input: ArgueScript | LevelDetail,
  _variant: RuntimeVariant,
  artifact: unknown,
): LevelAction[] {
  const script = 'levelScript' in input ? parseScript(input.levelScript) : input;
  const raw = artifact as { argument?: { warrant?: string } } | null;
  const wanted = raw?.argument?.warrant;
  const warrant = script.warrants.includes(wanted as ArgueScript['warrants'][number])
    ? (wanted as ArgueScript['warrants'][number])
    : script.warrants[0];
  return [
    { type: 'probe/sample', payload: {} },
    { type: 'argue/setWarrant', payload: { warrant } },
    { type: 'argue/commit', payload: {} },
    { type: 'submit', payload: {} },
  ];
}

export function reachableFailureClasses(_input?: ArgueScript | LevelDetail): string[] {
  return [...FAILURE_CLASSES];
}

/**
 * 迁移门只收「不改变棋盘染色」的旋转。
 *
 * 90°/270° 在偶数边棋盘上会把整张棋盘的棋盘染色翻转（黑白计数互换），任何计数型证书都会
 * 因为坐标系换色而失配——那是几何事实，不是论证不够一般。所以偶数边棋盘只留 180°
 * （它把 (x,y) 送到 (width-1-x, height-1-y)，奇偶差是偶数）。
 */
export function transferVariants(detail: LevelDetail): RuntimeVariant[] {
  const script = parseScript(detail.levelScript);
  const quarters: (1 | 2)[] = [1, 2];
  return quarters
    .filter((quarter) => !rotationFlipsColoring(script, quarter))
    .map((quarter) => ({ id: 'v-rotate-' + quarter * 90, axis: 'structure', patch: { rotate: quarter * 90 } }));
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
