import { LEVEL_DETAILS, SHIPPED_LEVEL_IDS } from '@mmf/content/full';
import { runtimes, verifiers } from '@mmf/templates/verifiers';
import type { EvidenceDraft, LevelAction } from '@mmf/game-kit';

/**
 * 反刷题审计（自动项）。docs/01 §8.1 / docs/02 §14.4 是口径：
 * A1 无工具提交必须被拒且给出缺失证据；
 * A1b 产物被置空/结构合法但错误时必须被**结构反馈**拒绝（不能当成"缺证据"）；
 * A2 动作空间必须包含非选择动作（不是点选换皮）；
 * A3 至少 2 条有效解且产物互不相同；
 * A4 负例触发声明的失败类、反馈覆盖可达类、≥3 个失败类有负例；
 * A6 变体补丁可解析、迁移门逐条可过；
 * A8 证据计划 ≥2 阶段，且黄金解 autoplay 真的走到 passed；
 * A11 自动判题可达：autoplay 通关后 answerComplete 必须为 true，
 *     否则玩家填完答案宿主也不会判题（会自动判题的关卡不能只有"点完成"这一条路）。
 * A5/A10 是人工项，脚本只检查 manualAudit 记录存在。
 */

let errors = 0;
let warnings = 0;
function fail(message: string): void {
  console.error('  ✗ ' + message);
  errors += 1;
}
function warn(message: string): void {
  console.warn('  ! ' + message);
  warnings += 1;
}
function ok(message: string): void {
  console.log('  ✓ ' + message);
}

const baseVariant = { id: 'base', axis: 'structure', patch: {} };
const NOW = () => 1_700_000_000_000;

/** 纯"选择"动作：只有这些动作的关卡等于选择题换皮（A2 要拦的正是它）。 */
const CHOICE_ONLY = new Set(['submit', 'run', 'reset']);

function runtimeFor(detail: (typeof LEVEL_DETAILS)[keyof typeof LEVEL_DETAILS], onEvidence?: (draft: EvidenceDraft) => void) {
  const createRuntime = runtimes[detail.template];
  return createRuntime(detail, {
    seed: 101,
    now: NOW,
    locale: 'zh-CN',
    reducedMotion: true,
    onEvidence,
  });
}

for (const id of SHIPPED_LEVEL_IDS) {
  console.log('\n· ' + id);
  const detail = LEVEL_DETAILS[id];
  if (!detail) { fail(id + ' 缺少详情'); continue; }
  const verifier = verifiers[detail.template];
  const createRuntime = runtimes[detail.template];
  if (!verifier || !createRuntime) { fail(id + ' 模板没有 verifier/runtime：' + detail.template); continue; }

  // ---- A1 无工具提交：必须失败且给出缺失证据 ----
  const noToolRuntime = runtimeFor(detail);
  const noTool = await noToolRuntime.dispatch({ type: 'submit', payload: {} });
  if (noTool.verdict?.passed) fail(id + ' A1：无工具提交居然通过');
  else if ((noTool.verdict?.missingEvidence.length ?? 0) === 0) fail(id + ' A1：无工具提交没有给出缺失证据');
  else ok('A1 无工具提交被拒（' + noTool.verdict?.missingEvidence.length + ' 条缺失证据）');

  // ---- A3 多解：至少 2 条通过且产物互不相同 ----
  const passedSolutions = detail.solutions.filter((solution) =>
    verifier.validateArtifact(detail, baseVariant, solution.artifact).passed,
  );
  if (passedSolutions.length < 2) fail(id + ' A3：有效解少于 2 条（' + passedSolutions.length + '）');
  const artifacts = new Set(passedSolutions.map((solution) => JSON.stringify(solution.artifact)));
  if (passedSolutions.length >= 2 && artifacts.size < passedSolutions.length) {
    fail(id + ' A3：有效解有重复产物（' + artifacts.size + '/' + passedSolutions.length + ' 个不同）');
  }
  if (passedSolutions.length >= 2 && artifacts.size === passedSolutions.length) {
    ok('A3 有效解 ' + passedSolutions.length + ' 条且互不相同');
  }

  // ---- A2 动作空间：必须包含非选择动作 ----
  const actions = verifier.actionsFor(detail, baseVariant, detail.solutions[0]?.artifact ?? {});
  const nonSubmit = actions.filter((action: LevelAction) => !CHOICE_ONLY.has(action.type));
  const kinds = new Set(nonSubmit.map((action: LevelAction) => action.type));
  if (nonSubmit.length === 0) fail(id + ' A2：动作空间只有选择类动作（' + [...new Set(actions.map((a: LevelAction) => a.type))].join('、') + '）');
  else if (kinds.size < 2) warn(id + ' A2：非选择动作只有 ' + [...kinds].join('、') + ' 一种，建议至少两条操作路径');
  else ok('A2 动作空间含 ' + kinds.size + ' 种非选择动作、共 ' + nonSubmit.length + ' 步');

  // ---- A4 负例与反馈覆盖 ----
  for (const negative of detail.negativeSamples) {
    const verdict = verifier.validateArtifact(detail, baseVariant, negative.artifact);
    if (verdict.passed) fail(id + ' A4：负例通过 ' + negative.id);
    else if (verdict.failure?.class !== negative.expectFailure) {
      fail(id + ' A4：负例失败类不符 ' + negative.id + '（期望 ' + negative.expectFailure + '，实际 ' + verdict.failure?.class + '）');
    }
  }
  const reachable = verifier.reachableFailureClasses(detail);
  const feedbackKeys = new Set(Object.keys(detail.feedback));
  for (const failure of reachable) {
    if (!feedbackKeys.has(failure)) fail(id + ' A4：缺少反馈 ' + failure);
  }
  const covered = new Set(detail.negativeSamples.map((n) => n.expectFailure));
  if (covered.size < 3) fail(id + ' A4：负例覆盖的失败类少于 3 个');
  else ok('A4 负例覆盖 ' + covered.size + ' 个失败类');

  // ---- A6 变体：补丁可解析；迁移变体由 verifier 逐条验证 ----
  if (detail.variants.length < 2) fail(id + ' A6：变体少于 2 个');
  for (const variant of detail.variants) {
    try { verifier.applyVariant(detail, variant); } catch (cause) {
      fail(id + ' A6：变体补丁不可解析 ' + variant.id + '（' + (cause instanceof Error ? cause.message : String(cause)) + '）');
    }
  }
  const transfer = verifier.transferVariants?.(detail) ?? [];
  if (transfer.length > 0 && !detail.solutions[0]) fail(id + ' A6：迁移门存在但没有黄金解');
  for (const variant of transfer) {
    const verdict = verifier.validateArtifact(detail, variant, detail.solutions[0]?.artifact);
    if (!verdict.passed) fail(id + ' A6：迁移变体不可通过 ' + variant.id + '（' + (verdict.failure?.class ?? '?') + '）');
  }
  ok('A6 变体 ' + detail.variants.length + ' 个可解析' + (transfer.length ? '，迁移门 ' + transfer.length + ' 个' : ''));

  // ---- A1b 产物消费性：空/错误产物必须被结构反馈拒绝，不能当成缺证据 ----
  const wrong = verifier.validateArtifact(detail, baseVariant, {});
  if (wrong.passed) fail(id + ' A1b：空产物通过');
  else if (wrong.missingEvidence.length > 0) fail(id + ' A1b：空产物被当成缺证据');
  else ok('A1b 错误产物被结构反馈拒绝（' + wrong.failure?.class + '）');

  // ---- A5/A10 人工项：只查记录存在与日期合法 ----
  if (!detail.manualAudit?.reviewed) fail(id + ' A5/A10：缺人工复核记录');
  else if (!/^\d{4}-\d{2}-\d{2}/.test(detail.manualAudit.reviewedAt)) {
    fail(id + ' A5/A10：manualAudit.reviewedAt 不是 ISO 日期 ' + detail.manualAudit.reviewedAt);
  }

  // ---- A8 证据计划 + 黄金解真的能走通（运行时路径，不只看 validateArtifact） ----
  if (detail.evidencePlan.length < 2) fail(id + ' A8：证据计划少于 2 个阶段');
  const drafts: EvidenceDraft[] = [];
  const runtime = runtimeFor(detail, (draft) => drafts.push(draft));
  const auto = await runtime.autoplay();
  const snapshot = runtime.snapshot();
  if (!auto.ok) fail(id + ' A8：autoplay 返回失败（' + (auto.message ?? '?') + '）');
  else if (!auto.verdict?.passed) {
    fail(id + ' A8：autoplay 没通过（' + (auto.verdict?.failure?.class ?? 'missing-evidence') + '）');
  } else if (snapshot.phase !== 'passed') fail(id + ' A8：autoplay 通过但 phase=' + snapshot.phase);
  else {
    const unmet = detail.evidencePlan.filter((checkpoint) => !snapshot.checkpoints[checkpoint.id]);
    if (unmet.length > 0) fail(id + ' A8：通过后仍有未满足的证据检查点 ' + unmet.map((c) => c.id).join('、'));
    else if (drafts.length === 0) fail(id + ' A8：autoplay 全程没有产生证据草稿');
    else ok('A8 autoplay 走通（' + drafts.length + ' 条证据草稿，检查点全满足）');
  }

  // ---- A11 自动判题可达：宿主没有「完成」按钮了，answerComplete 必须真的会变 true ----
  if (snapshot.answerComplete !== true) {
    fail(id + ' A11：通关后 answerComplete=' + String(snapshot.answerComplete) + '（自动判题永远触发不了）');
  } else {
    ok('A11 自动判题可达（通关时 answerComplete=true）');
  }
}

if (warnings > 0) console.warn('\n关卡审计有 ' + warnings + ' 条警告（不阻断）。');
if (errors > 0) {
  console.error('\n关卡审计失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n关卡审计通过 ✅');
