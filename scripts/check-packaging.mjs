import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 工程/打包体检：只检查**仓库里真实存在的东西**。
 * 原生壳（Tauri/Capacitor）尚未创建，所以这里刻意不检查 tauri.conf.json / capacitor.config.ts：
 * 检查不存在的文件只会制造"永远红"或"永远假绿"，两者都坏。壳落地后把检查项加进来即可。
 */

const ROOT = process.cwd();
let errors = 0;
let warnings = 0;
function ok(message) { console.log('  ✓ ' + message); }
function fail(message) { console.error('  ✗ ' + message); errors += 1; }
function warn(message) { console.warn('  ! ' + message); warnings += 1; }
function readJson(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) { fail('缺少文件：' + rel); return null; }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (cause) { fail(rel + ' 不是合法 JSON：' + cause.message); return null; }
}

console.log('打包/工程体检…');

// ---- 1. 根脚本齐全 ----
const pkg = readJson('package.json');
const scripts = pkg?.scripts ?? {};
const REQUIRED_SCRIPTS = [
  'dev', 'build', 'typecheck', 'lint', 'test', 'content:check',
  'audit:levels', 'pack:check', 'size', 'verify', 'e2e', 'e2e:dist',
];
for (const name of REQUIRED_SCRIPTS) {
  if (scripts[name]) ok('pnpm ' + name);
  else fail('package.json 缺少脚本 ' + name);
}

// ---- 2. workspace 与站点产物入口 ----
if (existsSync(join(ROOT, 'pnpm-workspace.yaml'))) ok('pnpm workspace');
else fail('缺少 pnpm-workspace.yaml');

for (const rel of [
  'apps/site/index.html',
  'apps/site/vite.config.ts',
  'apps/site/package.json',
  'packages/canvas-kit/vendor/phaser-trim.esm.js',
  'packages/canvas-kit/vendor/LICENSE.phaser.md',
]) {
  if (existsSync(join(ROOT, rel))) ok('存在 ' + rel);
  else fail('缺少 ' + rel);
}

// 站点入口必须引 main.ts，且不能有外链（零联网）
const indexHtml = existsSync(join(ROOT, 'apps/site/index.html'))
  ? readFileSync(join(ROOT, 'apps/site/index.html'), 'utf8')
  : '';
if (indexHtml.includes('/src/main.ts')) ok('index.html 引用 /src/main.ts');
else fail('index.html 没有引用 /src/main.ts');
if (/https?:\/\//.test(indexHtml.replace(/http:\/\/www\.w3\.org[^"']*/g, ''))) {
  fail('index.html 含外链（违反零联网）');
} else {
  ok('index.html 无外链');
}

// ---- 3. 内容完整性：20 关都要有摘要/详情/英文/人工复核 ----
const ids = (() => {
  const source = readFileSync(join(ROOT, 'packages/content/src/ids.ts'), 'utf8');
  const block = /export const SHIPPED_LEVEL_IDS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
})();
if (ids.length === 0) fail('读不到 SHIPPED_LEVEL_IDS');
else ok('已发布关卡 ' + ids.length + ' 关');

const EN_FIELDS = ['titleEn', 'thinkingTargetEn', 'introEn', 'promptEn', 'doneEn', 'retryEn'];
for (const id of ids) {
  const summaryPath = 'packages/content/src/levels/' + id + '.json';
  const detailPath = 'packages/content/src/details/' + id + '.level.json';
  const summary = readJson(summaryPath);
  const detail = readJson(detailPath);
  if (!summary || !detail) continue;
  if (summary.id !== id) fail(id + ' 摘要 id 与文件名不一致');
  if (detail.id !== id) fail(id + ' 详情 id 与文件名不一致');
  if (detail.manualAudit?.reviewed !== true) fail(id + ' 缺少 A5/A10 人工复核记录');
  for (const field of EN_FIELDS) {
    if (!detail[field]) fail(id + ' 缺少英文字段 ' + field);
    else if (/[\u4e00-\u9fff]/.test(detail[field])) fail(id + ' 英文字段 ' + field + ' 含中文');
  }
  if (!summary.titleEn) fail(id + ' 摘要缺少 titleEn');
}

// ---- 4. 许可证与出处 ----
const license = existsSync(join(ROOT, 'packages/canvas-kit/vendor/LICENSE.phaser.md'))
  ? readFileSync(join(ROOT, 'packages/canvas-kit/vendor/LICENSE.phaser.md'), 'utf8')
  : '';
if (/MIT/i.test(license)) ok('Phaser 裁剪版保留 MIT 许可');
else fail('Phaser 裁剪版缺少 MIT 许可声明');

// ---- 5. 原生壳：不存在时给出明确提示（不算错，但要说清楚） ----
for (const rel of ['apps/desktop', 'apps/mobile']) {
  if (existsSync(join(ROOT, rel))) ok('原生壳目录存在 ' + rel);
  else warn('原生壳目录不存在 ' + rel + '（v1.1 计划，不参与本次体检）');
}

if (warnings > 0) console.warn('\n工程体检有 ' + warnings + ' 条提示。');
if (errors > 0) {
  console.error('\n工程体检失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n工程体检通过 ✅');
