import {
  LEVEL_DETAILS, LEVEL_IDS, LEVEL_SUMMARIES, LevelDetailSchema, LevelSummarySchema, SHIPPED_LEVEL_IDS,
} from '@mmf/content/full';
import { verifiers } from '@mmf/templates/verifiers';

/**
 * 内容体检：构建期唯一的"内容质量门"。
 * 这里只做**通用**检查——不写死某关的解法数值，避免内容一改脚本就红。
 * 语义检查（解/负例/变体可解性）在 audit-levels.ts，两者共用 templates 的 verifier。
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

const requireAll = process.argv.includes('--require-all');

/**
 * 面向 5–18 岁的文案禁词，分两级：
 * - HARD：伤害性评价、排名羞辱、贴标签——零容忍，出现即阻断；
 * - SOFT：把"必须/聪明/笨"这类词从儿童文案里清出去，但允许在描述规则时出现，
 *   所以只记警告。这样门禁不会因为一句"所有站点必须连起来"红掉，也不会把它们当不存在。
 */
const HARD_BANNED = [
  '失败', '惩罚', '笨蛋', '输了', '淘汰', '粗心', '扣分', '排名', '倒数',
];
const SOFT_BANNED = ['必须', '聪明', '笨'];
const CJK = /[\u4e00-\u9fff]/;

const summaryById = new Map(LEVEL_SUMMARIES.map((s) => [s.id, s]));
const baseVariant = { id: 'base', axis: 'structure', patch: {} };

/** 玩家可见的英文文案字段：这些字段必须存在且零中文残留。 */
const EN_FIELDS = ['titleEn', 'thinkingTargetEn', 'introEn', 'promptEn', 'doneEn', 'retryEn'] as const;

function checkSummary(summary: { id: string; titleEn?: string; thinkingTargetEn?: string }): void {
  if (!summary.titleEn) fail(summary.id + ' 摘要缺少 titleEn');
  if (!summary.thinkingTargetEn) fail(summary.id + ' 摘要缺少 thinkingTargetEn');
}

/** 只扫玩家能看到的字段；levelScript 与内部 key 不在文案审计范围内。 */
function visibleTexts(detail: {
  title: string; titleEn?: string; thinkingTarget: string; thinkingTargetEn?: string;
  intro: string; introEn?: string; prompt: string; promptEn?: string;
  done: string; doneEn?: string; retry: string; retryEn?: string;
  feedback: Record<string, { messageKey: string; hintKey: string; focus: string }>;
  tools: { titleKey: string; descriptionKey: string }[];
}): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: 'title', text: detail.title },
    { where: 'thinkingTarget', text: detail.thinkingTarget },
    { where: 'intro', text: detail.intro },
    { where: 'prompt', text: detail.prompt },
    { where: 'done', text: detail.done },
    { where: 'retry', text: detail.retry },
  ];
  for (const [cls, copy] of Object.entries(detail.feedback)) {
    // feedback 的 messageKey/hintKey 在未接入 i18n 时可能直接是中文文案；
    // 文案审计只关心"玩家看到的那一句"，所以这里只扫 key 里已是中文的文本。
    out.push({ where: 'feedback.' + cls + '.message', text: copy.messageKey });
    out.push({ where: 'feedback.' + cls + '.hint', text: copy.hintKey });
  }
  for (const tool of detail.tools) {
    out.push({ where: 'tool.titleKey', text: tool.titleKey });
    out.push({ where: 'tool.descriptionKey', text: tool.descriptionKey });
  }
  return out;
}

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

  // ---- 身份与摘要/详情一致性 ----
  if (data.id !== id) fail(id + ' 详情 id 不一致');
  if (data.template !== summary.data.template) fail(id + ' 摘要/详情模板不一致');
  if (data.band !== summary.data.band || data.thread !== summary.data.thread) fail(id + ' 摘要/详情学段或主线不一致');
  if (data.title !== summary.data.title) fail(id + ' 摘要/详情标题不一致：' + summary.data.title + ' vs ' + data.title);
  if (data.titleEn !== summary.data.titleEn) fail(id + ' 摘要/详情英文标题不一致');
  const summaryTools = [...summary.data.tools].sort().join(',');
  const detailTools = data.tools.map((tool) => tool.kind).sort().join(',');
  if (summaryTools !== detailTools) fail(id + ' 摘要/详情工具不一致：' + summaryTools + ' vs ' + detailTools);

  // ---- 双语：英文字段必须齐全且零中文残留 ----
  for (const field of EN_FIELDS) {
    const value = data[field];
    if (!value) { fail(id + ' 缺少英文文案 ' + field); continue; }
    if (CJK.test(value)) fail(id + ' 英文文案 ' + field + ' 含中文：' + value);
  }
  checkSummary(summary.data);
  if (summary.data.thinkingTargetEn && CJK.test(summary.data.thinkingTargetEn)) {
    fail(id + ' 摘要 thinkingTargetEn 含中文：' + summary.data.thinkingTargetEn);
  }
  for (const text of EN_FIELDS.map((field) => data[field]).filter((v): v is string => Boolean(v))) {
    // 只拦 CJK 全角标点；弯引号 “” 与 en dash – 是合法英文排版，不算错。
    if (/[，。；：！？（）【】]/.test(text)) fail(id + ' 英文文案含全角标点：' + text);
  }

  // ---- 模板与内容 ----
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
  for (const tool of data.tools) {
    if (!tool.titleKey || !tool.descriptionKey) fail(id + ' 工具 ' + tool.kind + ' 缺少 titleKey/descriptionKey');
  }

  // ---- 解 / 负例 / 变体 ----
  if (data.solutions.length < 2) fail(id + ' 至少需要 2 条黄金解');
  const solutionIds = new Set<string>();
  for (const solution of data.solutions) {
    if (solutionIds.has(solution.id)) fail(id + ' 黄金解 id 重复：' + solution.id);
    solutionIds.add(solution.id);
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

  if (data.negativeSamples.length < 3) fail(id + ' 至少需要 3 条负例');
  const negativeIds = new Set<string>();
  for (const negative of data.negativeSamples) {
    if (negativeIds.has(negative.id)) fail(id + ' 负例 id 重复：' + negative.id);
    negativeIds.add(negative.id);
    const verdict = verifier.validateArtifact(data, baseVariant, negative.artifact);
    if (verdict.passed) fail(id + ' 负例居然通过：' + negative.id);
    else if (verdict.failure?.class !== negative.expectFailure) {
      fail(id + ' 负例失败类不符：' + negative.id + ' 期望 ' + negative.expectFailure + '，实际 ' + verdict.failure?.class);
    }
  }

  if (data.variants.length < 2) fail(id + ' 至少需要 2 个变体');
  const variantIds = new Set<string>();
  const axes = new Set<string>();
  for (const variant of data.variants) {
    if (variantIds.has(variant.id)) fail(id + ' 变体 id 重复：' + variant.id);
    variantIds.add(variant.id);
    axes.add(variant.axis);
    try {
      verifier.applyVariant(data, variant);
    } catch (cause) {
      fail(id + ' 变体补丁不可解析：' + variant.id + '（' + (cause instanceof Error ? cause.message : String(cause)) + '）');
    }
  }
  // docs/02 §7.5 只要求 ≥2 个变体且轴合法，并未要求覆盖多条不同的轴；
  // 这里只在"两个变体完全同轴"时提醒，避免凭空加硬约束。
  if (axes.size < 2) warn(id + ' 两个变体使用同一条轴（' + [...axes].join('、') + '），建议至少换一条轴');

  // ---- 反馈覆盖 ----
  const reachable = verifier.reachableFailureClasses(data);
  const feedbackKeys = new Set(Object.keys(data.feedback));
  for (const failure of reachable) {
    if (!feedbackKeys.has(failure)) fail(id + ' 缺少失败类反馈：' + failure);
  }
  for (const [cls, copy] of Object.entries(data.feedback)) {
    if (!/^[\w.-]+$/.test(copy.messageKey)) {
      // 模板允许把中文句子直接当 key（未接入 i18n 时的过渡写法）。
      // 这类 key 在英文界面会漏出中文，先记为警告而不是硬错误，等 i18n 收口后升级为错误。
      if (CJK.test(copy.messageKey)) warn(id + ' feedback.' + cls + '.messageKey 不是 i18n key：' + copy.messageKey);
    }
    if (!copy.messageKey || !copy.hintKey || !copy.focus) fail(id + ' feedback.' + cls + ' 字段不完整');
  }
  const covered = new Set(data.negativeSamples.map((n) => n.expectFailure));
  if (covered.size < 3) fail(id + ' 负例覆盖的失败类少于 3 个');

  // ---- 证据计划 ----
  if (data.evidencePlan.length < 2) fail(id + ' 证据计划少于 2 个阶段');
  const phaseIds = new Set<string>();
  for (const checkpoint of data.evidencePlan) {
    if (phaseIds.has(checkpoint.id)) fail(id + ' 证据检查点 id 重复：' + checkpoint.id);
    phaseIds.add(checkpoint.id);
    if (!checkpoint.require.trim()) fail(id + ' 证据检查点 ' + checkpoint.id + ' 的 require 为空');
    if (!checkpoint.descriptionKey.trim()) fail(id + ' 证据检查点 ' + checkpoint.id + ' 的描述为空');
  }
  if (!data.manualAudit?.reviewed) fail(id + ' 缺少 A5/A10 人工复核记录');
  if (data.manualAudit && !/^\d{4}-\d{2}-\d{2}/.test(data.manualAudit.reviewedAt)) {
    fail(id + ' manualAudit.reviewedAt 不是 ISO 日期：' + data.manualAudit.reviewedAt);
  }

  // ---- 文案 ----
  for (const { where, text } of visibleTexts(data)) {
    for (const word of HARD_BANNED) {
      if (text.includes(word)) fail(id + ' 文案出现伤害性词 "' + word + '"（' + where + '）：' + text);
    }
    for (const word of SOFT_BANNED) {
      if (text.includes(word)) warn(id + ' 文案建议替换 "' + word + '"（' + where + '）：' + text);
    }
  }
  for (const text of [summary.data.thinkingTarget, summary.data.title]) {
    for (const word of HARD_BANNED) {
      if (text.includes(word)) fail(id + ' 摘要文案出现伤害性词 "' + word + '"：' + text);
    }
    for (const word of SOFT_BANNED) {
      if (text.includes(word)) warn(id + ' 摘要文案建议替换 "' + word + '"：' + text);
    }
  }

  ok(id + ' 通过（' + data.solutions.length + ' 解 / ' + data.negativeSamples.length + ' 负例 / ' + data.variants.length + ' 变体）');
}

// ---- 矩阵层：已发布子集、未发布引用、目标矩阵 ----
const shipped = new Set<string>(SHIPPED_LEVEL_IDS);
const published = new Set<string>();
for (const summary of LEVEL_SUMMARIES) {
  if (published.has(summary.id)) fail(summary.id + ' 摘要重复');
  published.add(summary.id);
  if (!shipped.has(summary.id)) fail(summary.id + ' 已发布摘要但不在 SHIPPED_LEVEL_IDS');
  const unlock = summary.unlock?.after ?? [];
  for (const after of unlock) {
    if (after === summary.id) fail(summary.id + ' unlock 引用了自己');
    else if (!LEVEL_IDS.includes(after)) fail(summary.id + ' unlock 引用了不存在的关卡 ' + after);
  }
}
for (const id of SHIPPED_LEVEL_IDS) {
  if (!published.has(id)) fail(id + ' 已发布但缺少摘要');
}

// 未发布关卡的摘要文件不应存在，避免"文件在但没注册"的幽灵内容。
const missingTarget = LEVEL_IDS.filter((id) => !shipped.has(id));
console.log('\n目标矩阵：' + (LEVEL_IDS.length - missingTarget.length) + '/' + LEVEL_IDS.length + ' 已发布；其余 ' + missingTarget.length + ' 关在后续里程碑' + (requireAll ? '（已要求全量）' : '') + '。');
if (requireAll && missingTarget.length > 0) {
  fail('目标矩阵缺 ' + missingTarget.length + ' 关：' + missingTarget.join('、'));
}

if (warnings > 0) console.warn('\n内容体检有 ' + warnings + ' 条警告（不阻断）。');
if (errors > 0) {
  console.error('\n内容校验失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n内容校验通过 ✅');
