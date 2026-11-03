import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { en, zhSourceEn } from '@mmf/i18n';

/**
 * 模板层不自带 i18n：它把中文整句放进 ActionResult.message / cause.messageKey，
 * 由 ToolDock 与工具面板的 t() 渲染。英文界面是否漏中文，取决于兜底表是否收录了这些整句。
 *
 * 这个测试钉住"模板里新增的静态整句必须同时给英文"，避免英文界面又漏中文。
 * 只检查**整句**：拼接片段（如 " / 守 "、" 条边 · 成本 "）带首尾空白或以逗号/斜杠等开头的，
 * 不是可查表的文案；这类片段要等模板改成整句模板后再收口（docs/10 §6）。
 */
/** 拼接片段：首尾有空白，或以标点开头/以"未说完"的标点结尾（句末。！？不算）。 */
const FRAGMENT = /^\s|\s$|^[，。、；：·/（）「」“”]|[，、；：/（]$/;
const EN = { ...zhSourceEn, ...en };

function templateSources(): string[] {
  const root = fileURLToPath(new URL('./', import.meta.url));
  return [
    'shared/runtime.ts', 'pattern/runtime.ts', 'pattern/logic.ts', 'pattern/scene.ts',
    'rule/runtime.ts', 'rule/logic.ts', 'rule/scene.ts',
    'construct/runtime.ts', 'construct/distribution.ts', 'construct/network-runtime.ts',
    'construct/schedule-runtime.ts', 'construct/frontier-runtime.ts', 'construct/engine.ts',
    'experiment/runtime.ts', 'experiment/tally.ts', 'experiment/duel.ts', 'experiment/logic.ts',
    'experiment/sampling-runtime.ts', 'experiment/inference-runtime.ts',
    'simulate/runtime.ts', 'simulate/queue-runtime.ts', 'simulate/logic.ts',
    'argue/runtime.ts', 'argue/logic.ts',
  ].map((rel) => root + rel);
}

describe('模板文案的英文覆盖', () => {
  it('模板里的中文整句都在英文兜底表里', () => {
    const missing: string[] = [];
    for (const file of templateSources()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/['"]([^'"\n]*[\u4e00-\u9fff][^'"\n]*)['"]/g)) {
        const text = match[1] as string;
        if (text.length < 4 || FRAGMENT.test(text) || EN[text]) continue;
        missing.push(text + '（' + file.split(/[\\/]/).pop() + '）');
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
