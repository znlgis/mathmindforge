import { describe, expect, it } from 'vitest';
import {
  LEVEL_DETAILS, LEVEL_IDS, LEVEL_SUMMARIES, LevelDetailSchema, LevelSummarySchema, SHIPPED_LEVEL_IDS,
} from './full';
import { getLevelSummary, levelSummaries } from './summaries';
import { loadLevel } from './loadLevel';
import { localizedDetail, localizedSummary } from './localize';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
const EN_FIELDS = ['titleEn', 'thinkingTargetEn', 'introEn', 'promptEn', 'doneEn', 'retryEn'] as const;

describe('已发布关卡：摘要与详情一致', () => {
  it('每个已发布 id 都有摘要与详情，且顺序与 SHIPPED_LEVEL_IDS 一致', () => {
    expect(LEVEL_SUMMARIES.map((summary) => summary.id)).toEqual([...SHIPPED_LEVEL_IDS]);
    expect(Object.keys(LEVEL_DETAILS).sort()).toEqual([...SHIPPED_LEVEL_IDS].sort());
  });

  it('20 个目标关卡 id 全部已发布（M2 全量）', () => {
    expect([...SHIPPED_LEVEL_IDS].sort()).toEqual([...LEVEL_IDS].sort());
  });

  for (const id of SHIPPED_LEVEL_IDS) {
    it(id + ' 的摘要与详情在 id/band/thread/template/tools 上一致', () => {
      const summary = getLevelSummary(id);
      const detail = LEVEL_DETAILS[id];
      expect(summary).toBeDefined();
      expect(detail).toBeDefined();
      if (!summary || !detail) return;
      expect(detail.id).toBe(summary.id);
      expect(detail.band).toBe(summary.band);
      expect(detail.thread).toBe(summary.thread);
      expect(detail.template).toBe(summary.template);
      expect(detail.title).toBe(summary.title);
      expect(detail.thinkingTarget).toBe(summary.thinkingTarget);
      // 摘要 tools 是工具 id，详情 tools 是规格对象；两者的 kind 必须逐项对上。
      expect(detail.tools.map((tool) => tool.kind).sort()).toEqual([...summary.tools].sort());
    });
  }
});

describe('内容 schema', () => {
  it('全部摘要都能过 LevelSummarySchema（含 strict）', () => {
    for (const summary of LEVEL_SUMMARIES) {
      const parsed = LevelSummarySchema.safeParse(summary);
      if (!parsed.success) {
        throw new Error(summary.id + ' 摘要校验失败：' + JSON.stringify(parsed.error.issues));
      }
    }
  });

  it('全部详情都能过 LevelDetailSchema（含 strict）', () => {
    for (const [id, detail] of Object.entries(LEVEL_DETAILS)) {
      const parsed = LevelDetailSchema.safeParse(detail);
      if (!parsed.success) {
        throw new Error(id + ' 详情校验失败：' + JSON.stringify(parsed.error.issues));
      }
    }
  });

  it('thinkingTarget 超过 40 字会被拒绝（docs/02 §7.2 的上限）', () => {
    const summary = getLevelSummary('k-data-tally');
    expect(summary).toBeDefined();
    const tooLong = { ...(summary as object), thinkingTarget: '目'.repeat(41) };
    expect(LevelSummarySchema.safeParse(tooLong).success).toBe(false);
    const atLimit = { ...(summary as object), thinkingTarget: '目'.repeat(40) };
    expect(LevelSummarySchema.safeParse(atLimit).success).toBe(true);
  });

  it('摘要里的未知字段会被 strict 拒绝（写错字段名不该静默通过）', () => {
    const summary = getLevelSummary('k-data-tally');
    expect(summary).toBeDefined();
    const withTypo = { ...(summary as object), thinking_target: '错字段' };
    expect(LevelSummarySchema.safeParse(withTypo).success).toBe(false);
  });

  it('estimatedMinutes 越界（<3 或 >15）会被拒绝', () => {
    const summary = getLevelSummary('k-data-tally');
    expect(summary).toBeDefined();
    expect(LevelSummarySchema.safeParse({ ...(summary as object), estimatedMinutes: 2 }).success).toBe(false);
    expect(LevelSummarySchema.safeParse({ ...(summary as object), estimatedMinutes: 16 }).success).toBe(false);
  });
});

describe('英文内容', () => {
  it('每关的英文摘要与详情字段都齐全', () => {
    const missing: string[] = [];
    for (const summary of LEVEL_SUMMARIES) {
      if (!summary.titleEn) missing.push(summary.id + '.summary.titleEn');
      if (!summary.thinkingTargetEn) missing.push(summary.id + '.summary.thinkingTargetEn');
      const detail = LEVEL_DETAILS[summary.id];
      for (const field of EN_FIELDS) {
        if (!detail[field]) missing.push(summary.id + '.detail.' + field);
      }
    }
    expect(missing).toEqual([]);
  });

  it('英文字段里没有残留中文', () => {
    const leaks: string[] = [];
    for (const summary of LEVEL_SUMMARIES) {
      const detail = LEVEL_DETAILS[summary.id];
      const values: [string, string | undefined][] = [
        ['summary.titleEn', summary.titleEn],
        ['summary.thinkingTargetEn', summary.thinkingTargetEn],
        ['detail.titleEn', detail.titleEn],
        ['detail.thinkingTargetEn', detail.thinkingTargetEn],
        ['detail.introEn', detail.introEn],
        ['detail.promptEn', detail.promptEn],
        ['detail.doneEn', detail.doneEn],
        ['detail.retryEn', detail.retryEn],
      ];
      for (const [name, value] of values) {
        if (value && CJK.test(value)) leaks.push(summary.id + '.' + name);
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe('localize 回退', () => {
  const summary = getLevelSummary('k-data-tally');
  const detail = LEVEL_DETAILS['k-data-tally'];

  it('中文取中文字段，英文取英文字段', () => {
    expect(summary).toBeDefined();
    expect(localizedSummary(summary!, 'zh-CN').title).toBe(summary!.title);
    expect(localizedSummary(summary!, 'en').title).toBe(summary!.titleEn);
    expect(localizedDetail(detail, 'zh-CN').intro).toBe(detail.intro);
    expect(localizedDetail(detail, 'en').intro).toBe(detail.introEn);
  });

  it('英文字段缺失时回退中文，不返回 undefined', () => {
    expect(summary).toBeDefined();
    const stripped = { ...summary!, titleEn: undefined, thinkingTargetEn: undefined };
    expect(localizedSummary(stripped, 'en').title).toBe(summary!.title);
    expect(localizedSummary(stripped, 'en').thinkingTarget).toBe(summary!.thinkingTarget);
    const strippedDetail = {
      ...detail, titleEn: undefined, thinkingTargetEn: undefined,
      introEn: undefined, promptEn: undefined, doneEn: undefined, retryEn: undefined,
    };
    const localized = localizedDetail(strippedDetail, 'en');
    expect(localized.intro).toBe(detail.intro);
    expect(localized.prompt).toBe(detail.prompt);
    expect(localized.done).toBe(detail.done);
    expect(localized.retry).toBe(detail.retry);
  });
});

describe('loadLevel / summaries 守卫', () => {
  it('未发布或未知 id 返回 null（调用方回星图，不白屏）', async () => {
    expect(await loadLevel('not-a-level' as never)).toBeNull();
    expect(getLevelSummary('not-a-level')).toBeUndefined();
  });

  it('已发布 id 能加载到详情，且 id 与请求一致', async () => {
    for (const id of SHIPPED_LEVEL_IDS) {
      const detail = await loadLevel(id);
      expect(detail?.id).toBe(id);
    }
  });

  it('levelSummaries 覆盖全部已发布关卡', () => {
    expect(levelSummaries().length).toBe(SHIPPED_LEVEL_IDS.length);
  });
});
