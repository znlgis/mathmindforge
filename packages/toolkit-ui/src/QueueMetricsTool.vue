<script setup lang="ts">
import type { LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

interface QueueRow {
  id: string;
  servers: number;
  serviceTime: number;
  openMinutes: number;
  avgWait: number;
  maxQueue: number;
  overtime: number;
  cost: number;
  passed: boolean;
}

const dataset = computed(() => props.snapshot.toolState.probe?.dataset);
const rows = computed<QueueRow[]>(() => {
  const groups = dataset.value?.groups;
  if (!groups) return [];
  return Object.entries(groups).map(([id, values]) => ({
    id,
    servers: values[0] ?? 0,
    serviceTime: values[1] ?? 0,
    openMinutes: values[2] ?? 0,
    avgWait: values[3] ?? 0,
    maxQueue: values[4] ?? 0,
    overtime: values[5] ?? 0,
    cost: values[6] ?? 0,
    passed: values[7] === 1,
  }));
});
const busy = ref(false);

async function focus(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const action: LevelAction = { type: 'probe/focus', payload: { id: 'queue-metrics' } };
    await props.runtime.dispatch(action);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="queue-metrics-tool" class="mt-3 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-bold text-ink">排队指标</p>
      <button
        type="button"
        data-testid="queue-focus"
        class="min-h-11 rounded-xl bg-blueprint px-4 text-xs font-bold text-white active:scale-95"
        @click="focus"
      >
        查看排队指标
      </button>
    </div>
    <div v-if="rows.length === 0" class="rounded-2xl border border-grid bg-paper p-3 text-xs text-ink-soft">
      还没有运行记录。回旋钮面板跑一次，这里会列出等待、加班与成本。
    </div>
    <div v-else class="overflow-x-auto rounded-2xl border border-grid bg-paper">
      <table class="w-full min-w-96 border-collapse text-left text-xs" data-testid="queue-table">
        <thead>
          <tr class="text-ink-soft">
            <th class="px-2 py-2">#</th>
            <th class="px-2 py-2">服务台</th>
            <th class="px-2 py-2">服务时长</th>
            <th class="px-2 py-2">营业</th>
            <th class="px-2 py-2">平均等待</th>
            <th class="px-2 py-2">最长队列</th>
            <th class="px-2 py-2">加班</th>
            <th class="px-2 py-2">成本</th>
            <th class="px-2 py-2">达标</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.id" class="border-t border-grid/60">
            <td class="px-2 py-2">{{ index + 1 }}</td>
            <td class="px-2 py-2">{{ row.servers }}</td>
            <td class="px-2 py-2">{{ row.serviceTime }} 分</td>
            <td class="px-2 py-2">{{ row.openMinutes }} 分</td>
            <td class="px-2 py-2">{{ row.avgWait }}</td>
            <td class="px-2 py-2">{{ row.maxQueue }}</td>
            <td class="px-2 py-2">{{ row.overtime }}</td>
            <td class="px-2 py-2">{{ row.cost }}</td>
            <td class="px-2 py-2 font-bold" :class="row.passed ? 'text-teal' : 'text-red'">
              {{ row.passed ? '是' : '否' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
