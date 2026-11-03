import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import { createTranslator, en, getTranslatorLocale, setTranslatorLocale, zh, zhSourceEn } from './index';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

describe('i18n 表一致性', () => {
  it('en 与 zh 的 key 一一对应（缺 key 会让英文界面回退中文，多 key 是死文案）', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys.filter((key) => !(key in zh))).toEqual([]);
    expect(zhKeys.filter((key) => !(key in en))).toEqual([]);
  });

  it('英文表的值不含中日韩字符', () => {
    const dirty = Object.entries(en).filter(([, value]) => CJK.test(value));
    expect(dirty).toEqual([]);
  });

  it('中文表里每个值都非空', () => {
    const empty = Object.entries(zh).filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });

  it('中文兜底表不与正式 en key 冲突（否则会盖掉真实文案）', () => {
    const shadowed = Object.keys(zhSourceEn).filter((key) => key in en);
    expect(shadowed).toEqual([]);
  });

  it('中文兜底表的值不含中日韩字符', () => {
    const dirty = Object.entries(zhSourceEn).filter(([, value]) => CJK.test(value));
    expect(dirty).toEqual([]);
  });
});

describe('关卡内容引用的文案 key 在英文下可解析', () => {
  // 内容层历史上把中文句子当 key（docs/05 的 M2 遗留），这里逐条验收：
  // 英文界面渲染这些 key 时必须是英文，不能漏出中文。
  const referenced = new Map<string, string[]>();
  const add = (key: string, where: string) => {
    const list = referenced.get(key);
    if (list) list.push(where);
    else referenced.set(key, [where]);
  };

  for (const [id, detail] of Object.entries(LEVEL_DETAILS)) {
    for (const tool of detail.tools) {
      add(tool.titleKey, id + '.tools.titleKey');
      add(tool.descriptionKey, id + '.tools.descriptionKey');
    }
    for (const [failureClass, copy] of Object.entries(detail.feedback)) {
      add(copy.messageKey, id + '.feedback.' + failureClass + '.messageKey');
      add(copy.hintKey, id + '.feedback.' + failureClass + '.hintKey');
    }
    for (const checkpoint of detail.evidencePlan) {
      add(checkpoint.descriptionKey, id + '.evidencePlan.' + checkpoint.id + '.descriptionKey');
    }
    if (detail.manualAudit?.notesKey) add(detail.manualAudit.notesKey, id + '.manualAudit.notesKey');
  }

  const translator = createTranslator('en');

  it('内容引用的 key 数量与预期一致（防止正则/字段漏扫）', () => {
    expect(referenced.size).toBeGreaterThan(150);
  });

  it('每个 key 在英文下都解析成英文，且不会原样返回 key', () => {
    const leaks: string[] = [];
    for (const [key, wheres] of referenced) {
      const text = translator.t(key);
      if (CJK.test(text)) leaks.push(key + ' <- ' + wheres.slice(0, 2).join(', '));
      if (text === key) leaks.push('未翻译（原样返回 key）：' + key);
    }
    expect(leaks).toEqual([]);
  });

  it('中文界面仍显示中文原文（兜底表只影响英文）', () => {
    const zhTranslator = createTranslator('zh-CN');
    const sample = [...referenced.keys()].find((key) => CJK.test(key));
    expect(sample).toBeDefined();
    expect(zhTranslator.t(sample as string)).toBe(sample);
  });
});

describe('createTranslator', () => {
  it('插值替换 {name} 形式的参数', () => {
    const t = createTranslator('zh-CN');
    expect(t.t('forge.group', { done: 3, total: 5 })).toBe('3 / 5 关');
    expect(createTranslator('en').t('forge.group', { done: 3, total: 5 })).toBe('3 / 5 done');
  });

  it('缺少插值参数时保留占位符，不渲染成 undefined', () => {
    expect(createTranslator('zh-CN').t('badges.progress')).toContain('{current}');
    expect(createTranslator('en').t('badges.progress')).not.toContain('undefined');
  });

  it('未知 key 原样返回，不抛错也不白屏', () => {
    expect(createTranslator('en').t('no.such.key')).toBe('no.such.key');
  });

  it('不传 locale 时跟随 setTranslatorLocale（此前写死 zh-CN 会导致切英文后仍出中文）', () => {
    const previous = getTranslatorLocale();
    try {
      setTranslatorLocale('en');
      expect(createTranslator().locale).toBe('en');
      expect(createTranslator().t('level.back')).toBe('Back to star map');
      setTranslatorLocale('zh-CN');
      expect(createTranslator().locale).toBe('zh-CN');
      expect(createTranslator().t('level.back')).toBe('回星图');
    } finally {
      setTranslatorLocale(previous);
    }
  });
});