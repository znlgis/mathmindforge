<script setup lang="ts">
import type { EvidenceDraft, LevelModule, LevelRuntime, RunSnapshot, ShippedLevelId, StampId, ToolId } from '@mmf/game-kit';
import { loadLevel } from '@mmf/content';
import type { LevelDetail } from '@mmf/content';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import ToolDock, { ArgumentBoard } from '@mmf/toolkit-ui';
import { navigate } from '../router';
import { registry } from '../registry';
import { createLevelContext, readDebugOptions } from '../shell/createLevelContext';
import {
  recordDebugError, recordDebugEvent, registerSubmit, setDebugSnapshot,
} from '../shell/debug';
import { platform } from '../shell/platform';
import { safeRemove } from '../shell/lifecycle';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';
import { useSettings } from '../stores/settings';

const props = defineProps<{ levelId: ShippedLevelId }>();

const host = ref<HTMLDivElement | null>(null);
const canvasHost = ref<HTMLDivElement | null>(null);
const module = shallowRef<LevelModule | null>(null);
const detail = ref<LevelDetail | null>(null);
const runtime = shallowRef<LevelRuntime | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const completed = ref(false);
const finalSnapshot = ref<RunSnapshot | null>(null);
const liveSnapshot = ref<RunSnapshot | null>(null);
const exitTimer = ref<number | null>(null);

const usedTools = computed(() => {
  const usage = finalSnapshot.value?.toolUsage;
  if (!usage) return 0;
  return Object.values(usage).filter((item) => item.used > 0).length;
});
const variantResults = computed(() => finalSnapshot.value?.verdict?.variantResults ?? []);
const passedCheckpoints = computed(() => {
  const checkpoints = finalSnapshot.value?.checkpoints;
  if (!checkpoints) return 0;
  return Object.values(checkpoints).filter(Boolean).length;
});

const progress = useProgress();
const settings = useSettings();
const { t, translator } = useI18n();

let disposed = false;
let offPause: (() => void) | null = null;
let offResume: (() => void) | null = null;
let evidenceQueue: EvidenceDraft[] = [];
let evidenceTimer: number | null = null;

function scheduleEvidenceFlush(): void {
  if (evidenceTimer !== null) return;
  evidenceTimer = window.setTimeout(() => {
    evidenceTimer = null;
    void flushEvidence();
  }, 2000);
}

/** 证据每 2 秒批量落盘；提交/退出前强制 flush，避免"失败→修正"缺前半段。 */
async function flushEvidence(): Promise<void> {
  if (evidenceTimer !== null) {
    window.clearTimeout(evidenceTimer);
    evidenceTimer = null;
  }
  if (evidenceQueue.length === 0) return;
  const batch = evidenceQueue;
  evidenceQueue = [];
  try {
    await progress.recordEvidence(props.levelId, batch);
  } catch (cause) {
    evidenceQueue = [...batch, ...evidenceQueue];
    console.warn('[mmf] 证据写入失败，稍后重试', cause);
  }
}

function clearExitTimer(): void {
  if (exitTimer.value !== null) {
    window.clearTimeout(exitTimer.value);
    exitTimer.value = null;
  }
}

function scheduleExit(): void {
  clearExitTimer();
  exitTimer.value = window.setTimeout(() => {
    navigate('/forge');
  }, 1800);
}

async function completeNow(stamps: StampId[], variantId: string): Promise<void> {
  if (completed.value) return;
  completed.value = true;
  const levelId = props.levelId;
  recordDebugEvent('level:complete:' + levelId);
  await progress.completeLevel({
    levelId,
    variantId,
    stamps,
    failureClassesSeen: (finalSnapshot.value?.runs ?? [])
      .map((run) => run.failureClass)
      .filter((value): value is string => Boolean(value)),
    revisionCount: finalSnapshot.value?.revision ?? 0,
    toolIds: (detail.value?.tools.map((tool) => tool.kind) ?? []) as ToolId[],
    durationMs: finalSnapshot.value?.lastRun?.durationMs ?? 0,
  });
  if (!progress.save?.levels[levelId]?.completed) {
    console.warn('[mmf] 完成状态没有写进存档');
  }
  await progress.refreshBadges();
  if (!readDebugOptions()?.instant) scheduleExit();
  else navigate('/forge');
}

async function submit(): Promise<void> {
  const rt = runtime.value;
  if (!rt) return;
  const result = await rt.dispatch({ type: 'submit', payload: {} });
  await flushEvidence();
  finalSnapshot.value = result.snapshot;
  setDebugSnapshot(result.snapshot);
  const verdict = result.verdict;
  if (verdict?.passed) {
    await completeNow(verdict.stamps, result.snapshot.variantId);
  } else {
    recordDebugEvent('level:retry:' + (verdict?.failure?.class ?? 'missing-evidence'));
  }
}

async function run(): Promise<void> {
  const rt = runtime.value;
  if (!rt) return;
  const result = await rt.dispatch({ type: 'run', payload: {} });
  setDebugSnapshot(result.snapshot);
  recordDebugEvent(result.verdict?.passed ? 'run:pass' : 'run:fail:' + (result.verdict?.failure?.class ?? 'none'));
}

async function start(): Promise<void> {
  if (disposed || !host.value) return;
  loading.value = true;
  error.value = null;
  try {
    await progress.init();
    const loader = registry[props.levelId];
    if (!loader) throw new Error('关卡没有登记：' + props.levelId);
    const loaded = (await loader()).default;
    if (disposed) return;
    module.value = loaded;
    const loadedDetail = await loadLevel(props.levelId);
    if (disposed || !loadedDetail) throw new Error('关卡内容没有加载成功：' + props.levelId);
    detail.value = loadedDetail;
    const debug = readDebugOptions();
    let runtimeRef: LevelRuntime | null = null;
    runtimeRef = loaded.createRuntime(loadedDetail, {
      seed: 101,
      now: platform.now,
      locale: 'zh-CN',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      autoplay: debug?.autoplay,
      onEvidence: (draft) => {
        evidenceQueue.push(draft);
        scheduleEvidenceFlush();
      },
    });
    runtime.value = runtimeRef;
    liveSnapshot.value = runtimeRef.snapshot();
    runtimeRef.subscribe((snapshot) => {
      liveSnapshot.value = snapshot;
      setDebugSnapshot(snapshot);
    });
    const ctx = createLevelContext({
      container: host.value,
      canvasHost: canvasHost.value,
      manifest: loaded.manifest,
      detail: loadedDetail,
      services: platform,
      locale: 'zh-CN',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      completedBefore: progress.completedBefore(props.levelId),
      debug,
      hooks: {
        onExit() {
          navigate('/forge');
        },
        onEvent(type) {
          recordDebugEvent(String(type));
        },
      },
    });
    await loaded.mount(ctx, runtimeRef);
    bindLifecycle();
    registerSubmit(submit);
    if (debug?.autoplay) {
      const result = await runtimeRef.autoplay();
      await flushEvidence();
      finalSnapshot.value = result.snapshot;
      setDebugSnapshot(result.snapshot);
      if (result.verdict?.passed) await completeNow(result.verdict.stamps, result.snapshot.variantId);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    error.value = t('level.loadFailed');
    recordDebugError(message);
    console.error('[mmf] 关卡加载失败', cause);
  } finally {
    loading.value = false;
  }
}

function bindLifecycle(): void {
  offPause = platform.lifecycle.onPause(() => {
    module.value?.pause();
    platform.audio.stopSpeech();
  });
  offResume = platform.lifecycle.onResume(() => {
    module.value?.resume();
  });
}

function leave(): void {
  platform.audio.stopSpeech();
  navigate('/forge');
}

async function replay(): Promise<void> {
  completed.value = false;
  clearExitTimer();
  const rt = runtime.value;
  if (!rt) return;
  await rt.reset();
  recordDebugEvent('level:replay');
}

onMounted(() => {
  void start();
});

onBeforeUnmount(async () => {
  disposed = true;
  clearExitTimer();
  offPause?.();
  offResume?.();
  offPause = null;
  offResume = null;
  platform.audio.stopSpeech();
  await flushEvidence();
  await module.value?.unmount();
  module.value = null;
  runtime.value = null;
  safeRemove(host.value);
  safeRemove(canvasHost.value);
});
</script>

<template>
  <div data-testid="workshop-view" class="relative flex h-full min-h-0 flex-col bg-cream">
    <header class="flex items-center justify-between gap-3 border-b border-grid bg-paper px-3 py-2">
      <button
        type="button"
        data-testid="level-back"
        class="min-h-11 rounded-2xl bg-card px-4 text-sm font-bold"
        @click="leave"
      >
        ← {{ t('level.back') }}
      </button>
      <div class="min-w-0 text-center">
        <p class="truncate text-base font-black">{{ detail?.title ?? t('level.loading') }}</p>
        <p class="truncate text-[11px] text-ink-soft">{{ detail?.thinkingTarget ?? '' }}</p>
      </div>
      <button
        type="button"
        class="min-h-11 min-w-11 rounded-2xl bg-card px-3 text-lg"
        :aria-label="settings.muted ? t('common.soundOn') : t('common.soundOff')"
        @click="settings.toggle()"
      >
        {{ settings.muted ? '🔇' : '🔊' }}
      </button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        v-if="module?.manifest.hasCanvas"
        class="relative min-h-[42vh] flex-1 border-b border-grid bg-paper lg:border-b-0 lg:border-r"
      >
        <div ref="canvasHost" data-testid="level-canvas" class="game-host h-full w-full" />
      </section>

      <aside
        class="flex min-h-0 w-full flex-col"
        :class="module?.manifest.hasCanvas ? 'lg:w-[420px]' : 'mx-auto max-w-3xl'"
      >
        <div ref="host" data-testid="level-dock" class="min-h-0 flex-1 overflow-y-auto p-3">
          <ToolDock
            v-if="runtime && detail"
            :tools="detail.tools"
            :runtime="runtime"
            :detail="detail"
            locale="zh-CN"
          />
          <ArgumentBoard
            v-if="runtime && detail?.template === 'argue' && liveSnapshot"
            :runtime="runtime"
            :snapshot="liveSnapshot"
            :detail="detail"
            :t="translator"
          />
        </div>
        <div class="border-t border-grid bg-paper p-3">
          <div class="flex gap-2">
            <button
              v-if="module?.manifest.runEnabled !== false"
              type="button"
              data-testid="level-run"
              class="min-h-12 flex-1 rounded-2xl bg-brass px-4 text-sm font-bold text-white active:scale-95"
              @click="run"
            >
              {{ t('level.run') }}
            </button>
            <button
              type="button"
              data-testid="level-submit"
              class="min-h-12 flex-1 rounded-2xl bg-teal px-4 text-sm font-bold text-white active:scale-95"
              @click="submit"
            >
              {{ t('level.submit') }}
            </button>
            <button
              type="button"
              class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold active:scale-95"
              @click="replay"
            >
              {{ t('level.reset') }}
            </button>
          </div>
        </div>
      </aside>
    </div>

    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-paper/95 text-sm font-semibold text-ink-soft"
    >
      {{ t('level.loading') }}
    </div>

    <div v-else-if="error" class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-paper/95 p-6 text-sm">
      <p class="font-bold text-red">{{ error }}</p>
      <button type="button" class="rounded-xl bg-blueprint px-4 py-2 text-white" @click="leave">
        {{ t('level.back') }}
      </button>
    </div>

    <div
      v-if="completed"
      data-testid="completion-panel"
      class="absolute inset-0 z-20 flex items-center justify-center bg-ink/60 p-4"
    >
      <div class="w-full max-w-md rounded-3xl border border-grid bg-card p-6 text-center shadow-xl">
        <p class="text-3xl" aria-hidden="true">🧩</p>
        <h2 class="mt-2 text-2xl font-black text-blueprint">{{ t('complete.title') }}</h2>
        <p class="mt-3 text-sm leading-6 text-ink-soft">{{ t('level.completed') }}</p>
        <div class="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold text-ink-soft">
          <span class="rounded-full bg-paper px-3 py-1">用了 {{ usedTools }} 件工具</span>
          <span class="rounded-full bg-paper px-3 py-1">通过 {{ passedCheckpoints }} 个检查点</span>
          <span class="rounded-full bg-paper px-3 py-1">印章 {{ finalSnapshot?.stamps.length ?? 0 }} 枚</span>
        </div>
        <div v-if="variantResults.length > 0" data-testid="variant-passport" class="mt-3 rounded-2xl bg-paper p-3 text-left">
          <p class="text-xs font-bold text-ink">变体通行证</p>
          <ul class="mt-1 flex flex-wrap gap-1.5">
            <li
              v-for="variant in variantResults"
              :key="variant.id"
              class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              :class="variant.passed ? 'bg-mint text-teal' : 'bg-red/10 text-red'"
            >
              {{ variant.id }} {{ variant.passed ? '通过' : '失效' }}
            </li>
          </ul>
        </div>
        <div class="mt-6 flex justify-center gap-3">
          <button type="button" class="min-h-12 rounded-2xl bg-card px-5 text-sm font-bold" @click="replay">
            {{ t('complete.replay') }}
          </button>
          <button type="button" class="min-h-12 rounded-2xl bg-blueprint px-5 text-sm font-bold text-white" @click="leave">
            {{ t('complete.back') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

