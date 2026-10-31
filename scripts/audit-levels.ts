import { LEVEL_DETAILS, SHIPPED_LEVEL_IDS } from '@mmf/content/full';
import { createPatternRuntime } from '@mmf/templates/pattern.runtime';
import {
  FAILURE_CLASSES, applyVariant, parseScript, reachableFailureClasses, validateArtifact,
} from '@mmf/templates/pattern.logic';
import type { PatternVariant } from '@mmf/templates/pattern.logic';

let errors = 0;
function fail(message: string): void {
  console.error('  ✗ ' + message);
  errors += 1;
}
function ok(message: string): void {
  console.log('  ✓ ' + message);
}

for (const id of SHIPPED_LEVEL_IDS) {
  console.log('\n· ' + id);
  const detail = LEVEL_DETAILS[id];
  if (!detail) {
    fail(id + ' 缺少详情');
    continue;
  }
  const script = parseScript(detail.levelScript);
  const baseVariant: PatternVariant = { id: 'base', axis: 'structure', patch: {} };

  // A1 无工具提交：必须失败且给出缺失证据
  const runtime = createPatternRuntime(detail, {
    seed: 101,
    now: () => 1_700_000_000_000,
    locale: 'zh-CN',
    reducedMotion: true,
  });
  const noTool = await runtime.dispatch({ type: 'submit', payload: {} });
  if (noTool.verdict?.passed) fail(id + ' A1：无工具提交居然通过');
  else if ((noTool.verdict?.missingEvidence.length ?? 0) === 0) fail(id + ' A1：无工具提交没有给出缺失证据');
  else ok('A1 无工具提交被拒（' + noTool.verdict?.missingEvidence.length + ' 条缺失证据）');

  // A3 多解
  const passed = detail.solutions.filter((solution) =>
    validateArtifact(script, baseVariant, solution.artifact).passed,
  );
  if (passed.length < 2) fail(id + ' A3：有效解少于 2 条（' + passed.length + '）');
  else ok('A3 有效解 ' + passed.length + ' 条');

  // A4 负例与反馈覆盖
  for (const negative of detail.negativeSamples) {
    const verdict = validateArtifact(script, baseVariant, negative.artifact);
    if (verdict.passed) fail(id + ' A4：负例通过 ' + negative.id);
    else if (verdict.failure?.class !== negative.expectFailure) {
      fail(id + ' A4：负例失败类不符 ' + negative.id + '（期望 ' + negative.expectFailure + '，实际 ' + verdict.failure?.class + '）');
    }
  }
  const reachable = reachableFailureClasses(script);
  const feedbackKeys = new Set(Object.keys(detail.feedback));
  for (const failure of reachable) {
    if (!feedbackKeys.has(failure)) fail(id + ' A4：缺少反馈 ' + failure);
  }
  const covered = new Set(detail.negativeSamples.map((n) => n.expectFailure));
  if (covered.size < 3) fail(id + ' A4：负例覆盖的失败类少于 3 个');
  else ok('A4 负例覆盖 ' + covered.size + ' 个失败类');

  // A6 变体
  if (detail.variants.length < 2) fail(id + ' A6：变体少于 2 个');
  for (const variant of detail.variants) {
    applyVariant(script, variant);
    const verdict = validateArtifact(script, variant as PatternVariant, detail.solutions[0]?.artifact);
    if (!verdict.passed) fail(id + ' A6：变体不可通过 ' + variant.id);
  }
  ok('A6 变体 ' + detail.variants.length + ' 个可解');

  // A1b 产物消费性：合法但错误的产物必须被拒，且不是 missing-evidence
  const wrongArtifact = {
    patternRule: { tokens: ['A', 'B'], period: 2, transform: 'none' },
    repair: [],
  };
  const wrong = validateArtifact(script, baseVariant, wrongArtifact);
  if (wrong.passed) fail(id + ' A1b：错误产物通过');
  else if (wrong.missingEvidence.length > 0) fail(id + ' A1b：错误产物被当成缺证据');
  else ok('A1b 错误产物被结构反馈拒绝（' + wrong.failure?.class + '）');

  // A8 证据计划
  if (detail.evidencePlan.length < 2) fail(id + ' A8：证据计划少于 2 个阶段');
  if (!detail.manualAudit?.reviewed) fail(id + ' A5/A10：缺人工复核记录');

  // 失败类清单存在（模板自检）
  if (FAILURE_CLASSES.length < 3) fail(id + ' 模板失败类过少');
}

if (errors > 0) {
  console.error('\n关卡审计失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n关卡审计通过 ✅');
