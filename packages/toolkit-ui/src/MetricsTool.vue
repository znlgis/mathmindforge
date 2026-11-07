<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed } from 'vue';
import { readMetricsRows, seedPasses } from './metricsRows';
import type { MetricsRow, MetricsTargets } from './metricsRows';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中 probe 成员结构一致；toolkit-ui 不直接依赖 content。 */
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

/** probe.config 是 passthrough：metrics 模式额外读目标、预算与路线名。 */
interface ProbeConfigView {
  mode?: string;
  targets?: MetricsTargets;
  budget?: number;
  routeLabels?: string[];
}

const DEFAULT_TARGETS: MetricsTargets = {
  A: { coverageMin: 0.9, waitMax: 18 },
  B: { coverageMin: 0.85, waitMax: 20 },
};
const DEFAULT_BUDGET = 120;

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const config = computed(() => props.spec.config as unknown as ProbeConfigView);
const targets = computed<MetricsTargets>(() => config.value.targets ?? DEFAULT_TARGETS);
const budget = computed(() => config.value.budget ?? DEFAULT_BUDGET);
const rows = computed(() => readMetricsRows(props.snapshot));

function percent(value: number): string {
  return (value * 100).toFixed(0) + '%';
}

function routeLabel(index: number): string {
  const labels = config.value.routeLabels ?? [];
  return labels[index] ?? String(index);
}

function rowPass(row: MetricsRow) {
  return seedPasses(row, targets.value, budget.value);
}

</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="metrics-tool">
    <div>
      <p class="text-sm font-bold text-ink">{{ translate('sim.targets') }}</p>
      <p class="mt-1 text-xs text-ink-soft">
        A：覆盖率 ≥ {{ percent(targets.A.coverageMin) }}、等待 ≤ {{ targets.A.waitMax }} 分；
        B：覆盖率 ≥ {{ percent(targets.B.coverageMin) }}、等待 ≤ {{ targets.B.waitMax }} 分；
        成本 ≤ {{ budget }}。
      </p>
    </div>

    <div v-if="rows.length === 0" class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-xs text-ink-soft">还没有运行记录。改一个旋钮就会自动跑一次，这里会列出每次运行的指标。</p>
    </div>

    <div v-else class="overflow-x-auto rounded-2xl border border-grid bg-paper">
      <table class="w-full min-w-96 border-collapse text-left text-xs" data-testid="metrics-table">
        <thead>
          <tr class="text-ink-soft">
            <th class="px-2 py-2 font-bold">#</th>
            <th class="px-2 py-2 font-bold">车辆</th>
            <th class="px-2 py-2 font-bold">服务队</th>
            <th class="px-2 py-2 font-bold">班次</th>
            <th class="px-2 py-2 font-bold">路线</th>
            <th class="px-2 py-2 font-bold">覆盖 A</th>
            <th class="px-2 py-2 font-bold">等待 A</th>
            <th class="px-2 py-2 font-bold">覆盖 B</th>
            <th class="px-2 py-2 font-bold">等待 B</th>
            <th class="px-2 py-2 font-bold">成本</th>
            <th class="px-2 py-2 font-bold">结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :data-testid="'metrics-row-' + row.id">
            <td class="px-2 py-2 font-semibold text-ink-soft">{{ row.id.replace('run-', '') }}</td>
            <td class="px-2 py-2 font-semibold text-ink">{{ row.vehicles }}</td>
            <td class="px-2 py-2 font-semibold text-ink">{{ row.teams }}</td>
            <td class="px-2 py-2 font-semibold text-ink">{{ row.shift }}</td>
            <td class="px-2 py-2 font-semibold text-ink">{{ routeLabel(row.routeIndex) }}</td>
            <td class="px-2 py-2" :class="rowPass(row).a ? 'text-teal' : 'text-red'">
              {{ percent(row.coverageA) }}
            </td>
            <td class="px-2 py-2" :class="rowPass(row).a ? 'text-teal' : 'text-red'">{{ row.waitA }}</td>
            <td class="px-2 py-2" :class="rowPass(row).b ? 'text-teal' : 'text-red'">
              {{ percent(row.coverageB) }}
            </td>
            <td class="px-2 py-2" :class="rowPass(row).b ? 'text-teal' : 'text-red'">{{ row.waitB }}</td>
            <td class="px-2 py-2" :class="rowPass(row).budget ? 'text-ink' : 'text-red'">{{ row.cost }}</td>
            <td class="px-2 py-2 font-bold" :class="rowPass(row).all ? 'text-teal' : 'text-ink-soft'">
              <span :data-testid="'metrics-result-' + row.id">{{ rowPass(row).all ? '✓' : '✗' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-2">
      <span
        v-for="row in rows.slice(-1)"
        :key="'light-' + row.id"
        class="rounded-full border border-grid bg-card px-3 py-1 text-xs font-semibold"
        :class="rowPass(row).all ? 'text-teal' : 'text-ink-soft'"
        data-testid="metrics-target-light"
      >
        A {{ rowPass(row).a ? '达标' : '未达标' }} · B {{ rowPass(row).b ? '达标' : '未达标' }} ·
        预算 {{ rowPass(row).budget ? '合规' : '超支' }}
      </span>
    </div>
  </section>
</template>
