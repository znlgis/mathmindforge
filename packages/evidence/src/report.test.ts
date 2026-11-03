import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import type { LevelId, ToolId } from '@mmf/content/ids';
import { LEVEL_SUMMARIES } from '@mmf/content';
import type { EvidenceEvent, LevelProgress, SaveData, ToolUsage } from '@mmf/game-kit';
import { buildReport, parseReportPack, toReportPack } from './report';

const NOW = 1_700_000_000_000;

/** 本地空档：不依赖 @mmf/progress（依赖图见 docs/02 §3.1）。 */
function emptySave(): SaveData {
  const levels = {} as Record<LevelId, LevelProgress>;
  for (const levelId of LEVEL_IDS) {
    levels[levelId] = {
      levelId,
      completed: false,
      completedVariants: [],
      stamps: [],
      attempts: 0,
      lastPlayedAt: null,
    };
  }
  const tools = {} as Record<ToolId, ToolUsage>;
  for (const tool of TOOL_IDS) tools[tool] = { uses: 0, lastUsedAt: null };
  return {
    schemaVersion: 1,
    updatedAt: NOW,
    profile: { id: 'local-default', nickname: '小工匠', startBand: 'k', createdAt: NOW },
    levels,
    tools,
    badges: {},
    journal: [],
  };
}

function event(levelId: LevelId, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    v: 1,
    id: 'ev-1',
    at: NOW,
    profileId: 'local-default',
    levelId,
    phase: 'observe',
    variantId: 'base',
    action: '看一格',
    ...overrides,
  };
}

function samplePack(): Record<string, unknown> {
  const report = buildReport(emptySave(), [], LEVEL_SUMMARIES, NOW);
  return toReportPack(report) as unknown as Record<string, unknown>;
}

describe('buildReport 确定性', () => {
  it('同一输入两次生成完全相等，且不修改存档与事件', () => {
    const save = emptySave();
    const events = [event('k-data-tally'), event('k-data-tally', { at: NOW + 1, id: 'ev-2' })];
    const saveSnapshot = JSON.stringify(save);
    const eventsSnapshot = JSON.stringify(events);

    const first = buildReport(save, events, LEVEL_SUMMARIES, NOW);
    const second = buildReport(save, events, LEVEL_SUMMARIES, NOW);

    expect(second).toEqual(first);
    expect(JSON.stringify(save)).toBe(saveSnapshot);
    expect(JSON.stringify(events)).toBe(eventsSnapshot);
    expect(first.generatedAt).toBe(NOW);
  });

  it('导出的证据包可以再导入，且不合并存档（只返回只读视图）', () => {
    const save = emptySave();
    const report = buildReport(save, [], LEVEL_SUMMARIES, NOW);
    const pack = toReportPack(report);
    const parsed = parseReportPack(JSON.parse(JSON.stringify(pack)));

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.generatedAt).toBe(NOW);
    expect(parsed?.levels).toHaveLength(pack.levels.length);
    // 导入是纯函数：本机存档不受影响。
    expect(save.levels['k-data-tally'].completed).toBe(false);
    expect(save.journal).toEqual([]);
  });
});

describe('parseReportPack 导入校验', () => {
  it('版本不是 1、缺 generatedAt、非对象都拒绝', () => {
    const pack = samplePack();
    expect(parseReportPack({ ...pack, version: 2 })).toBeNull();
    expect(parseReportPack({ ...pack, version: '1' })).toBeNull();
    expect(parseReportPack({ ...pack, generatedAt: Number.NaN })).toBeNull();
    expect(parseReportPack({ ...pack, generatedAt: 'now' })).toBeNull();
    expect(parseReportPack(null)).toBeNull();
    expect(parseReportPack([])).toBeNull();
    expect(parseReportPack('json')).toBeNull();
  });

  it('含 HTML 片段或脚本 URL 的包整包拒绝（docs/02 §16.2）', () => {
    const pack = samplePack();
    expect(parseReportPack({ ...pack, nickname: '<script>alert(1)</script>' })).toBeNull();
    expect(parseReportPack({
      ...pack,
      dimensions: [{ id: 'structure', band: 1, summary: '<img src=x onerror=alert(1)>' }],
    })).toBeNull();
    expect(parseReportPack({
      ...pack,
      recommendations: [{ title: '点我', reason: 'javascript:alert(1)' }],
    })).toBeNull();
  });

  it('数学文本里的 "a < b" 不应被误判成 HTML', () => {
    const pack = samplePack();
    const parsed = parseReportPack({
      ...pack,
      recommendations: [{ title: '比较大小', reason: '当 a < b 时成立。' }],
    });
    expect(parsed?.recommendations[0].reason).toBe('当 a < b 时成立。');
  });

  it('超过 512 KB 的包拒绝', () => {
    const huge = { ...samplePack(), junk: 'x'.repeat(513 * 1024) };
    expect(parseReportPack(huge)).toBeNull();
  });

  it('文本按码点截断，非法数值归一，缺字段收敛成空数组', () => {
    const parsed = parseReportPack({
      version: 1,
      generatedAt: NOW,
      nickname: '😀'.repeat(30),
      tools: [{ tool: 'knob', uses: Number.NaN }, { tool: 'probe', uses: -2 }, { tool: '' }],
      levels: [{ id: 'lv', title: '标'.repeat(100), completed: true, stamps: ['a', 'b'] }],
      dimensions: [{ id: 'structure', band: 9, summary: '摘'.repeat(500) }],
      recommendations: [{ title: '再做一次', reason: '换一种做法' }],
    } as unknown as Record<string, unknown>);

    expect(parsed).not.toBeNull();
    expect(Array.from(parsed?.nickname ?? '')).toHaveLength(12);
    expect(parsed?.tools).toEqual([
      { tool: 'knob', uses: 0 },
      { tool: 'probe', uses: 0 },
    ]);
    expect(Array.from(parsed?.levels[0].title ?? '')).toHaveLength(40);
    expect(parsed?.dimensions[0].band).toBe(3);
    expect(Array.from(parsed?.dimensions[0].summary ?? '')).toHaveLength(200);
  });
});
