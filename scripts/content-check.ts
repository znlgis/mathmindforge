import { LEVEL_IDS, SHIPPED_LEVEL_IDS } from '@mmf/content/full';
import { LEVEL_DETAILS, LEVEL_SUMMARIES, LevelDetailSchema, LevelSummarySchema } from '@mmf/content/full';
import { verifiers } from '@mmf/templates/verifiers';

let errors = 0;
function fail(message: string): void {
  console.error('  ✗ ' + message);
  errors += 1;
}
function ok(message: string): void {
  console.log('  ✓ ' + message);
}

const BANNED = ['失败', '惩罚', '笨蛋', '输了', '淘汰', '粗心', '扣分', '排名', '倒数'];
const summaryById = new Map(LEVEL_SUMMARIES.map((s) => [s.id, s]));
const baseVariant = { id: 'base', axis: 'structure', patch: {} };

console.log('校验已发布关卡：' + SHIPPED_LEVEL_IDS.join('、') + '\n');

for (const id of SHIPPED_LEVEL_IDS) {
  console.log('· ' + id);
  const rawSummary = summaryById.get(id);
  if (!rawSummary) { fail(id + ' 缺少摘要'); continue; }
  const summary = LevelSummarySchema.safeParse(rawSummary);
  if (!summary.success) {
    fail(id + ' 摘要 schema：' + summary.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('；'));
    continue;
  }
  const rawDetail = LEVEL_DETAILS[id];
  if (!rawDetail) { fail(id + ' 缺少详情'); continue; }
  const detail = LevelDetailSchema.safeParse(rawDetail);
  if (!detail.success) {
    fail(id + ' 详情 schema：' + detail.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('；'));
    continue;
  }
  const data = detail.data;
  if (data.id !== id) fail(id + ' 详情 id 不一致');
  if (data.template !== summary.data.template) fail(id + ' 摘要/详情模板不一致');
  if (data.band !== summary.data.band || data.thread !== summary.data.thread) fail(id + ' 摘要/详情学段或主线不一致');
  const summaryTools = [...summary.data.tools].sort().join(',');
  const detailTools = data.tools.map((tool) => tool.kind).sort().join(',');
  if (summaryTools !== detailTools) fail(id + ' 摘要/详情工具不一致：' + summaryTools + ' vs ' + detailTools);

  const verifier = verifiers[data.template];
  if (!verifier) { fail(id + ' 模板没有 verifier：' + data.template); continue; }

  try {
    verifier.parseScript(data.levelScript);
  } catch (cause) {
    fail(id + ' levelScript 解析失败：' + (cause instanceof Error ? cause.message : String(cause)));
    continue;
  }

  const required = new Set(data.tools.flatMap((tool) => tool.requiredArtifacts));
  for (const artifact of data.requiredToolArtifacts) {
    if (!required.has(artifact)) fail(id + ' 必用产物没有工具产出：' + artifact);
  }

  if (data.solutions.length < 2) fail(id + ' 至少需要 2 条黄金解');
  for (const solution of data.solutions) {
    const verdict = verifier.validateArtifact(data, baseVariant, solution.artifact);
    if (!verdict.passed) fail(id + ' 黄金解不通过：' + solution.id + '（' + (verdict.failure?.class ?? '?') + '）');
  }

  const transferVariants = verifier.transferVariants?.(data) ?? [];
  if (transferVariants.length > 0 && data.solutions[0]) {
    for (const variant of transferVariants) {
      const verdict = verifier.validateArtifact(data, variant, data.solutions[0].artifact);
      if (!verdict.passed) fail(id + ' 迁移变体不可通过：' + variant.id + '（' + (verdict.failure?.class ?? '?') + '）');
    }
  }

  for (const negative of data.negativeSamples) {
    const verdict = verifier.validateArtifact(data, baseVariant, negative.artifact);
    if (verdict.passed) fail(id + ' 负例居然通过：' + negative.id);
    else if (verdict.failure?.class !== negative.expectFailure) {
      fail(id + ' 负例失败类不符：' + negative.id + ' 期望 ' + negative.expectFailure + '，实际 ' + verdict.failure?.class);
    }
  }

  if (data.variants.length < 2) fail(id + ' 至少需要 2 个变体');
  for (const variant of data.variants) {
    try {
      verifier.applyVariant(data, variant);
    } catch (cause) {
      fail(id + ' 变体补丁不可解析：' + variant.id + '（' + (cause instanceof Error ? cause.message : String(cause)) + '）');
    }
  }

  const reachable = verifier.reachableFailureClasses(data);
  const feedbackKeys = new Set(Object.keys(data.feedback));
  for (const failure of reachable) {
    if (!feedbackKeys.has(failure)) fail(id + ' 缺少失败类反馈：' + failure);
  }
  const covered = new Set(data.negativeSamples.map((n) => n.expectFailure));
  if (covered.size < 3) fail(id + ' 负例覆盖的失败类少于 3 个');

  if (data.evidencePlan.length < 2) fail(id + ' 证据计划少于 2 个阶段');
  if (!data.manualAudit?.reviewed) fail(id + ' 缺少 A5/A10 人工复核记录');

  const fields = [data.intro, data.prompt, data.done, data.retry, summary.data.thinkingTarget];
  for (const text of fields) {
    for (const word of BANNED) {
      if (text.includes(word)) fail(id + ' 文案出现禁词 "' + word + '"');
    }
  }

  ok(id + ' 通过（' + data.solutions.length + ' 解 / ' + data.negativeSamples.length + ' 负例 / ' + data.variants.length + ' 变体）');
}

const shipped = new Set<string>(SHIPPED_LEVEL_IDS);
const missingTarget = LEVEL_IDS.filter((id) => !shipped.has(id));
console.log('\n目标矩阵：' + (LEVEL_IDS.length - missingTarget.length) + '/' + LEVEL_IDS.length + ' 已发布；其余 ' + missingTarget.length + ' 关在后续里程碑（--require-all 时才算错误）。');

if (errors > 0) {
  console.error('\n内容校验失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n内容校验通过 ✅');
