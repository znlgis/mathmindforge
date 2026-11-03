import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS, LEVEL_SUMMARIES, SHIPPED_LEVEL_IDS } from '@mmf/content/full';

/**
 * 关卡入口（games/forge/src/levels/<id>.ts）与内容的一致性守卫。
 *
 * 为什么静态读源码而不是 import：每个入口都 import 模板工厂，模板又会
 * import @mmf/canvas-kit → phaser（真实运行时依赖）。在 node 环境的单测里
 * 把 20 关连 Phaser 一起拉起来既慢又脆，而这里要验的只是 manifest 字面量，
 * 用源码解析足够。manifest 是**静态常量**，不是运行期计算结果。
 */

const LEVELS_DIR = fileURLToPath(new URL('./levels/', import.meta.url));
const FORGE_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url));

interface Manifest {
  id: string;
  band: string;
  thread: string;
  template: string;
  estimatedMinutes: number;
  hasCanvas: boolean;
  runEnabled: boolean;
}

function readManifest(id: string): Manifest {
  const source = readFileSync(LEVELS_DIR + id + '.ts', 'utf8');
  const block = /const manifest: LevelManifest = \{([\s\S]*?)\n\};/.exec(source);
  if (!block) throw new Error(id + ' 的 manifest 字面量没找到');
  const body = block[1];
  const str = (field: string): string => {
    const match = new RegExp(field + ":\\s*'([^']+)'").exec(body);
    if (!match) throw new Error(id + ' 的 manifest 缺少 ' + field);
    return match[1];
  };
  const num = (field: string): number => {
    const match = new RegExp(field + ':\\s*(\\d+)').exec(body);
    if (!match) throw new Error(id + ' 的 manifest 缺少 ' + field);
    return Number(match[1]);
  };
  const bool = (field: string): boolean => {
    const match = new RegExp(field + ':\\s*(true|false)').exec(body);
    if (!match) throw new Error(id + ' 的 manifest 缺少 ' + field);
    return match[1] === 'true';
  };
  return {
    id: str('id'),
    band: str('band'),
    thread: str('thread'),
    template: str('template'),
    estimatedMinutes: num('estimatedMinutes'),
    hasCanvas: bool('hasCanvas'),
    // runEnabled 可省略，默认 true（见 game-kit 的 LevelManifest 注释）。
    runEnabled: body.includes('runEnabled') ? bool('runEnabled') : true,
  };
}

const manifests = SHIPPED_LEVEL_IDS.map((id) => ({ id, manifest: readManifest(id) }));

describe('games/forge 关卡入口', () => {
  it('每关都有入口文件，manifest.id 与文件名一致', () => {
    for (const { id, manifest } of manifests) {
      expect(manifest.id, id + ' 的 manifest.id').toBe(id);
    }
  });

  it('manifest 的 band / thread / template 与内容摘要一致', () => {
    const summaryById = new Map(LEVEL_SUMMARIES.map((summary) => [summary.id, summary]));
    const drift: string[] = [];
    for (const { id, manifest } of manifests) {
      const summary = summaryById.get(id as never);
      if (!summary) { drift.push(id + ' 缺少摘要'); continue; }
      if (manifest.band !== summary.band) drift.push(id + ' band ' + manifest.band + ' != ' + summary.band);
      if (manifest.thread !== summary.thread) drift.push(id + ' thread ' + manifest.thread + ' != ' + summary.thread);
      if (manifest.template !== summary.template) drift.push(id + ' template ' + manifest.template + ' != ' + summary.template);
    }
    expect(drift).toEqual([]);
  });

  it('manifest 的 estimatedMinutes 与内容摘要一致', () => {
    const summaryById = new Map(LEVEL_SUMMARIES.map((summary) => [summary.id, summary]));
    const drift: string[] = [];
    for (const { id, manifest } of manifests) {
      const summary = summaryById.get(id as never);
      if (summary && manifest.estimatedMinutes !== summary.estimatedMinutes) {
        drift.push(id + ' manifest ' + manifest.estimatedMinutes + ' != content ' + summary.estimatedMinutes);
      }
    }
    expect(drift).toEqual([]);
  });

  it('hasCanvas 与模板的形态一致：只有 pattern / rule 需要画布', () => {
    // pattern 的带子与 rule 的地图住在 Phaser 场景里；construct / experiment /
    // argue / simulate 的正文由 ToolDock 的 Vue 面板承担（docs/02 §6.4）。
    const canvasTemplates = new Set(['pattern', 'rule']);
    const drift: string[] = [];
    for (const { id, manifest } of manifests) {
      const expected = canvasTemplates.has(manifest.template);
      if (manifest.hasCanvas !== expected) {
        drift.push(id + ' template=' + manifest.template + ' hasCanvas=' + manifest.hasCanvas);
      }
    }
    expect(drift).toEqual([]);
  });

  it('无画布关卡隐藏宿主的大"运行"按钮（由工具按钮自己运行）', () => {
    const drift: string[] = [];
    for (const { id, manifest } of manifests) {
      const expectedRun = manifest.hasCanvas;
      if (manifest.runEnabled !== expectedRun) {
        drift.push(id + ' hasCanvas=' + manifest.hasCanvas + ' runEnabled=' + manifest.runEnabled);
      }
    }
    expect(drift).toEqual([]);
  });

  it('package.json 的子路径导出覆盖全部已发布关卡，且没有多余条目', () => {
    const pkg = JSON.parse(readFileSync(FORGE_PACKAGE, 'utf8')) as { exports: Record<string, string> };
    const subpaths = Object.keys(pkg.exports)
      .filter((key) => key !== '.')
      .map((key) => key.replace(/^\.\//, ''));
    expect(subpaths.sort()).toEqual([...SHIPPED_LEVEL_IDS].sort());
    for (const id of SHIPPED_LEVEL_IDS) {
      expect(pkg.exports['./' + id]).toBe('./src/levels/' + id + '.ts');
    }
  });

  it('包级出口不 re-export 任何关卡模块（否则 20 关会挤进同一个 chunk）', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/export\s+\*/);
    expect(code).not.toMatch(/from\s+'\.\/levels\//);
  });
});

describe('关卡详情与入口的模板对应', () => {
  it('每关的详情 template 与 manifest template 一致', () => {
    const drift: string[] = [];
    for (const { id, manifest } of manifests) {
      const detail = LEVEL_DETAILS[id];
      if (detail.template !== manifest.template) {
        drift.push(id + ' detail=' + detail.template + ' manifest=' + manifest.template);
      }
    }
    expect(drift).toEqual([]);
  });
});
