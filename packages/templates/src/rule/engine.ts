import type { ProgramBlock } from '@mmf/game-kit';
import { MAX_NESTING, MAX_REPEAT } from './schema';
import type { Cell, Direction, RuleScript } from './schema';

const VECTOR: Record<Direction, Cell> = {
  north: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: -1 },
  west: { x: -1, y: 0 },
};

const TURN_LEFT: Record<Direction, Direction> = {
  north: 'west', west: 'south', south: 'east', east: 'north',
};
const TURN_RIGHT: Record<Direction, Direction> = {
  north: 'east', east: 'south', south: 'west', west: 'north',
};

export function cellKey(cell: Cell): string {
  return cell.x + ',' + cell.y;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function aheadOf(cell: Cell, dir: Direction): Cell {
  const vector = VECTOR[dir];
  return { x: cell.x + vector.x, y: cell.y + vector.y };
}

export function turnLeft(dir: Direction): Direction {
  return TURN_LEFT[dir];
}

export function turnRight(dir: Direction): Direction {
  return TURN_RIGHT[dir];
}

/** 墙包含网格边界：越界等同于撞墙。 */
export function isBlocked(script: RuleScript, cell: Cell): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= script.grid.width || cell.y >= script.grid.height) {
    return true;
  }
  return script.walls.some((wall) => sameCell(wall, cell));
}

export interface TraceStep {
  /** 第几个原语动作（1 起）；容器块（repeat / if-wall）不计步。 */
  index: number;
  op: string;
  blockId: string;
  from: Cell;
  to: Cell;
  dir: Direction;
  blocked?: boolean;
  collected?: Cell;
}

export interface RuleTrace {
  /** 执行过的原语步数。 */
  steps: number;
  /** 走过的格子（含起点，允许相邻重复）。 */
  path: Cell[];
  /** 按顺序收进篮子里的星星。 */
  collected: Cell[];
  end: { x: number; y: number; dir: Direction };
  /** 收齐星星并停在终点时才为 true。 */
  reachedGoal: boolean;
  failureStep?: number;
  failureClass?: string;
  log: TraceStep[];
}

function repeatTimes(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return 1;
  return Math.min(value, MAX_REPEAT);
}

/**
 * 纯执行器：不在任何地方写状态，也不读时钟。
 * 撞墙 / 越界 → rule-wall；步数预算用完 → rule-loop。
 */
export function executeProgram(script: RuleScript, program: readonly ProgramBlock[]): RuleTrace {
  const wallKeys = new Set(script.walls.map(cellKey));
  const starKeys = new Set(script.stars.map(cellKey));
  const goal = script.grid.goal;

  const collected: Cell[] = [];
  const collectedKeys = new Set<string>();
  const log: TraceStep[] = [];
  const path: Cell[] = [{ x: script.grid.start.x, y: script.grid.start.y }];
  const pos: Cell = { x: script.grid.start.x, y: script.grid.start.y };

  let dir: Direction = script.grid.start.dir;
  let steps = 0;
  let failureStep: number | undefined;
  let failureClass: string | undefined;
  let reachedGoal = false;
  let stopped = false;

  function blocked(cell: Cell): boolean {
    if (cell.x < 0 || cell.y < 0 || cell.x >= script.grid.width || cell.y >= script.grid.height) {
      return true;
    }
    return wallKeys.has(cellKey(cell));
  }

  function fail(klass: string, step: number): void {
    failureClass = klass;
    failureStep = step;
    stopped = true;
  }

  /** 每执行一个原语先扣步数；预算用完就按"绕圈"收尾。 */
  function advance(): boolean {
    if (steps >= script.maxSteps) {
      fail('rule-loop', steps + 1);
      return false;
    }
    steps += 1;
    return true;
  }

  function settle(): void {
    if (collectedKeys.size === starKeys.size && pos.x === goal.x && pos.y === goal.y) {
      reachedGoal = true;
      stopped = true;
    }
  }

  function runList(blocks: readonly ProgramBlock[], depth: number): void {
    for (const block of blocks) {
      if (stopped) return;
      runBlock(block, depth);
    }
  }

  function runBlock(block: ProgramBlock, depth: number): void {
    if (depth > MAX_NESTING) {
      fail('rule-loop', steps + 1);
      return;
    }

    switch (block.op) {
      case 'forward': {
        if (!advance()) return;
        const from: Cell = { x: pos.x, y: pos.y };
        const next = aheadOf(pos, dir);
        if (blocked(next)) {
          log.push({ index: steps, op: 'forward', blockId: block.id, from, to: next, dir, blocked: true });
          fail('rule-wall', steps);
          return;
        }
        pos.x = next.x;
        pos.y = next.y;
        log.push({ index: steps, op: 'forward', blockId: block.id, from, to: { x: next.x, y: next.y }, dir });
        path.push({ x: pos.x, y: pos.y });
        settle();
        return;
      }
      case 'left': {
        if (!advance()) return;
        dir = turnLeft(dir);
        const here: Cell = { x: pos.x, y: pos.y };
        log.push({ index: steps, op: 'left', blockId: block.id, from: here, to: here, dir });
        return;
      }
      case 'right': {
        if (!advance()) return;
        dir = turnRight(dir);
        const here: Cell = { x: pos.x, y: pos.y };
        log.push({ index: steps, op: 'right', blockId: block.id, from: here, to: here, dir });
        return;
      }
      case 'collect': {
        if (!advance()) return;
        const here: Cell = { x: pos.x, y: pos.y };
        const key = cellKey(here);
        if (starKeys.has(key) && !collectedKeys.has(key)) {
          collectedKeys.add(key);
          collected.push({ x: here.x, y: here.y });
          log.push({ index: steps, op: 'collect', blockId: block.id, from: here, to: here, dir, collected: { x: here.x, y: here.y } });
        } else {
          log.push({ index: steps, op: 'collect', blockId: block.id, from: here, to: here, dir });
        }
        settle();
        return;
      }
      case 'repeat': {
        const times = repeatTimes(block.n);
        const children = block.children ?? [];
        for (let round = 0; round < times; round += 1) {
          if (stopped) return;
          runList(children, depth + 1);
        }
        return;
      }
      case 'if-wall': {
        if (blocked(aheadOf(pos, dir))) runList(block.children ?? [], depth + 1);
        return;
      }
      default: {
        // 未知操作不执行；保持纯函数、不抛错。
        return;
      }
    }
  }

  runList(program, 0);

  return {
    steps,
    path,
    collected,
    end: { x: pos.x, y: pos.y, dir },
    reachedGoal,
    failureStep,
    failureClass,
    log,
  };
}
