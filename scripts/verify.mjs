import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = [
  { name: 'typecheck', command: 'pnpm typecheck' },
  { name: 'lint', command: 'pnpm lint' },
  { name: 'test', command: 'pnpm test' },
  { name: 'content:check', command: 'pnpm content:check' },
  { name: 'audit:levels', command: 'pnpm audit:levels' },
  { name: 'pack:check', command: 'pnpm pack:check' },
  { name: 'build', command: 'pnpm build' },
];
const COLORS = ['\u001b[36m', '\u001b[35m', '\u001b[33m', '\u001b[32m', '\u001b[34m', '\u001b[31m', '\u001b[90m'];
const RESET = '\u001b[0m';
const started = Date.now();

function run(name, command, color) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    const prefix = color + '[' + name + ']' + RESET + ' ';
    const pipe = (stream) => {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) process.stdout.write(prefix + line + '\n');
      });
      stream.on('end', () => { if (buffer.length > 0) process.stdout.write(prefix + buffer + '\n'); });
    };
    pipe(child.stdout);
    pipe(child.stderr);
    child.on('error', (error) => {
      console.error(prefix + '无法启动：' + error.message);
      resolvePromise({ name, code: 1, ms: Date.now() - started });
    });
    child.on('close', (code) => resolvePromise({ name, code: code ?? 1, ms: Date.now() - started }));
  });
}

console.log('▶ 并行门禁：' + STEPS.map((step) => step.name).join(' / '));
const results = await Promise.all(STEPS.map((step, index) => run(step.name, step.command, COLORS[index % COLORS.length])));
const failed = results.filter((result) => result.code !== 0);
if (failed.length > 0) {
  console.error('\n✗ 门禁失败：' + failed.map((result) => result.name + ' (exit ' + result.code + ')').join('、'));
  process.exit(1);
}

const size = await run('size', 'pnpm size', COLORS[0]);
if (size.code !== 0) {
  console.error('\n✗ 体积门禁失败');
  process.exit(1);
}
console.log('\n✅ 全部门禁通过（' + ((Date.now() - started) / 1000).toFixed(1) + 's）');
