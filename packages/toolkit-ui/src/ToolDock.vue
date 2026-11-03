<script setup lang="ts">
import type { LevelRuntime, Locale, RunSnapshot } from '@mmf/game-kit';
import { createTranslator } from '@mmf/i18n';
import type { Translator } from '@mmf/i18n';
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import ConstructTool from './ConstructTool.vue';
import CounterTool from './CounterTool.vue';
import DistributeTool from './DistributeTool.vue';
import DominoTool from './DominoTool.vue';
import InvariantProbeTool from './InvariantProbeTool.vue';
import KnobTool from './KnobTool.vue';
import MetricsTool from './MetricsTool.vue';
import QueueMetricsTool from './QueueMetricsTool.vue';
import SamplingTool from './SamplingTool.vue';
import NetworkTool from './NetworkTool.vue';
import InferenceTool from './InferenceTool.vue';
import ScheduleTool from './ScheduleTool.vue';
import FrontierTool from './FrontierTool.vue';
import PatternTool from './PatternTool.vue';
import PaymentTool from './PaymentTool.vue';
import RuleTool from './RuleTool.vue';
import SampleTool from './SampleTool.vue';
import TallyTool from './TallyTool.vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];

const props = defineProps<{
  tools: ToolSpecLike[];
  runtime: LevelRuntime;
  detail: LevelDetailLike;
  locale: Locale;
}>();

const snapshot = shallowRef<RunSnapshot>(props.runtime.snapshot());
const unsubscribe = props.runtime.subscribe((next) => {
  snapshot.value = next;
});

const translator = shallowRef<Translator>(createTranslator(props.locale));
watch(
  () => props.locale,
  (locale) => {
    translator.value = createTranslator(locale);
  },
);

/**
 * 手风琴：同一时刻只展开一张工具卡，默认开第一张。
 * 工具区原来全部摊开有 928px，右侧 dock 只能看到 566px，孩子要滚动才能找到下面的工具和按钮——
 * 折叠后整块工具区在 1280×800 里不用滚动，也不需要靠"滚下去找"来发现第二件工具。
 * -1 = 全部收起（再点一次当前卡头），把整块空间让给画布。
 */
const openIndex = ref(0);

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index;
}

// 换关时 tools 整表替换：不回第一张的话，新关卡会停在上一个关卡选的工具位置上
watch(
  () => props.tools,
  () => {
    openIndex.value = 0;
  },
);

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <article
      v-for="(spec, index) in tools"
      :key="spec.kind + '-' + index"
      :data-testid="'tool-card-' + spec.kind"
      class="rounded-3xl border border-grid bg-card shadow-sm"
    >
      <!-- 卡头就是开合按钮：折叠态只有一行（标题 + 一行说明 + 箭头），高 46px，
           比原来两行卡头 76px 省一半；孩子点标题所在整行都能开合 -->
      <h2 class="text-base font-black text-blueprint">
        <button
          type="button"
          :data-testid="'tool-card-toggle-' + spec.kind + '-' + index"
          :aria-expanded="openIndex === index"
          :aria-controls="'tool-panel-' + spec.kind + '-' + index"
          class="flex w-full items-center gap-2 rounded-3xl px-3 py-2.5 text-left"
          @click="toggle(index)"
        >
          <span class="min-w-0 truncate">{{ translator.t(spec.titleKey) }}</span>
          <span class="min-w-0 flex-1 truncate text-xs font-semibold text-ink-soft">
            {{ translator.t(spec.descriptionKey) }}
          </span>
          <span aria-hidden="true" class="shrink-0 text-xs text-ink-soft">
            {{ openIndex === index ? '▴' : '▾' }}
          </span>
        </button>
      </h2>

      <!-- v-show 而不是 v-if：折叠只是藏起来，工具内部填了一半的输入/选择在来回切换时不会丢 -->
      <div
        v-show="openIndex === index"
        :id="'tool-panel-' + spec.kind + '-' + index"
        class="px-3 pb-3"
      >
        <PatternTool
          v-if="spec.kind === 'pattern'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <PaymentTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'payment'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <DominoTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'domino'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :detail="detail"
          :t="translator"
        />
        <FrontierTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'frontier'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :detail="detail"
          :t="translator"
        />
        <ScheduleTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'schedule'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :detail="detail"
          :t="translator"
        />
        <NetworkTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'network'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :detail="detail"
          :t="translator"
        />
        <DistributeTool
          v-else-if="spec.kind === 'construct' && spec.config.mode === 'distribution'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :detail="detail"
          :t="translator"
        />
        <ConstructTool
          v-else-if="spec.kind === 'construct'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <RuleTool
          v-else-if="spec.kind === 'rule'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <CounterTool
          v-else-if="spec.kind === 'counter'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <KnobTool
          v-else-if="spec.kind === 'knob'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <InvariantProbeTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'invariant'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <QueueMetricsTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'queue'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <MetricsTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'metrics'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <TallyTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'tally'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <InferenceTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'inference'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <SamplingTool
          v-else-if="spec.kind === 'probe' && spec.config.mode === 'sampling'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <SampleTool
          v-else-if="spec.kind === 'probe'"
          :spec="spec"
          :runtime="runtime"
          :snapshot="snapshot"
          :t="translator"
        />
        <p v-else class="mt-3 text-sm text-ink-soft">这个工具暂时还没接上。</p>
      </div>
    </article>
  </div>
</template>
