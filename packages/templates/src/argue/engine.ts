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
