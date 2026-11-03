import { ref } from 'vue';
import type { Ref } from 'vue';
import type { Route } from './shell/routePath';
import { parseRoute } from './shell/routePath';

export type { Route } from './shell/routePath';
export { asLevelId, parseRoute } from './shell/routePath';

const route: Ref<Route> = ref(parseRoute(window.location.hash));

window.addEventListener('hashchange', () => {
  route.value = parseRoute(window.location.hash);
});

export function useRoute(): Ref<Route> {
  return route;
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path : '#' + path;
  if (window.location.hash === next) return;
  window.location.hash = next;
}
