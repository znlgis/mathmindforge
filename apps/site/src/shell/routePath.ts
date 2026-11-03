import type { ShippedLevelId } from '@mmf/content/ids';
import { SHIPPED_LEVEL_IDS } from '@mmf/content/ids';

/**
 * 路由解析的纯逻辑部分：不碰 window，node 环境可单测。
 * 浏览器侧的状态（ref + hashchange）留在 ../router.ts。
 */
export interface Route {
  name: 'home' | 'forge' | 'play' | 'journal' | 'badges' | 'report';
  levelId?: ShippedLevelId;
}

const SHIPPED = new Set<string>(SHIPPED_LEVEL_IDS);

/**
 * 畸形分享链接（如 `#/play/%E0%A4%A`）里 decodeURIComponent 会抛 URIError。
 * hashchange 回调一旦抛异常，后续路由就再也不会更新；这里把坏编码当成"未发布 id"，
 * 交给 parseRoute 回星图，而不是让整页卡死。
 */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** 只把已发布 id 解析成 player 路由；未发布/不存在的一律回星图（docs/02 §10.1） */
export function asLevelId(value: string | undefined): ShippedLevelId | null {
  if (!value) return null;
  const decoded = safeDecode(value);
  return decoded !== null && SHIPPED.has(decoded) ? (decoded as ShippedLevelId) : null;
}

export function parseRoute(hash: string): Route {
  // `?` 之后是调试参数（autoplay/instant），不参与路由判定
  const clean = hash.split('?')[0] ?? hash;
  const parts = clean.replace(/^#\/?/, '').split('/').filter(Boolean);
  const head = parts[0];
  if (head === 'play') {
    const levelId = asLevelId(parts[1]);
    return levelId ? { name: 'play', levelId } : { name: 'forge' };
  }
  if (head === 'forge') return { name: 'forge' };
  if (head === 'journal') return { name: 'journal' };
  if (head === 'badges') return { name: 'badges' };
  if (head === 'report') return { name: 'report' };
  return { name: 'home' };
}
