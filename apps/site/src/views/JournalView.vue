<script setup lang="ts">
import { LEVEL_SUMMARIES } from '@mmf/content';
import { TOOL_LABELS } from '@mmf/content/ids';
import type { ToolId } from '@mmf/content/ids';
import { buildTrail, localizeTrail } from '@mmf/evidence';
import { computed, onMounted } from 'vue';
import TrailList from '../components/TrailList.vue';
import { emptySave } from '@mmf/progress';
import { useProgress } from '../stores/progress';
import { useI18n } from '../shell/useI18n';

const progress = useProgress();
const { locale } = useI18n();

const titleOf = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const summary of LEVEL_SUMMARIES) map[summary.id] = summary.title;
  return map;
});

const entries = computed(() => [...(progress.save?.journal ?? [])].reverse().slice(0, 20));
const trail = computed(() => localizeTrail(
  buildTrail(progress.save ?? emptySave(0), progress.evidence, LEVEL_SUMMARIES, 80),
  LEVEL_SUMMARIES,
  locale.value,
));


function formatDate(at: number): string {
  return new Date(at).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function toolLabel(id: ToolId): string {
  return TOOL_LABELS[id] ?? id;
}

onMounted(async () => {
  await progress.init();
  await progress.loadEvidence(300);
});
</script>

<template>
  <section data-testid="journal-view" class="mx-auto max-w-4xl px-5 py-8">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 class="text-2xl font-black text-blueprint">思维日志</h1>
        <p class="mt-1 text-sm text-ink-soft">记录每一次观察、运行、失败与修正，而不是做题数量。</p>
      </div>
      <span class="rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-soft">
        {{ entries.length }} 条最近记录
      </span>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        <h2 class="text-lg font-bold">回放</h2>
        <div v-if="entries.length === 0" class="mt-3 rounded-2xl border border-grid bg-card p-6 text-sm text-ink-soft">
          还没有日志。完成一关后，这里会出现你的"失败→修改→通过"回放。
        </div>
        <ul v-else class="mt-3 flex flex-col gap-3">
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
                class="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-teal"
              >
                {{ stamp }}
              </span>
            </div>
            <p v-if="entry.failureClasses.length > 0" class="mt-2 text-xs text-ink-soft">
              遇到的结构问题：{{ entry.failureClasses.join('、') }}
            </p>
            <p class="mt-1 text-xs text-ink-soft">修订 {{ entry.revisionCount }} 次</p>
          </li>
        </ul>
      </div>

      <div>
        <h2 class="text-lg font-bold">证据时间线</h2>
        <p class="mt-1 text-xs text-ink-soft">最近的观察、工具使用与运行结果。</p>
        <div class="mt-3">
          <TrailList :items="trail" />
        </div>
      </div>
    </div>
  </section>
</template>
