<script setup lang="ts">
import { LEVEL_SUMMARIES, localizedSummary } from '@mmf/content';
import type { StampId, ToolId } from '@mmf/content/ids';
import { buildTrail, localizeTrail } from '@mmf/evidence';
import { computed, onMounted } from 'vue';
import TrailList from '../components/TrailList.vue';
import { emptySave } from '@mmf/progress';
import { useProgress } from '../stores/progress';
import { useI18n } from '../shell/useI18n';

const progress = useProgress();
const { t, locale } = useI18n();

const titleOf = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const summary of LEVEL_SUMMARIES) map[summary.id] = localizedSummary(summary, locale.value).title;
  return map;
});

/** 最近 120 条回放（docs/02 §10.1）；再往前的记录留在证据库里，不被日志页淹没。 */
const entries = computed(() => [...(progress.save?.journal ?? [])].reverse().slice(0, 120));
const trail = computed(() => localizeTrail(
  buildTrail(progress.save ?? emptySave(0), progress.evidence, LEVEL_SUMMARIES, 80),
  LEVEL_SUMMARIES,
  locale.value,
));

/**
 * 失败类在运行时是英文 id（pattern-cycle-wrong）。直接显示会让孩子读到一串英文，
 * 这里按前缀归到 failcat.* 的中文分类，原始 id 只留在 title 里给大人排查。
 */
const FAIL_CATEGORY_PREFIXES: readonly (readonly [string, string])[] = [
  ['pattern', 'failcat.pattern'],
  ['construct', 'failcat.construct'],
  ['rule', 'failcat.rule'],
  ['counter', 'failcat.counter'],
  ['probe', 'failcat.probe'],
  ['exp', 'failcat.exp'],
  ['sim', 'failcat.sim'],
  ['queue', 'failcat.queue'],
  ['network', 'failcat.network'],
  ['schedule', 'failcat.schedule'],
  ['sampling', 'failcat.sampling'],
  ['inference', 'failcat.inference'],
  ['distribution', 'failcat.distribution'],
  ['frontier', 'failcat.frontier'],
  ['argue', 'failcat.argue'],
];

function failCategoryKey(failureClass: string): string {
  const prefix = failureClass.split('-')[0] ?? '';
  for (const [match, key] of FAIL_CATEGORY_PREFIXES) {
    if (prefix === match) return key;
  }
  return 'failcat.other';
}

/** 同一分类只显示一次，原始 id 们合进 title，悬停能看到全部。 */
function failureCategories(ids: readonly string[]): { key: string; raw: string[] }[] {
  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const key = failCategoryKey(id);
    const list = grouped.get(key);
    if (list) list.push(id);
    else grouped.set(key, [id]);
  }
  return [...grouped.entries()].map(([key, raw]) => ({ key, raw }));
}

const failureLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  for (const entry of entries.value) {
    for (const id of entry.failureClasses) labels[id] = t(failCategoryKey(id));
  }
  for (const item of trail.value) {
    if (item.failureClass) labels[item.failureClass] = t(failCategoryKey(item.failureClass));
  }
  return labels;
});

/** 印章名走 i18n 的 stamp.*（没有该键的 id 原样显示，不至于白屏）。 */
function stampLabel(id: StampId): string {
  return t('stamp.' + id);
}

function formatDate(at: number): string {
  return new Date(at).toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function toolLabel(id: ToolId): string {
  return t('tool.' + id + '.title');
}

onMounted(async () => {
  await progress.init();
  await progress.loadEvidence(300);
});
</script>

<template>
  <section data-testid="journal-view" class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-5">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div class="min-w-0">
        <h1 class="text-2xl font-black text-blueprint sm:text-3xl">{{ t('journal.title') }}</h1>
        <p class="mt-1 text-sm text-ink-soft">{{ t('journal.subtitle') }}</p>
      </div>
      <span class="rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-soft">
        {{ t('journal.recent', { n: entries.length }) }}
      </span>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div class="min-w-0">
        <h2 class="text-lg font-bold">{{ t('journal.replay') }}</h2>
        <div
          v-if="!progress.ready"
          data-testid="journal-loading"
          class="mt-3 rounded-2xl border border-grid bg-card p-6 text-sm text-ink-soft"
          role="status"
        >
          正在读取本机记录…
        </div>
        <div
          v-else-if="entries.length === 0"
          data-testid="journal-empty"
          class="mt-3 rounded-2xl border border-grid bg-card p-6 text-sm text-ink-soft"
        >
          还没有日志。完成一关后，这里会出现你的"失败→修改→通过"回放。
        </div>
        <p v-if="progress.initError" data-testid="journal-save-error" role="alert" class="mt-3 text-xs font-bold text-red">
          存档读取失败，本次显示的是空记录。
        </p>
        <ul v-else-if="entries.length > 0" class="mt-3 flex flex-col gap-3">
          <li
            v-for="entry in entries"
            :key="entry.id"
            data-testid="journal-entry"
            class="rounded-2xl border border-grid bg-card p-4"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="text-sm font-bold text-ink">{{ titleOf[entry.levelId] ?? entry.levelId }}</p>
              <span class="text-[11px] font-semibold text-ink-soft">{{ formatDate(entry.at) }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="tool in entry.toolIds"
                :key="tool"
                class="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink"
              >
                {{ toolLabel(tool) }}
              </span>
              <span
                v-for="stamp in entry.stamps"
                :key="stamp"
                :title="stamp"
                class="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-teal"
              >
                🔖 {{ stampLabel(stamp) }}
              </span>
            </div>
            <div v-if="entry.failureClasses.length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="category in failureCategories(entry.failureClasses)"
                :key="category.key"
                data-testid="journal-failure"
                class="rounded-full border border-grid bg-paper px-2.5 py-1 text-[11px] font-semibold text-red"
                :title="category.raw.join(', ')"
              >
                ⚠ {{ t(category.key) }}
              </span>
            </div>
            <p class="mt-1 text-xs text-ink-soft">修订 {{ entry.revisionCount }} 次</p>
          </li>
        </ul>
      </div>

      <div class="min-w-0">
        <h2 class="text-lg font-bold">{{ t('journal.timeline') }}</h2>
        <p class="mt-1 text-xs text-ink-soft">最近的观察、工具使用与运行结果。</p>
        <div class="mt-3">
          <TrailList :items="trail" :failure-labels="failureLabels" />
        </div>
      </div>
    </div>
  </section>
</template>
