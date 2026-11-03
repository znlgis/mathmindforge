<script setup lang="ts">
import type { LevelRuntime, Locale, RunSnapshot } from '@mmf/game-kit';
import { createTranslator } from '@mmf/i18n';
import type { Translator } from '@mmf/i18n';
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
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

interface FailureCopy {
  message: string;
  hint: string | null;
}

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

const failureCopy = computed<FailureCopy | null>(() => {
  const verdict = snapshot.value.verdict;
  if (!verdict) return null;
  const t = translator.value.t;
  if (verdict.failure) {
    const copy = props.detail.feedback[verdict.failure.class];
    if (copy) return { message: t(copy.messageKey), hint: t(copy.hintKey) };
    return { message: t('level.failed'), hint: props.detail.retry };
  }
  const first = verdict.missingEvidence[0];
  if (first) {
    return { message: t('level.failureMissing', { step: t(first.messageKey) }), hint: null };
  }
  return null;
});

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-if="failureCopy"
      data-testid="failure-banner"
      role="alert"
      class="rounded-2xl border border-red bg-card p-4 shadow-sm"
    >
      <p class="text-sm font-bold text-red">{{ failureCopy.message }}</p>
      <p v-if="failureCopy.hint" class="mt-1 text-sm text-ink-soft">{{ failureCopy.hint }}</p>
    </div>

    <article
      v-for="(spec, index) in tools"
      :key="spec.kind + '-' + index"
      :data-testid="'tool-card-' + spec.kind"
      class="rounded-3xl border border-grid bg-card p-4 shadow-sm"
    >
      <header class="flex flex-col gap-1">
        <h2 class="text-base font-black text-blueprint">{{ translator.t(spec.titleKey) }}</h2>
        <p class="text-xs text-ink-soft">{{ translator.t(spec.descriptionKey) }}</p>
      </header>

      <PatternTool
        v-if="spec.kind === 'pattern'"
        :spec="spec"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <PaymentTool
        v-if="spec.kind === 'construct' && spec.config.mode === 'payment'"
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
    </article>
  </div>
</template>
