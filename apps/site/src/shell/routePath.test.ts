import { describe, expect, it } from 'vitest';
import { SHIPPED_LEVEL_IDS } from '@mmf/content/ids';
import { asLevelId, parseRoute } from './routePath';

const FIRST = SHIPPED_LEVEL_IDS[0];

describe('parseRoute', () => {
  it('把六个已实现路由解析成对应页面', () => {
    expect(parseRoute('#/').name).toBe('home');
    expect(parseRoute('#/forge').name).toBe('forge');
    expect(parseRoute('#/journal').name).toBe('journal');
    expect(parseRoute('#/badges').name).toBe('badges');
    expect(parseRoute('#/report').name).toBe('report');
    expect(parseRoute('#/play/' + FIRST)).toEqual({ name: 'play', levelId: FIRST });
  });

  it('未知路由回大厅，而不是空白页', () => {
    for (const hash of ['#/nope', '#/tools', '#/settings', '#/about', '#/editor']) {
      expect(parseRoute(hash)).toEqual({ name: 'home' });
    }
  });

  it('未发布的关卡 id 回星图（深链与旧分享链接都走这条守卫）', () => {
    expect(parseRoute('#/play')).toEqual({ name: 'forge' });
    expect(parseRoute('#/play/not-a-level')).toEqual({ name: 'forge' });
    expect(parseRoute('#/play/')).toEqual({ name: 'forge' });
    expect(parseRoute('#/play/' + FIRST + '/extra')).toEqual({ name: 'play', levelId: FIRST });
  });

  it('畸形百分号编码不抛异常，按未发布 id 处理', () => {
    expect(() => parseRoute('#/play/%E0%A4%A')).not.toThrow();
    expect(parseRoute('#/play/%E0%A4%A')).toEqual({ name: 'forge' });
    expect(parseRoute('#/play/%')).toEqual({ name: 'forge' });
    // 合法编码要能解出来
    expect(parseRoute('#/play/' + encodeURIComponent(FIRST))).toEqual({ name: 'play', levelId: FIRST });
  });

  it('hash 里的 query 只当调试参数，不参与路由判定', () => {
    expect(parseRoute('#/play/' + FIRST + '?autoplay=1&instant=1')).toEqual({ name: 'play', levelId: FIRST });
    expect(parseRoute('#/?utm=share')).toEqual({ name: 'home' });
    expect(parseRoute('#/play/?autoplay=1')).toEqual({ name: 'forge' });
  });

  it('大小写与空串按未匹配处理', () => {
    expect(parseRoute('').name).toBe('home');
    expect(parseRoute('#').name).toBe('home');
    expect(parseRoute('#/Forge')).toEqual({ name: 'home' });
    expect(parseRoute('#/PLAY/' + FIRST)).toEqual({ name: 'home' });
  });
});

describe('asLevelId', () => {
  it('只接受已发布 id', () => {
    expect(asLevelId(FIRST)).toBe(FIRST);
    expect(asLevelId('not-a-level')).toBeNull();
    expect(asLevelId(undefined)).toBeNull();
    expect(asLevelId('')).toBeNull();
  });
});
