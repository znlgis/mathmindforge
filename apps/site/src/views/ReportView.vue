<script setup lang="ts">
import { LEVEL_SUMMARIES } from '@mmf/content';
import { TOOL_LABELS } from '@mmf/content/ids';
import { buildReport, localizeReport, parseReportPack, toReportPack } from '@mmf/evidence';
import type { ReportModel, ReportPack } from '@mmf/evidence';
import { onMounted, ref } from 'vue';
import AdultGate from '../components/AdultGate.vue';
import { platform } from '../shell/platform';
import { useProgress } from '../stores/progress';
import { useI18n } from '../shell/useI18n';

const progress = useProgress();
const { locale } = useI18n();
const unlocked = ref(false);
const report = ref<ReportModel | null>(null);
const imported = ref<ReportPack | null>(null);
const importError = ref<string | null>(null);

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool as keyof typeof TOOL_LABELS] ?? tool;
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('zh-CN');
}

async function unlock(): Promise<void> {
  await progress.init();
  await progress.loadEvidence(500);
  await progress.refreshBadges();
  if (!progress.save) return;
  report.value = localizeReport(
    buildReport(progress.save, progress.evidence, LEVEL_SUMMARIES, platform.now()),
    LEVEL_SUMMARIES,
    locale.value,
  );
  unlocked.value = true;
}

async function importReport(): Promise<void> {
  importError.value = null;
  try {
    const text = await platform.files.pickText('application/json,.json', 512 * 1024);
    if (!text) return;
    const pack = parseReportPack(JSON.parse(text));
    if (!pack) {
      importError.value = '这个文件不是本机的证据包，或版本不符。';
      return;
    }
    imported.value = pack;
  } catch {
    importError.value = '读取失败：请选择导出的 .json 证据包。';
  }
}

function printReport(): void {
  window.print();
}

function exportReport(): void {
  if (!report.value) return;
  const pack = toReportPack(report.value);
  platform.files.download('mmf-report.json', 'application/json', JSON.stringify(pack, null, 2));
}

onMounted(async () => {
  await progress.init();
});
</script>

<template>
  <section v-if="!unlocked" data-testid="report-gate" class="px-5 py-10">
    <AdultGate @unlock="unlock" />
  </section>

  <article v-else data-testid="report-view" class="report-page mx-auto max-w-4xl px-5 py-8">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-grid pb-4">
      <div>
        <p class="text-xs font-bold tracking-[0.2em] text-brass">MATH MIND FORGE · 本机报告</p>
        <h1 class="mt-1 text-2xl font-black text-blueprint">{{ report?.nickname }} 的思维证据</h1>
        <p class="mt-1 text-xs text-ink-soft">生成于 {{ report ? formatDate(report.generatedAt) : '' }} · 最近 {{ report?.periodDays }} 天</p>
      </div>
      <div class="no-print flex gap-2">
        <button
          type="button"
          data-testid="report-print"
          class="min-h-11 rounded-2xl bg-card px-4 text-sm font-bold text-ink"
          @click="printReport"
        >
          打印 / PDF
        </button>
        <button
          type="button"
          data-testid="report-export"
          class="min-h-11 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white"
          @click="exportReport"
        >
          导出证据包
        </button>
        <button
          type="button"
          data-testid="report-import"
          class="min-h-11 rounded-2xl bg-card px-4 text-sm font-bold text-ink"
          @click="importReport"
        >
          导入只读证据包
        </button>
      </div>
    </header>

    <template v-if="report">
      <section class="mt-6">
        <h2 class="text-lg font-bold">一、用了哪些工具</h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="tool in report.tools"
            :key="tool.tool"
            class="rounded-full border border-grid bg-card px-3 py-1.5 text-xs font-semibold"
          >
            {{ toolLabel(tool.tool) }} {{ tool.uses }} 次
          </span>
        </div>
      </section>

      <section class="mt-6">
        <h2 class="text-lg font-bold">二、四维思维证据</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <article
            v-for="dimension in report.dimensions"
            :key="dimension.id"
            class="rounded-2xl border border-grid bg-card p-4"
          >
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="text-sm font-bold text-ink">{{ dimension.label }}</h3>
              <span class="text-[11px] font-semibold text-ink-soft">证据档位 {{ dimension.band }} / 3</span>
            </div>
            <p class="mt-2 text-sm leading-6 text-ink-soft">{{ dimension.summary }}</p>
            <ul v-if="dimension.signals.length > 0" class="mt-2 space-y-1">
              <li v-for="signal in dimension.signals" :key="signal.id" class="text-[11px] text-ink-soft">
                {{ signal.label }}：{{ signal.value }} / {{ signal.sample }}
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section class="mt-6">
        <h2 class="text-lg font-bold">三、关卡与印章</h2>
        <table class="mt-3 w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-grid text-xs text-ink-soft">
              <th class="py-2 pr-3">关卡</th>
              <th class="py-2 pr-3">状态</th>
              <th class="py-2 pr-3">印章</th>
              <th class="py-2">最近</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="level in report.levels" :key="level.levelId" class="border-b border-grid/60">
              <td class="py-2 pr-3 font-semibold">{{ level.title }}</td>
              <td class="py-2 pr-3">{{ level.completed ? '已完成' : '未完成' }}</td>
              <td class="py-2 pr-3 text-xs text-ink-soft">{{ level.stamps.join('、') || '—' }}</td>
              <td class="py-2 text-xs text-ink-soft">{{ level.lastPlayedAt ? formatDate(level.lastPlayedAt) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="mt-6">
        <h2 class="text-lg font-bold">四、下一步建议</h2>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
          <li v-for="item in report.recommendations" :key="item.title">
            <span class="font-semibold">{{ item.title }}</span>：{{ item.reason }}
          </li>
        </ul>
      </section>

      <section v-if="imported" data-testid="report-imported" class="mt-6 rounded-2xl border border-grid bg-paper p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold">导入的只读证据包</h2>
          <span class="text-[11px] text-ink-soft">{{ imported.nickname || '未署名' }} · {{ formatDate(imported.generatedAt) }}</span>
        </div>
        <p class="mt-2 text-sm text-ink-soft">这是从文件导入的只读报告，不会合并进本机存档。</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div v-for="dimension in imported.dimensions" :key="dimension.id" class="rounded-xl border border-grid bg-card p-3">
            <p class="text-sm font-bold">{{ dimension.id }} · 档位 {{ dimension.band }}/3</p>
            <p class="mt-1 text-xs text-ink-soft">{{ dimension.summary }}</p>
          </div>
        </div>
        <ul v-if="imported.recommendations.length" class="mt-3 list-disc pl-5 text-xs text-ink-soft">
          <li v-for="item in imported.recommendations" :key="item.title">{{ item.title }}：{{ item.reason }}</li>
        </ul>
      </section>

      <p v-if="importError" class="mt-3 text-xs font-bold text-red">{{ importError }}</p>

      <footer class="mt-8 border-t border-grid pt-3 text-xs text-ink-soft">
        <p>{{ report.privacyNote }}</p>
        <p class="mt-1">本周日志 {{ report.totalJournal }} 条 · 证据事件 {{ report.totalEvents }} 条 · 不记录真实姓名、学校或位置。</p>
      </footer>
    </template>
  </article>
</template>
