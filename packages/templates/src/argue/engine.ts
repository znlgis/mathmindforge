import type { BoardCell } from './schema';
import type { ArgueScript } from './schema';

export interface BoardCounts {
  black: number;
  white: number;
  cells: number;
}

function removedKey(cell: BoardCell): string {
  return cell.x + ',' + cell.y;
}

export function boardCells(script: ArgueScript): BoardCell[] {
  const removed = new Set(script.board.removed.map(removedKey));
  const out: BoardCell[] = [];
  for (let y = 0; y < script.board.height; y += 1) {
    for (let x = 0; x < script.board.width; x += 1) {
      if (removed.has(x + ',' + y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

export function boardCounts(script: ArgueScript): BoardCounts {
  const cells = boardCells(script);
  let black = 0;
  let white = 0;
  for (const cell of cells) {
    if ((cell.x + cell.y) % 2 === 0) black += 1;
    else white += 1;
  }
  return { black, white, cells: cells.length };
}

/**
 * 一条依据到底能不能排除这张棋盘的铺满？
 *
 * 每块 1×2 骨牌都盖住「一黑一白」（染色）或「2 格」（奇偶、面积是同一个量）：
 * - coloring 成立 ⇔ 黑白格数量不等（相等就排除不了，例如 8×8 去两个异色角）；
 * - parity / area 成立 ⇔ 总格数是奇数（偶数就排除不了，例如 8×8 去两个同色角只有 62 格）。
 *
 * 判定器与界面解释共用这一条口径，避免出现「界面说能排除、判定说不能」的两套标准。
 */
export function warrantDecides(warrant: string, counts: BoardCounts): boolean {
  if (warrant === 'coloring') return counts.black !== counts.white;
  if (warrant === 'parity' || warrant === 'area') return counts.cells % 2 === 1;
  return false;
}

/** 棋盘自身就带着反例：两条计数不变量任一条成立，1×2 骨牌就铺不满。 */
export function impossibleByInvariant(counts: BoardCounts): boolean {
  return warrantDecides('coloring', counts) || warrantDecides('parity', counts);
}

/**
 * 旋转会不会把棋盘的棋盘染色翻转（黑白计数互换）。
 *
 * 90°/270° 把 (x,y) 送到 (height-1-y, x) 一类的位置，新坐标和的奇偶差 = height-1（或 width-1）减偶数，
 * 所以偶数边棋盘转 90° 会整体变色。迁移门如果拿这种变体去校验黑白计数证书，
 * 失败的不是论证不够一般，而是坐标系换了颜色——那类变体不能进迁移门（详见 logic.ts 的 transferVariants）。
 */
export function rotationFlipsColoring(script: ArgueScript, quarter: 1 | 2 | 3): boolean {
  const { width, height } = script.board;
  if (quarter === 2) return (width + height) % 2 === 1;
  return (quarter === 1 ? height : width) % 2 === 0;
}

export function rotateRemoved(script: ArgueScript, quarter: 1 | 2 | 3): ArgueScript {
  const { width, height } = script.board;
  const rotate = (cell: BoardCell): BoardCell => {
    if (quarter === 1) return { x: height - 1 - cell.y, y: cell.x };
    if (quarter === 2) return { x: width - 1 - cell.x, y: height - 1 - cell.y };
    return { x: cell.y, y: width - 1 - cell.x };
  };
  const rotatedWidth = quarter === 2 ? width : height;
  const rotatedHeight = quarter === 2 ? height : width;
  return {
    ...script,
    board: {
      width: rotatedWidth,
      height: rotatedHeight,
      removed: script.board.removed.map(rotate),
    },
  };
}
