import { describe, expect, it } from 'vitest';
import type { EvidenceAggregate, EvidenceEvent, EvidenceStore, ProgressStore } from '@mmf/game-kit';
import { emptySave } from '@mmf/progress';
import { MAX_EVIDENCE_EVENTS, createWebPlatform } from './web';

const LEVEL_ID = 'k-structure-pattern-path' as const;

function makeEvent(id: string, at: number, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    v: 1,
    id,
    at,
    profileId: 'local-default',
    levelId: LEVEL_ID,
    phase: 'observe',
    variantId: 'base',
    action: '看一格',
    ...overrides,
  };
}

function makePlatform(): { storage: ProgressStore; evidence: EvidenceStore } {
  // Node 没有 IndexedDB / localStorage：正好走内存档降级路径。
  const platform = createWebPlatform();
  return { storage: platform.storage, evidence: platform.evidenceStore };
}

describe('Web 平台：存档', () => {
  it('空档读出 null，写入后可原样读回', async () => {
    const { storage } = makePlatform();
    expect(await storage.load()).toBeNull();

    const save = emptySave(123);
    save.levels[LEVEL_ID].completed = true;
    await storage.save(save);
    expect(await storage.load()).toEqual(save);
  });
});

describe('Web 平台：证据 append-only', () => {
  it('recent 按时间倒序，即使写入顺序是乱的', async () => {
    const { evidence } = makePlatform();
    await evidence.append([
      makeEvent('a', 300),
      makeEvent('b', 100),
      makeEvent('c', 200),
    ]);

    expect((await evidence.recent(2)).map((event) => event.id)).toEqual(['a', 'c']);
    expect((await evidence.recent(10)).map((event) => event.id)).toEqual(['a', 'c', 'b']);
    expect(await evidence.recent(0)).toEqual([]);
  });

  it('同一事件重复 append（失败重试）只记一次', async () => {
    const { evidence } = makePlatform();
    const batch = [makeEvent('a', 1), makeEvent('b', 2)];
    await evidence.append(batch);
    await evidence.append(batch);

    expect(await evidence.recent(10)).toHaveLength(2);
    expect((await evidence.loadAggregate()).total).toBe(0);
    expect((await evidence.loadRecord())?.events).toHaveLength(2);
  });

  it('超过 3000 条时裁掉最旧事件，并把计数并入聚合（不重复、不丢失）', async () => {
    const { evidence } = makePlatform();
    const events: EvidenceEvent[] = [];
    for (let index = 0; index < MAX_EVIDENCE_EVENTS + 5; index += 1) {
      events.push(makeEvent('ev-' + index, index, {
        tool: index % 2 === 0 ? 'knob' : 'probe',
        phase: index % 3 === 0 ? 'run' : 'observe',
        failureClass: index === 0 ? 'too-many' : undefined,
      }));
    }
    await evidence.append(events);

    const record = await evidence.loadRecord();
    expect(record?.events).toHaveLength(MAX_EVIDENCE_EVENTS);
    expect(record?.events[0].id).toBe('ev-5');
    expect(record?.events.at(-1)?.id).toBe('ev-' + (MAX_EVIDENCE_EVENTS + 4));

    const aggregate = await evidence.loadAggregate();
    // 只有被裁掉的 5 条进聚合；还在记录里的事件不能重复计数。
    expect(aggregate.total).toBe(5);
    expect(aggregate.byLevel[LEVEL_ID]).toBe(5);
    expect(aggregate.byTool.knob).toBe(3);
    expect(aggregate.byTool.probe).toBe(2);
    expect(aggregate.byPhase.run).toBe(2);
    expect(aggregate.byPhase.observe).toBe(3);
    expect(aggregate.byFailure['too-many']).toBe(1);
    expect(aggregate.lastAggregatedAt).toBe(4);

    expect((await evidence.recent(1))[0].id).toBe('ev-' + (MAX_EVIDENCE_EVENTS + 4));
  });

  it('裁剪后重试仍在记录里的事件，不会重复计数', async () => {
    const { evidence } = makePlatform();
    const events: EvidenceEvent[] = [];
    for (let index = 0; index < MAX_EVIDENCE_EVENTS + 2; index += 1) {
      events.push(makeEvent('ev-' + index, index));
    }
    await evidence.append(events);
    expect((await evidence.loadAggregate()).total).toBe(2);

    // 外层失败重试只回灌仍在记录里的这批：id 已知，聚合不能涨。
    const retained = events.slice(-2);
    await evidence.append(retained);
    expect((await evidence.loadAggregate()).total).toBe(2);
    expect((await evidence.loadRecord())?.events).toHaveLength(MAX_EVIDENCE_EVENTS);
  });

  it('clear 同时清空证据与聚合', async () => {
    const { evidence } = makePlatform();
    const events: EvidenceEvent[] = [];
    for (let index = 0; index < MAX_EVIDENCE_EVENTS + 1; index += 1) {
      events.push(makeEvent('ev-' + index, index));
    }
    await evidence.append(events);
    expect((await evidence.loadAggregate()).total).toBe(1);

    await evidence.clear();
    expect(await evidence.loadRecord()).toBeNull();
    const aggregate = await evidence.loadAggregate();
    expect(aggregate.total).toBe(0);
    expect(aggregate.byLevel).toEqual({});
    expect(aggregate.lastAggregatedAt).toBe(0);
  });

  it('聚合的坏字段只丢自己，工具计数补齐 6 件', async () => {
    const { evidence } = makePlatform();
    const stored = {
      total: 7,
      byLevel: { [LEVEL_ID]: 3, bad: 'x' },
      byTool: { knob: 2, 'not-a-tool': 9 },
      byPhase: { observe: 1, 'not-a-phase': 4 },
      byFailure: { boom: 2 },
      lastAggregatedAt: 99,
    } as unknown as EvidenceAggregate;
    await evidence.saveAggregate(stored);

    const aggregate = await evidence.loadAggregate();
    expect(aggregate.total).toBe(7);
    expect(aggregate.byLevel[LEVEL_ID]).toBe(3);
    expect(aggregate.byLevel).not.toHaveProperty('bad');
    expect(aggregate.byTool.knob).toBe(2);
    expect(aggregate.byTool.rule).toBe(0);
    expect(aggregate.byPhase.observe).toBe(1);
    expect(aggregate.byPhase).not.toHaveProperty('not-a-phase');
    expect(aggregate.byFailure.boom).toBe(2);
    expect(aggregate.lastAggregatedAt).toBe(99);
  });
});

describe('Web 平台：降级路径', () => {
  it('没有 localStorage 时偏好读 null、写不抛错', () => {
    const { preferences } = createWebPlatform();
    expect(preferences.get('locale')).toBeNull();
    expect(() => preferences.set('locale', 'en')).not.toThrow();
    expect(preferences.get('locale')).toBeNull();
  });

  it('没有 WebAudio / SpeechSynthesis 时静音可玩，speak 立即 resolve', async () => {
    const { audio } = createWebPlatform();
    expect(() => audio.play('complete')).not.toThrow();
    expect(() => audio.tone(440, 80)).not.toThrow();
    expect(() => audio.stopSpeech()).not.toThrow();
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    await expect(audio.speak('你好', 'zh-CN')).resolves.toBeUndefined();
    audio.setMuted(false);
  });

  it('没有 DOM 时文件导出/导入都不抛错且导入返回 null', async () => {
    const { files } = createWebPlatform();
    expect(() => files.download('mmf-report.json', 'application/json', '{}')).not.toThrow();
    await expect(files.pickText('application/json', 512 * 1024)).resolves.toBeNull();
  });

  it('生命周期订阅可取消，重复取消不抛错', () => {
    const { lifecycle } = createWebPlatform();
    const offPause = lifecycle.onPause(() => undefined);
    const offResume = lifecycle.onResume(() => undefined);
    expect(typeof offPause).toBe('function');
    offPause();
    offPause();
    offResume();
  });

  it('now() 返回有限时间戳', () => {
    const { now } = createWebPlatform();
    expect(Number.isFinite(now())).toBe(true);
  });

  it('MAX_EVIDENCE_EVENTS 与 docs/02 的 3000 条一致', () => {
    expect(MAX_EVIDENCE_EVENTS).toBe(3000);
  });
});
