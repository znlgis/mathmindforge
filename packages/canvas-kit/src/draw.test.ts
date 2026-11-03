import { describe, expect, it } from 'vitest';
import { centeredLabel, circle, dashLine, dashedRect, label, roundRect } from './draw';
import { PALETTE, toColor } from './theme';

interface RecordedCall {
  name: string;
  args: unknown[];
}

type GraphicsArg = Parameters<typeof roundRect>[0];

function stubGraphics(): { calls: RecordedCall[]; graphics: GraphicsArg } {
  const calls: RecordedCall[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };
  const graphics = {
    fillStyle: record('fillStyle'),
    fillRoundedRect: record('fillRoundedRect'),
    lineStyle: record('lineStyle'),
    strokeRoundedRect: record('strokeRoundedRect'),
    fillCircle: record('fillCircle'),
    strokeCircle: record('strokeCircle'),
    lineBetween: record('lineBetween'),
  };
  return { calls, graphics: graphics as unknown as GraphicsArg };
}

describe('roundRect', () => {
  it('只填不描边时只下发填充调用，默认圆角 12', () => {
    const { calls, graphics } = stubGraphics();
    roundRect(graphics, 4, 8, 40, 24, { fill: PALETTE.card, fillAlpha: 0.5 });

    expect(calls).toEqual([
      { name: 'fillStyle', args: [toColor(PALETTE.card), 0.5] },
      { name: 'fillRoundedRect', args: [4, 8, 40, 24, 12] },
    ]);
  });

  it('描边时用给定线宽与透明度', () => {
    const { calls, graphics } = stubGraphics();
    roundRect(graphics, 0, 0, 10, 10, { stroke: PALETTE.red, lineWidth: 3, strokeAlpha: 0.25, radius: 4 });

    expect(calls).toEqual([
      { name: 'lineStyle', args: [3, toColor(PALETTE.red), 0.25] },
      { name: 'strokeRoundedRect', args: [0, 0, 10, 10, 4] },
    ]);
  });

  it('先填后描边，顺序固定', () => {
    const { calls, graphics } = stubGraphics();
    roundRect(graphics, 0, 0, 10, 10, { fill: PALETTE.paper, stroke: PALETTE.ink });

    expect(calls.map((call) => call.name)).toEqual(['fillStyle', 'fillRoundedRect', 'lineStyle', 'strokeRoundedRect']);
  });

  it('什么都不传时一个绘制调用都不发', () => {
    const { calls, graphics } = stubGraphics();
    roundRect(graphics, 0, 0, 10, 10);
    expect(calls).toEqual([]);
  });
});

describe('circle', () => {
  it('填充与描边都用圆心的绝对坐标', () => {
    const { calls, graphics } = stubGraphics();
    circle(graphics, 50, 60, 8, { fill: PALETTE.teal, stroke: PALETTE.blueprint, lineWidth: 1 });

    expect(calls).toEqual([
      { name: 'fillStyle', args: [toColor(PALETTE.teal), 1] },
      { name: 'fillCircle', args: [50, 60, 8] },
      { name: 'lineStyle', args: [1, toColor(PALETTE.blueprint), 1] },
      { name: 'strokeCircle', args: [50, 60, 8] },
    ]);
  });
});

describe('dashLine', () => {
  it('按 dash + gap 切段，最后一段不超过 dash', () => {
    const { calls, graphics } = stubGraphics();
    dashLine(graphics, 0, 0, 100, 0, { dash: 9, gap: 6 });

    expect(calls[0]).toEqual({ name: 'lineStyle', args: [2, toColor(PALETTE.blueprint), 1] });
    const segments = calls.filter((call) => call.name === 'lineBetween');
    // 100 / 15 = 6 段整 + 第 7 段从 90 到 99
    expect(segments).toHaveLength(7);
    expect(segments[0]).toEqual({ name: 'lineBetween', args: [0, 0, 9, 0] });
    expect(segments[6]).toEqual({ name: 'lineBetween', args: [90, 0, 99, 0] });
  });

  it('零长度线段不产生绘制调用，避免除 0', () => {
    const { calls, graphics } = stubGraphics();
    dashLine(graphics, 10, 10, 10, 10, { dash: 4, gap: 2 });
    expect(calls.filter((call) => call.name === 'lineBetween')).toEqual([]);
  });

  it('dash / gap 传 0 时按最小值 2 兜底，不会卡死循环', () => {
    const { calls, graphics } = stubGraphics();
    dashLine(graphics, 0, 0, 10, 0, { dash: 0, gap: 0 });
    expect(calls.filter((call) => call.name === 'lineBetween').length).toBeGreaterThan(0);
  });

  it('斜线按单位向量切段，端点落在直线上', () => {
    const { calls, graphics } = stubGraphics();
    dashLine(graphics, 0, 0, 0, 30, { dash: 9, gap: 6 });
    const segments = calls.filter((call) => call.name === 'lineBetween');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ name: 'lineBetween', args: [0, 0, 0, 9] });
    expect(segments[1]).toEqual({ name: 'lineBetween', args: [0, 15, 0, 24] });
  });
});

describe('dashedRect', () => {
  it('四条边各自切段，横边 7 段、竖边 4 段', () => {
    const { calls, graphics } = stubGraphics();
    dashedRect(graphics, 0, 0, 100, 50, { dash: 9, gap: 6 });

    expect(calls.filter((call) => call.name === 'lineStyle')).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'lineBetween')).toHaveLength(22);
  });
});

describe('label / centeredLabel', () => {
  interface TextTarget {
    setOrigin(originX: number, originY: number): TextTarget;
    setDepth(depth: number): TextTarget;
  }

  function stubScene() {
    const created: { x: number; y: number; text: string; style: Record<string, unknown> }[] = [];
    const origins: [number, number][] = [];
    const depths: number[] = [];
    const scene = {
      add: {
        text(x: number, y: number, text: string, style: Record<string, unknown>): TextTarget {
          created.push({ x, y, text, style });
          const target: TextTarget = {
            setOrigin(originX: number, originY: number) {
              origins.push([originX, originY]);
              return target;
            },
            setDepth(depth: number) {
              depths.push(depth);
              return target;
            },
          };
          return target;
        },
      },
    };
    return {
      created,
      origins,
      depths,
      scene: scene as unknown as Parameters<typeof label>[0],
    };
  }

  it('左对齐、垂直居中，默认深度不改', () => {
    const { created, origins, depths, scene } = stubScene();
    label(scene, 26, 40, '标题', { size: 24, bold: true });

    expect(created).toEqual([{
      x: 26,
      y: 40,
      text: '标题',
      style: expect.objectContaining({ fontSize: '24px', fontStyle: 'bold', color: PALETTE.ink }),
    }]);
    expect(origins).toEqual([[0, 0.5]]);
    expect(depths).toEqual([]);
  });

  it('指定深度时才设置深度', () => {
    const { depths, scene } = stubScene();
    label(scene, 0, 0, 'x', { depth: 3 });
    expect(depths).toEqual([3]);
  });

  it('centeredLabel 把原点放到正中间', () => {
    const { origins, scene } = stubScene();
    centeredLabel(scene, 10, 10, 'A', { originX: 0, originY: 0 });
    expect(origins).toEqual([[0.5, 0.5]]);
  });
});
