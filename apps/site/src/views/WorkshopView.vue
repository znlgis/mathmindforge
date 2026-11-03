<script setup lang="ts">
import type {
  DebugOptions, EvidenceDraft, LevelModule, LevelRuntime, RunSnapshot, ShippedLevelId, StampId, ToolId,
} from '@mmf/game-kit';
import { loadLevel, localizedDetail } from '@mmf/content';
import type { LevelDetail } from '@mmf/content';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import ToolDock, { ArgumentBoard } from '@mmf/toolkit-ui';
import { navigate } from '../router';
import { registry } from '../registry';
import { createLevelContext, readDebugOptions } from '../shell/createLevelContext';
import {
  recordDebugError, recordDebugEvent, registerSubmit, setDebugSnapshot,
} from '../shell/debug';
import { platform } from '../shell/platform';
import { seedFor } from '../shell/seed';
import { safeRemove } from '../shell/lifecycle';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';
import { useSettings } from '../stores/settings';

const props = defineProps<{ levelId: ShippedLevelId }>();

/** 证据队列上限：写盘长期失败时不能让队列无限长，否则内存只增不减。 */
const MAX_EVIDENCE_QUEUE = 400;
/** 同一批证据最多重试次数，超过就丢弃并记一条调试错误。 */
const MAX_EVIDENCE_RETRY = 3;
/** 通关后停留 1.8 秒再回星图，给孩子看完完成面板的时间。 */
const EXIT_DELAY_MS = 1800;

const host = ref<HTMLDivElement | null>(null);
const canvasHost = ref<HTMLDivElement | null>(null);
const completionPanel = ref<HTMLDivElement | null>(null);
const module = shallowRef<LevelModule | null>(null);
// detail / snapshot 都是大对象整棵替换，不能进深层 reactive（docs/02 §19-10）
const detail = shallowRef<LevelDetail | null>(null);
const runtime = shallowRef<LevelRuntime | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const completed = ref(false);
const saveFailed = ref(false);
const actionPending = ref(false);
const finalSnapshot = shallowRef<RunSnapshot | null>(null);
const liveSnapshot = shallowRef<RunSnapshot | null>(null);
const exitTimer = ref<number | null>(null);

const display = computed(() => (detail.value ? localizedDetail(detail.value, locale.value) : null));
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
const ready = computed(() => (
  !loading.value && error.value === null && runtime.value !== null && detail.value !== null
));

const progress = useProgress();
const settings = useSettings();
const { t, translator, locale } = useI18n();

let disposed = false;
let debugOptions: DebugOptions | undefined;
let unsubscribe: (() => void) | null = null;
let offPause: (() => void) | null = null;
let offResume: (() => void) | null = null;
let evidenceQueue: EvidenceDraft[] = [];
let evidenceTimer: number | null = null;
let evidenceRetries = 0;
const recordedEvidencePhases = new Set<string>();

function scheduleEvidenceFlush(): void {
  if (disposed || evidenceTimer !== null) return;
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
    evidenceRetries = 0;
  } catch (cause) {
    evidenceRetries += 1;
    if (evidenceRetries > MAX_EVIDENCE_RETRY) {
      recordDebugError('证据写入连续失败，已丢弃 ' + batch.length + ' 条；' + String(cause));
      return;
    }
    evidenceQueue = [...batch, ...evidenceQueue].slice(-MAX_EVIDENCE_QUEUE);
    console.warn('[mmf] 证据写入失败，稍后重试', cause);
    // 没有新草稿时也要再排一次，否则这批证据永远等不到重试。
    scheduleEvidenceFlush();
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
    exitTimer.value = null;
    navigate('/forge');
  }, EXIT_DELAY_MS);
}

/**
 * 完成事件必须在落盘之后发：e2e 用 level:complete 当"存档已就绪"的信号（docs/02 §10.5），
 * 事件早于写盘会让第二个页面读到旧档（本项目 e2e 双页用例真的踩到过）。
 */
async function completeNow(stamps: StampId[], variantId: string): Promise<void> {
  if (completed.value) return;
  completed.value = true;
  const levelId = props.levelId;
  try {
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
      saveFailed.value = true;
      recordDebugError('完成状态没有写进存档：' + levelId);
    }
  } catch (cause) {
    saveFailed.value = true;
    recordDebugError('存档写入失败：' + String(cause));
  }
  // 徽章刷新失败不影响"这一关过了"的事实，但要留下可诊断的痕迹。
  try {
    await progress.refreshBadges();
  } catch (cause) {
    recordDebugError('徽章刷新失败：' + String(cause));
  }
  if (!saveFailed.value) {
    recordDebugEvent('level:complete:' + levelId);
    recordDebugEvent('journal:add');
  }
  if (!debugOptions?.instant) scheduleExit();
  else navigate('/forge');
}

async function submit(): Promise<void> {
  const rt = runtime.value;
  if (!rt || actionPending.value) return;
  actionPending.value = true;
  try {
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
  } catch (cause) {
    recordDebugError('提交失败：' + String(cause));
  } finally {
    actionPending.value = false;
  }
}

async function run(): Promise<void> {
  const rt = runtime.value;
  if (!rt || actionPending.value) return;
  actionPending.value = true;
  try {
    const result = await rt.dispatch({ type: 'run', payload: {} });
    setDebugSnapshot(result.snapshot);
    recordDebugEvent(result.verdict?.passed ? 'run:pass' : 'run:fail:' + (result.verdict?.failure?.class ?? 'none'));
  } catch (cause) {
    recordDebugError('运行失败：' + String(cause));
  } finally {
    actionPending.value = false;
  }
}

async function start(): Promise<void> {
  if (disposed || !host.value) return;
  loading.value = true;
  error.value = null;
  try {
    // 先 await 读档：深链秒通关时，旧快照不能覆盖刚写入的完成状态（docs/02 §10.3）
    await progress.init();
    const loader = registry[props.levelId];
    if (!loader) throw new Error('关卡没有登记：' + props.levelId);
    const loaded = (await loader()).default;
    if (disposed) return;
    module.value = loaded;
    // hasCanvas 的画布容器由 v-if 渲染：等这一拍 DOM 出来，ctx.canvasHost 才不会为 null
    await nextTick();
    const loadedDetail = await loadLevel(props.levelId);
    if (disposed) return;
    if (!loadedDetail) throw new Error('关卡内容没有加载成功：' + props.levelId);
    detail.value = loadedDetail;
    debugOptions = readDebugOptions();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const runtimeRef = loaded.createRuntime(loadedDetail, {
      // 关卡内容目前只有中文（英文内容补丁在 v0.9），运行时语言按内容走，界面语言由外壳负责
      seed: seedFor(props.levelId, progress.save?.profile.id ?? 'local-default'),
      now: platform.now,
      locale: 'zh-CN',
      reducedMotion,
      autoplay: debugOptions?.autoplay,
      onEvidence: (draft) => {
        evidenceQueue = [...evidenceQueue, draft].slice(-MAX_EVIDENCE_QUEUE);
        if (!recordedEvidencePhases.has(draft.phase)) {
          recordedEvidencePhases.add(draft.phase);
          recordDebugEvent('evidence:' + draft.phase);
        }
        scheduleEvidenceFlush();
      },
    });
    runtime.value = runtimeRef;
    liveSnapshot.value = runtimeRef.snapshot();
    unsubscribe = runtimeRef.subscribe((snapshot) => {
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
      reducedMotion,
      completedBefore: progress.completedBefore(props.levelId),
      debug: debugOptions,
      hooks: {
        onExit() {
          navigate('/forge');
        },
      },
    });
    await loaded.mount(ctx, runtimeRef);
    if (disposed) {
      // 加载期间已经离开：mount 可能晚于卸载创建了 canvas，这里补一次销毁，否则画布和 rAF 会残留
      await teardown();
      return;
    }
    recordDebugEvent('level:ready:' + props.levelId);
    bindLifecycle();
    registerSubmit(submit);
    if (debugOptions?.autoplay) {
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
    // 失败也要把已经建了一半的运行时/画布收干净
    await teardown();
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

async function teardown(): Promise<void> {
  clearExitTimer();
  offPause?.();
  offResume?.();
  offPause = null;
  offResume = null;
  unsubscribe?.();
  unsubscribe = null;
  registerSubmit(null);
  setDebugSnapshot(null);
  const active = module.value;
  module.value = null;
  runtime.value = null;
  liveSnapshot.value = null;
  if (active) {
    try {
      await active.unmount();
    } catch (cause) {
      recordDebugError('关卡卸载失败：' + String(cause));
    }
  }
  safeRemove(canvasHost.value);
  safeRemove(host.value);
}

function leave(): void {
  platform.audio.stopSpeech();
  navigate('/forge');
}

async function replay(): Promise<void> {
  completed.value = false;
  saveFailed.value = false;
  clearExitTimer();
  finalSnapshot.value = null;
  const rt = runtime.value;
  if (!rt) return;
  try {
    await rt.reset();
  } catch (cause) {
    recordDebugError('重来失败：' + String(cause));
  }
  liveSnapshot.value = rt.snapshot();
  setDebugSnapshot(liveSnapshot.value);
  recordDebugEvent('level:replay');
}

onMounted(() => {
  void start();
});

onBeforeUnmount(() => {
  // 不写成 async：Vue 不会等异步钩子，等 await 期间新页面可能已经挂载同一关卡的模块单例，
  // 那时再 unmount 会把新画布销毁。同步拆干净，证据落盘单独发起。
  disposed = true;
  platform.audio.stopSpeech();
  void teardown();
  void flushEvidence();
});

// 完成面板是模态遮罩：出现时把焦点移进去，读屏才能读到"这一关通过"（键盘焦点也不会留在被盖住的按钮上）
watch(completed, async (value) => {
  if (!value) return;
  await nextTick();
  completionPanel.value?.focus();
});
</script>

<template>
  <div
    data-testid="workshop-view"
    :data-ready="ready ? '1' : '0'"
    class="relative flex h-full min-h-0 flex-col bg-cream"
  >
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
        <h1 class="truncate text-base font-black">{{ display?.title ?? t('level.loading') }}</h1>
        <p class="truncate text-[11px] text-ink-soft">{{ display?.thinkingTarget ?? '' }}</p>
      </div>
      <button
        type="button"
        class="min-h-11 min-w-11 rounded-2xl bg-card px-3 text-lg"
        :aria-label="settings.muted ? t('common.soundOn') : t('common.soundOff')"
        :aria-pressed="settings.muted"
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
            :locale="locale"
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
              class="min-h-12 flex-1 rounded-2xl bg-brass px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-50"
              :disabled="actionPending || completed"
              @click="run"
            >
              {{ t('level.run') }}
            </button>
            <button
              type="button"
              data-testid="level-submit"
              class="min-h-12 flex-1 rounded-2xl bg-teal px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-50"
              :disabled="actionPending || completed"
              @click="submit"
            >
              {{ t('level.submit') }}
            </button>
            <button
              type="button"
              data-testid="level-reset"
              class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold active:scale-95 disabled:opacity-50"
              :disabled="actionPending"
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
      role="status"
      aria-live="polite"
    >
      {{ t('level.loading') }}
    </div>

    <div
      v-else-if="error"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-paper/95 p-6 text-sm"
      role="alert"
    >
      <p class="font-bold text-red">{{ error }}</p>
      <p v-if="progress.initError" class="text-xs text-ink-soft">存档读取失败，本次进度可能没有保存。</p>
      <div class="flex gap-3">
        <button type="button" class="min-h-11 rounded-xl bg-card px-4 py-2 font-bold" @click="start">
          {{ t('level.reset') }}
        </button>
        <button type="button" class="min-h-11 rounded-xl bg-blueprint px-4 py-2 text-white" @click="leave">
          {{ t('level.back') }}
        </button>
      </div>
    </div>

    <div
      v-if="completed"
      ref="completionPanel"
      data-testid="completion-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-title"
      tabindex="-1"
      class="absolute inset-0 z-20 flex items-center justify-center bg-ink/60 p-4 focus:outline-none"
    >
      <div class="w-full max-w-md rounded-3xl border border-grid bg-card p-6 text-center shadow-xl">
        <p class="text-3xl" aria-hidden="true">🧩</p>
        <h2 id="completion-title" class="mt-2 text-2xl font-black text-blueprint">{{ t('complete.title') }}</h2>
        <p class="mt-3 text-sm leading-6 text-ink-soft">{{ t('level.completed') }}</p>
        <div class="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold text-ink-soft">
          <span class="rounded-full bg-paper px-3 py-1">用了 {{ usedTools }} 件工具</span>
          <span class="rounded-full bg-paper px-3 py-1">通过 {{ passedCheckpoints }} 个检查点</span>
          <span class="rounded-full bg-paper px-3 py-1">印章 {{ finalSnapshot?.stamps.length ?? 0 }} 枚</span>
        </div>
        <p v-if="saveFailed" role="alert" class="mt-3 rounded-xl bg-red/10 px-3 py-2 text-xs font-bold text-red">
          这一关的进度没有写进存档，刷新后可能丢失。
        </p>
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
          <button type="button" data-testid="completion-replay" class="min-h-12 rounded-2xl bg-card px-5 text-sm font-bold" @click="replay">
            {{ t('complete.replay') }}
          </button>
          <button type="button" data-testid="completion-back" class="min-h-12 rounded-2xl bg-blueprint px-5 text-sm font-bold text-white" @click="leave">
            {{ t('complete.back') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
