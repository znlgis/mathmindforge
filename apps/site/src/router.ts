import type { ShippedLevelId } from '@mmf/content/ids';
import { SHIPPED_LEVEL_IDS } from '@mmf/content/ids';
import { ref } from 'vue';
import type { Ref } from 'vue';

export interface Route {
  name: 'home' | 'forge' | 'play';
  levelId?: ShippedLevelId;
}

function asLevelId(value: string | undefined): ShippedLevelId | null {
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  return (SHIPPED_LEVEL_IDS as readonly string[]).includes(decoded)
    ? (decoded as ShippedLevelId)
    : null;
}

/** 只用 hash 路由：静态托管（甚至 file:// 打开）不需要服务端重写规则 */
export function parseRoute(hash: string): Route {
  const clean = hash.split('?')[0] ?? hash;
  const parts = clean.replace(/^#\/?/, '').split('/').filter(Boolean);
  const head = parts[0];
  if (head === 'play') {
    const levelId = asLevelId(parts[1]);
    return levelId ? { name: 'play', levelId } : { name: 'forge' };
  }
  if (head === 'forge') return { name: 'forge' };
  return { name: 'home' };
}

const route: Ref<Route> = ref(parseRoute(window.location.hash));

window.addEventListener('hashchange', () => {
  route.value = parseRoute(window.location.hash);
});

export function useRoute(): Ref<Route> {
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : '#' + path;
}
