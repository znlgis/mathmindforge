import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let errors = 0;
function ok(message) { console.log('  ✓ ' + message); }
function fail(message) { console.error('  ✗ ' + message); errors += 1; }
function readJson(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) { fail('缺少文件：' + rel); return null; }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (cause) { fail(rel + ' 不是合法 JSON：' + cause.message); return null; }
}

console.log('M0 打包/工程体检…');
const pkg = readJson('package.json');
const scripts = pkg?.scripts ?? {};
for (const name of ['dev', 'build', 'typecheck', 'lint', 'test', 'content:check', 'audit:levels', 'size', 'verify', 'e2e']) {
  if (scripts[name]) ok('pnpm ' + name);
  else fail('package.json 缺少脚本 ' + name);
}
if (existsSync(join(ROOT, 'pnpm-workspace.yaml'))) ok('pnpm workspace');
else fail('缺少 pnpm-workspace.yaml');
for (const rel of ['apps/site/index.html', 'apps/site/vite.config.ts', 'packages/canvas-kit/vendor/phaser-trim.esm.js', 'packages/canvas-kit/vendor/LICENSE.phaser.md']) {
  if (existsSync(join(ROOT, rel))) ok('存在 ' + rel);
  else fail('缺少 ' + rel);
}
const detail = readJson('packages/content/src/details/k-structure-pattern-path.level.json');
if (detail?.manualAudit?.reviewed === true) ok('首关有 A5/A10 人工复核记录');
else fail('首关缺少 manualAudit');

if (errors > 0) {
  console.error('\n工程体检失败：' + errors + ' 个问题');
  process.exit(1);
}
console.log('\n工程体检通过 ✅');
