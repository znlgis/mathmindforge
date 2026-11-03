import type {
  DebugOptions, LevelContext, LevelDetail, LevelEventMap, LevelManifest, PlatformServices,
} from '@mmf/game-kit';
import type { Locale } from '@mmf/content/ids';
import { recordDebugEvent } from './debug';

export interface LevelHostHooks {
  onExit: (reason?: 'quit' | 'replay') => void;
  /** 宿主额外消费事件；调试桥的事件统一在下方 emit 里记录，避免同一条事件写两次。 */
  onEvent?: <K extends keyof LevelEventMap>(type: K, payload: LevelEventMap[K]) => void;
}

export function readDebugOptions(): DebugOptions | undefined {
  if (!(import.meta.env.DEV || (typeof navigator !== 'undefined' && navigator.webdriver === true))) {
    return undefined;
  }
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const queryAt = hash.indexOf('?');
  if (queryAt >= 0) {
    for (const [key, value] of new URLSearchParams(hash.slice(queryAt + 1))) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  const autoplay = params.get('autoplay') === '1';
  const instant = params.get('instant') === '1';
  if (!autoplay && !instant) return undefined;
  const options: DebugOptions = {};
  if (autoplay) options.autoplay = true;
  if (instant) options.instant = true;
  return options;
}

export function createLevelContext(input: {
  container: HTMLElement;
  canvasHost: HTMLElement | null;
  manifest: LevelManifest;
  detail: LevelDetail;
  services: PlatformServices;
  locale: Locale;
  reducedMotion: boolean;
  completedBefore: boolean;
  debug?: DebugOptions;
  hooks: LevelHostHooks;
}): LevelContext {
  return {
    container: input.container,
    canvasHost: input.canvasHost,
    manifest: input.manifest,
    detail: input.detail,
    services: input.services,
    locale: input.locale,
    reducedMotion: input.reducedMotion,
    completedBefore: input.completedBefore,
    debug: input.debug,
    emit(type, payload) {
      recordDebugEvent(String(type));
      input.hooks.onEvent?.(type, payload);
    },
    requestExit(reason) {
      input.hooks.onExit(reason);
    },
  };
}
