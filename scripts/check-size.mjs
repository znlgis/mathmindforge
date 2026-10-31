import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps/site/dist');
const BUDGETS = {
  initialKb: 85,
  initialRawKb: 260,
  chunkKb: 280,
  chunkRawKb: 1100,
  distKb: 4000,
  assetKb: 200,
  assetsKb: 600,
};
const CODE = /\.(?:js|css)$/;
const ASSET = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav|m4a|mp4)$/i;
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gzipKb = (path) => kb(gzipSync(readFileSync(path)).length);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}
let failure = 0;
function check(label, actual, budget) {
  const pass = actual <= budget;
  if (!pass) failure += 1;
  console.log((pass ? '  ✓ ' : '  ✗ ') + label + '：' + actual + ' KB / 预算 ' + budget + ' KB');
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✗ 找不到 dist/index.html —— 先 pnpm build');
  process.exit(1);
}
const files = walk(DIST);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map((match) =>
    join(DIST, match[1]).replace(/\\/g, '/'),
  ),
);
const inlineBytes = [...html.matchAll(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/g)]
  .filter((match) => match[2].trim().length > 0)
  .reduce((sum, match) => sum + Buffer.byteLength(match[2], 'utf8'), 0);

console.log('首屏：');
let initialGzip = 0;
let initialRaw = inlineBytes;
for (const path of files) {
  if (!referenced.has(path.replace(/\\/g, '/'))) continue;
  const raw = statSync(path).size;
  const gz = gzipKb(path);
  initialGzip += gz;
  initialRaw += raw;
  console.log('  · ' + relative(DIST, path) + '  ' + gz + ' KB (gzip) / ' + kb(raw) + ' KB');
}
check('首屏 JS+CSS（gzip）', Math.round(initialGzip * 10) / 10, BUDGETS.initialKb);
check('首屏 JS+CSS（原始）', kb(initialRaw), BUDGETS.initialRawKb);

console.log('\n懒加载 chunk：');
let biggestGzip = { name: '(无)', size: 0 };
let biggestRaw = { name: '(无)', bytes: 0 };
for (const path of files) {
  if (!CODE.test(path) || referenced.has(path.replace(/\\/g, '/'))) continue;
  const raw = statSync(path).size;
  const gz = gzipKb(path);
  if (gz > biggestGzip.size) biggestGzip = { name: relative(DIST, path), size: gz };
  if (raw > biggestRaw.bytes) biggestRaw = { name: relative(DIST, path), bytes: raw };
  console.log('  · ' + relative(DIST, path) + '  ' + gz + ' KB (gzip) / ' + kb(raw) + ' KB');
}
check('最大懒加载 chunk（' + biggestGzip.name + '）', biggestGzip.size, BUDGETS.chunkKb);
check('最大懒加载 chunk 原始大小（' + biggestRaw.name + '）', kb(biggestRaw.bytes), BUDGETS.chunkRawKb);

const assets = files.filter((path) => ASSET.test(path));
console.log('\n非代码资源：' + assets.length + ' 个');
let assetsTotal = 0;
for (const path of assets) {
  const bytes = statSync(path).size;
  assetsTotal += bytes;
  check('资源 ' + relative(DIST, path), kb(bytes), BUDGETS.assetKb);
}
if (assets.length > 0) check('资源合计', kb(assetsTotal), BUDGETS.assetsKb);

const distTotal = files.reduce((sum, path) => sum + statSync(path).size, 0);
console.log('\ndist 共 ' + files.length + ' 个文件');
check('dist 原始大小', kb(distTotal), BUDGETS.distKb);

if (failure > 0) {
  console.error('\n体积超预算：' + failure + ' 项。要么优化，要么调整预算并写明原因。');
  process.exit(1);
}
console.log('\n体积在预算内 ✅');
