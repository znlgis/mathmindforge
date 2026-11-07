<script setup lang="ts">
import type {
  DebugOptions, EvidenceDraft, LevelModule, LevelRuntime, RunSnapshot, ShippedLevelId, StampId, ToolId,
} from '@mmf/game-kit';
import { LEVEL_SUMMARIES, getLevelSummary, loadLevel, localizedDetail } from '@mmf/content';
import type { LevelDetail } from '@mmf/content';
import { evaluateBadges } from '@mmf/evidence';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import AnswerDock, { ArgumentBoard } from '@mmf/toolkit-ui';
import { navigate } from '../router';
import { registry } from '../registry';
import { createLevelContext, readDebugOptions } from '../shell/createLevelContext';
import {
  recordDebugError, recordDebugEvent, registerSubmit, setDebugSnapshot,
} from '../shell/debug';
import { platform } from '../shell/platform';
import { seedFor } from '../shell/seed';
import { safeRemove } from '../shell/lifecycle';
import { nextLevelId } from '../shell/progression';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';
import { useSettings } from '../stores/settings';

const props = defineProps<{ levelId: ShippedLevelId }>();

/** 证据队列上限：写盘长期失败时不能让队列无限长，否则内存只增不减。 */
const MAX_EVIDENCE_QUEUE = 400;
/** 同一批证据最多重试次数，超过就丢弃并记一条调试错误。 */
const MAX_EVIDENCE_RETRY = 3;
/** 玩家停手多久后自动判题：太短会在"还在填"时误报，太长会让人觉得没反应。 */
const AUTO_JUDGE_DELAY_MS = 500;
/** 答对后成功遮罩停留多久再进下一关（instant 模式是 e2e 用的快进）。 */
const AUTO_NEXT_DELAY_MS = 900;
const INSTANT_NEXT_DELAY_MS = 120;

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
const newBadges = ref<{ id: string; title: string }[]>([]);
/** 提交/运行那一刻的工具使用总数：之后只要玩家再动工具，旧横幅就作废（修"横幅粘住"）。 */
const verdictUsageAt = ref<number | null>(null);
/** 上一次操作被运行时拒绝时的消息：以前只播一声"重试"，玩家看到"点了没反应"。 */
const actionError = ref<string | null>(null);

const display = computed(() => (detail.value ? localizedDetail(detail.value, locale.value) : null));
/** 摘要里才有 emoji 与学段；标题栏用它把"这是哪个学段、什么主题"说清楚。 */
const summary = computed(() => getLevelSummary(props.levelId));
const bandLabel = computed(() => (summary.value ? t('band.' + summary.value.band) : ''));
const threadLabel = computed(() => (summary.value ? t('thread.' + summary.value.thread) : ''));
const variantResults = computed(() => finalSnapshot.value?.verdict?.variantResults ?? []);
/** 过关遮罩上的那句话：自动跳下一关，还是回星图。 */
const successMessage = computed(() => (nextId.value ? t('complete.autoNext') : t('complete.autoFinish')));
const ready = computed(() => (
  !loading.value && error.value === null && runtime.value !== null && detail.value !== null
));
/**
 * 本轮简化：关卡里不再有「工具卡」这一层。
 * pattern / rule 的答案就在画布上，右侧只留失败提示与动作条；
 * 其余模板的答案面板直接平铺（argue 用论证板）。
 */
const hasAnswerArea = computed(() => {
  const template = detail.value?.template;
  return template !== undefined && template !== 'pattern' && template !== 'rule';
});
/** 画布 + 作答面板并排；pattern / rule 只有画布，整块宽度留给它。 */
const splitLayout = computed(() => module.value?.manifest.hasCanvas === true && hasAnswerArea.value);

const progress = useProgress();
const settings = useSettings();
const { t, translator, locale } = useI18n();

/** 工具使用总数：变化即说明玩家刚动过工具。 */
function usageTotal(snapshot: RunSnapshot | null): number {
  if (!snapshot) return 0;
  return Object.values(snapshot.toolUsage).reduce((sum, item) => sum + item.used, 0);
}
const usageNow = computed(() => usageTotal(liveSnapshot.value));

/**
 * 失败提示只属于"刚刚那次提交"：提交后玩家一旦再动工具，旧提示立刻消失。
 * 作答面板里原来常驻读 snapshot.verdict，导致补齐步骤后横幅还粘着旧文案。
 */
const failureCopy = computed<{ message: string; hint: string | null } | null>(() => {
  const snapshot = liveSnapshot.value;
  const currentDetail = detail.value;
  if (!snapshot || !currentDetail) return null;
  if (verdictUsageAt.value === null || usageNow.value !== verdictUsageAt.value) return null;
  const verdict = snapshot.verdict;
  if (!verdict || verdict.passed) return null;
  if (verdict.failure) {
    const copy = currentDetail.feedback[verdict.failure.class];
    if (copy) return { message: t(copy.messageKey), hint: t(copy.hintKey) };
    // 内容里没写这一类的反馈时，直接用运行时算出来的原因（例如"第 3 步撞墙"），
    // 不能只显示一句"还差一点"——玩家得知道错在哪。
    const cause = verdict.failure.causes?.[0];
    if (cause) return { message: t(cause.messageKey, cause.params), hint: currentDetail.retry };
    return { message: t('level.failed'), hint: currentDetail.retry };
  }
  const first = verdict.missingEvidence[0];
  if (first) return { message: t('level.failureMissing', { step: t(first.messageKey) }), hint: null };
  return null;
});

const nextId = computed(() => nextLevelId(progress.save, props.levelId));

let disposed = false;
/** 自动播放正在跑：它自己会 submit，不能让自动判题再插一脚。 */
let autoplayRunning = false;
let debugOptions: DebugOptions | undefined;
let unsubscribe: (() => void) | null = null;
let offPause: (() => void) | null = null;
let offResume: (() => void) | null = null;
let evidenceQueue: EvidenceDraft[] = [];
let evidenceTimer: number | null = null;
let evidenceRetries = 0;
/** 自动判题的防抖计时器。 */
let autoJudgeTimer: number | null = null;
/** 过关后自动跳下一关的计时器。 */
let advanceTimer: number | null = null;
/** 上一次自动判题时的工具使用总数：没有新操作就不再重复判（防 snapshot 抖动导致判题循环）。 */
let autoJudgedUsage = -1;
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

function clearAutoJudge(): void {
  if (autoJudgeTimer !== null) {
    window.clearTimeout(autoJudgeTimer);
    autoJudgeTimer = null;
  }
}

function clearAdvanceTimer(): void {
  if (advanceTimer !== null) {
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }
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
    const earned = await progress.refreshBadges();
    if (earned.length > 0 && progress.save) {
      const views = evaluateBadges(progress.save, progress.evidence, LEVEL_SUMMARIES, locale.value);
      const byId = new Map(views.map((view) => [view.id, view.title]));
      newBadges.value = earned.map((id) => ({ id, title: byId.get(id) ?? id }));
    }
  } catch (cause) {
    recordDebugError('徽章刷新失败：' + String(cause));
  }
  if (!saveFailed.value) {
    recordDebugEvent('level:complete:' + levelId);
    recordDebugEvent('journal:add');
  }
  // 答对就直接进下一关（docs/13）：成功遮罩停一下让玩家看见"过了"，然后自动跳。
  // 存档失败时停在面板上，别把"没存上"的警告一起带走。
  if (!saveFailed.value) scheduleAdvance();
}

/** 过关后的自动推进：有下一关就进下一关，没有就回星图。 */
function scheduleAdvance(): void {
  clearAdvanceTimer();
  const delay = debugOptions?.instant ? INSTANT_NEXT_DELAY_MS : AUTO_NEXT_DELAY_MS;
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null;
    if (disposed) return;
    goNext();
  }, delay);
}

async function submit(): Promise<void> {
  const rt = runtime.value;
  if (!rt || actionPending.value) return;
  actionPending.value = true;
  try {
    const result = await rt.dispatch({ type: 'submit', payload: {} });
    await flushEvidence();
    finalSnapshot.value = result.snapshot;
    liveSnapshot.value = result.snapshot;
    verdictUsageAt.value = usageTotal(result.snapshot);
    setDebugSnapshot(result.snapshot);
    // 运行时拒绝（例如答案还缺一块）时把原因显示出来，不能只播一声"重试"。
    actionError.value = result.ok ? null : (result.message ? t(result.message) : t('level.failed'));
    const verdict = result.verdict;
    if (verdict?.passed) {
      platform.audio.play('complete');
      await completeNow(verdict.stamps, result.snapshot.variantId);
    } else {
      platform.audio.play('retry');
      recordDebugEvent('level:retry:' + (verdict?.failure?.class ?? 'missing-evidence'));
    }
  } catch (cause) {
    recordDebugError('提交失败：' + String(cause));
  } finally {
    actionPending.value = false;
  }
}

/**
 * 自动判题（docs/13）：答案一填完就判，玩家不用再点「完成」。
 * - 只在玩家真的动过手之后触发（工具使用数增加）；挂载、自动播放都不算；
 * - 每次操作后等 AUTO_JUDGE_DELAY_MS，连续操作只判最后一次；
 * - 判定顺序仍是"先结构校验、再报缺步骤"，答错原因走 failure-banner；
 * - 判过就不再重复判（autoJudgedUsage），玩家一改答案才会重新判。
 */
function scheduleAutoJudge(usage: number): void {
  clearAutoJudge();
  autoJudgeTimer = window.setTimeout(() => {
    autoJudgeTimer = null;
    void autoJudge(usage);
  }, AUTO_JUDGE_DELAY_MS);
}

async function autoJudge(usage: number): Promise<void> {
  const snapshot = liveSnapshot.value;
  if (disposed || completed.value || actionPending.value || !snapshot) return;
  if (!snapshot.answerComplete) return;
  // 防抖期间玩家又改了答案：这一次作废，等下一次快照。
  if (usageTotal(snapshot) !== usage) return;
  autoJudgedUsage = usage;
  await submit();
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
      autoplayRunning = true;
      const result = await runtimeRef.autoplay();
      await flushEvidence();
      finalSnapshot.value = result.snapshot;
      liveSnapshot.value = result.snapshot;
      verdictUsageAt.value = usageTotal(result.snapshot);
      setDebugSnapshot(result.snapshot);
      autoplayRunning = false;
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
  clearAutoJudge();
  clearAdvanceTimer();
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
  clearAutoJudge();
  clearAdvanceTimer();
  platform.audio.stopSpeech();
  navigate('/forge');
}

function goNext(): void {
  const id = nextId.value;
  platform.audio.stopSpeech();
  if (id) navigate('/play/' + id);
  else navigate('/forge');
}

async function replay(): Promise<void> {
  completed.value = false;
  saveFailed.value = false;
  newBadges.value = [];
  verdictUsageAt.value = null;
  actionError.value = null;
  autoJudgedUsage = -1;
  clearAutoJudge();
  clearAdvanceTimer();
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

/**
 * 即时音效：不在每个工具组件里各调一次，而是统一听快照变化。
 * 好处是 toolkit-ui 保持"纯 UI 不依赖 platform"，新增工具也不用再接线。
 */
let lastUsageTotal = 0;
let lastRunId: string | null = null;
watch(liveSnapshot, (snapshot) => {
  // 玩家一动手就撤掉上一次的"操作被拒"消息，避免它粘在屏幕上。
  if (snapshot && actionError.value !== null) actionError.value = null;
  // 自动判题：玩家动过手 + 答案填完了 → 等输入落定后自动提交（答对直接下一关）。
  if (snapshot && !autoplayRunning) {
    const usage = usageTotal(snapshot);
    // usage > 0：挂载时的初始快照不算玩家操作，哪怕某个模板开局就"答案已完整"也不判。
    if (usage > 0 && usage > autoJudgedUsage && snapshot.answerComplete) scheduleAutoJudge(usage);
  }
  if (!snapshot || settings.muted) return;
  const total = usageTotal(snapshot);
  if (total > lastUsageTotal) platform.audio.play('tap');
  lastUsageTotal = total;
  const runId = snapshot.lastRun?.id ?? null;
  if (runId !== null && runId !== lastRunId) {
    platform.audio.play(snapshot.lastRun?.outcome === 'pass' ? 'correct' : 'retry');
  }
  lastRunId = runId;
});

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
    <header class="flex shrink-0 items-center justify-between gap-3 border-b border-grid bg-paper px-3 py-2">
      <button
        type="button"
        data-testid="level-back"
        class="min-h-11 shrink-0 whitespace-nowrap rounded-2xl bg-card px-4 text-sm font-bold"
        @click="leave"
      >
        ← {{ t('level.back') }}
      </button>
      <div class="min-w-0 text-center">
        <h1 class="truncate text-base font-black">
          <span aria-hidden="true">{{ summary?.emoji }}</span>
          {{ display?.title ?? t('level.loading') }}
        </h1>
        <p class="truncate text-[11px] text-ink-soft">
          <span v-if="bandLabel" class="font-bold text-brass">{{ bandLabel }} · {{ threadLabel }}</span>
          <span v-if="bandLabel" aria-hidden="true"> · </span>
          {{ display?.thinkingTarget ?? '' }}
        </p>
      </div>
      <button
        type="button"
        class="min-h-11 min-w-11 shrink-0 rounded-2xl bg-card px-3 text-lg"
        :aria-label="settings.muted ? t('common.soundOn') : t('common.soundOff')"
        :aria-pressed="settings.muted"
        @click="settings.toggle()"
      >
        {{ settings.muted ? '🔇' : '🔊' }}
      </button>
    </header>

    <!-- 情境条：每关写好的 intro / prompt 终于上屏了（以前只渲染 title + thinkingTarget）。
         压成一行：竖屏放不下时 prompt 自己换行，横屏只占 34px，把高度留给工具区。 -->
    <div
      v-if="display && (display.intro || display.prompt)"
      data-testid="level-mission"
      class="flex shrink-0 flex-wrap items-baseline justify-center gap-x-2 border-b border-grid bg-mint/40 px-3 py-1 text-center"
    >
      <p class="text-sm font-bold text-ink">{{ display.intro }}</p>
      <p class="text-xs font-semibold text-ink-soft">{{ display.prompt }}</p>
    </div>

    <div class="flex min-h-0 flex-1" :class="splitLayout ? 'flex-col lg:flex-row' : 'flex-col'">
      <section
        v-if="module?.manifest.hasCanvas"
        class="relative min-h-[38vh] flex-1 min-w-0 border-b border-grid bg-paper lg:min-h-0 lg:border-b-0 lg:border-r"
      >
        <div ref="canvasHost" data-testid="level-canvas" class="game-host h-full w-full" />
      </section>

      <aside
        class="flex min-h-0 w-full flex-col"
        :class="[
          splitLayout ? 'lg:w-[420px] lg:flex-none' : '',
          module?.manifest.hasCanvas ? '' : 'flex-1',
        ]"
      >
        <!-- 失败提示：移出滚动容器，钉在作答面板上方，永远不会被滚出视野 -->
        <div
          v-if="failureCopy"
          data-testid="failure-banner"
          role="alert"
          class="shrink-0 border-b border-red/40 bg-red/10 px-3 py-2"
        >
          <p class="text-sm font-bold text-red">{{ failureCopy.message }}</p>
          <p v-if="failureCopy.hint" class="mt-0.5 text-xs text-ink-soft">{{ failureCopy.hint }}</p>
        </div>

        <!-- 运行时拒绝操作时的消息：以前只播一声"重试"，玩家看不到原因（例如"还差一块"） -->
        <div
          v-else-if="actionError"
          data-testid="action-error"
          role="alert"
          class="shrink-0 border-b border-red/40 bg-red/10 px-3 py-2"
        >
          <p class="text-sm font-bold text-red">{{ actionError }}</p>
        </div>

        <!-- pattern / rule：答案在画布上，这里不渲染卡片；保留 host 容器给模板挂载上下文用。 -->
        <div v-else ref="host" class="hidden" aria-hidden="true" />
        <div
          v-if="hasAnswerArea"
          ref="host"
          data-testid="level-dock"
          class="min-h-0 flex-1 overflow-y-auto p-2.5"
        >
          <div :class="splitLayout ? '' : 'mx-auto w-full max-w-3xl'">
            <AnswerDock
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
        </div>

        <div class="shrink-0 border-t border-grid bg-paper p-3">
          <div
            class="flex flex-wrap gap-2"
            :class="module?.manifest.hasCanvas ? '' : 'mx-auto w-full max-w-3xl'"
          >
            <!-- 没有「完成」按钮：答案填完就自动判题（docs/13）。保留「重来」给走偏的玩家一键复位。 -->
            <p data-testid="level-auto-judge" class="min-h-12 flex flex-1 items-center text-xs font-semibold text-ink-soft">
              {{ t('level.autoJudgeHint') }}
            </p>
            <button
              type="button"
              data-testid="level-reset"
              class="min-h-12 whitespace-nowrap rounded-2xl bg-card px-4 text-sm font-bold active:scale-95 disabled:opacity-50"
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

    <!-- 过关成功：只停一下让玩家看见"过了"，然后自动进下一关（half second 级，点都不用点）。
         存档失败时才退回可交互面板，不能把"没存上"的警告一起带走。 -->
    <div
      v-if="completed && !saveFailed"
      ref="completionPanel"
      data-testid="level-success"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-title"
      tabindex="-1"
      class="absolute inset-0 z-20 flex items-center justify-center bg-ink/35 p-4 focus:outline-none"
    >
      <div class="w-full max-w-sm rounded-3xl border border-grid bg-card px-6 py-5 text-center shadow-xl">
        <p class="text-4xl" aria-hidden="true">🎉</p>
        <h2 id="completion-title" class="mt-2 text-xl font-black text-blueprint">{{ t('complete.title') }}</h2>
        <p data-testid="level-success-message" class="mt-1 text-sm font-bold text-teal">{{ successMessage }}</p>
        <ul
          v-if="newBadges.length > 0"
          data-testid="completion-badges"
          class="mt-3 flex flex-wrap justify-center gap-2"
        >
          <li
            v-for="badge in newBadges"
            :key="badge.id"
            class="rounded-full bg-brass/15 px-3 py-1 text-xs font-bold text-brass"
          >
            🏅 {{ badge.title }}
          </li>
        </ul>
        <p
          v-if="variantResults.length > 0"
          data-testid="variant-passport"
          class="mt-2 text-[11px] font-semibold text-ink-soft"
        >
          {{ t('complete.passport') }}
          <span v-for="variant in variantResults" :key="variant.id" class="ml-1">
            {{ variant.id }} {{ variant.passed ? '✓' : '✗' }}
          </span>
        </p>
      </div>
    </div>

    <!-- 存档失败：停在这里，让玩家看得到警告，并保留重玩/回星图。 -->
    <div
      v-if="completed && saveFailed"
      ref="completionPanel"
      data-testid="completion-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-title-save"
      tabindex="-1"
      class="absolute inset-0 z-20 flex items-center justify-center bg-ink/60 p-4 focus:outline-none"
    >
      <div class="w-full max-w-md rounded-3xl border border-grid bg-card p-6 text-center shadow-xl">
        <h2 id="completion-title-save" class="text-2xl font-black text-blueprint">{{ t('complete.title') }}</h2>
        <p role="alert" class="mt-3 rounded-xl bg-red/10 px-3 py-2 text-xs font-bold text-red">
          这一关的进度没有写进存档，刷新后可能丢失。
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-3">
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