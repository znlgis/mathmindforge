<script setup lang="ts">
import type { LevelRuntime, Locale, RunSnapshot } from '@mmf/game-kit';
import { createTranslator } from '@mmf/i18n';
import type { Translator } from '@mmf/i18n';
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import CounterTool from './CounterTool.vue';
import DistributeTool from './DistributeTool.vue';
import FrontierTool from './FrontierTool.vue';
import InferenceTool from './InferenceTool.vue';
import KnobTool from './KnobTool.vue';
import NetworkTool from './NetworkTool.vue';
import PaymentTool from './PaymentTool.vue';
import SampleTool from './SampleTool.vue';
import SamplingTool from './SamplingTool.vue';
import ScheduleTool from './ScheduleTool.vue';
import TallyTool from './TallyTool.vue';

/**
 * 作答区（去卡片化，本轮简化）：
 * 关卡不再摆「模式卡 / 规则卡 / 构造块」这类工具卡，也不再让玩家先做模式设置——
 * 打开哪一关，直接看到这一关要作答的那块面板，做完自动判题。
 *
 * - pattern / rule：答案就在画布上（点格子），这里什么都不渲染；
 * - construct / experiment / simulate：只渲染真正承载答案的组件，标题与说明直接来自关卡文案；
 * - argue：论证板由宿主单独渲染（ArgumentBoard），这里也不渲染工具。
 */
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
 * 工具规格 → 真正承载答案的面板。表里没有的一律不渲染：
 * pattern / rule 由画布作答，domino / invariant probe 这类「沙盒工具」不再出现在答案区。
 */
function panelOf(spec: ToolSpecLike): string | null {
  if (spec.kind === 'construct') {
    const mode = spec.config.mode;
    if (mode === 'payment') return 'payment';
    if (mode === 'network') return 'network';
    if (mode === 'schedule') return 'schedule';
    if (mode === 'frontier') return 'frontier';
    if (mode === 'distribution') return 'distribute';
    return null;
  }
  if (spec.kind === 'counter') return 'counter';
  if (spec.kind === 'knob') return 'knob';
  if (spec.kind === 'probe') {
    const mode = spec.config.mode;
    if (mode === 'tally') return 'tally';
    if (mode === 'sampling') return 'sampling';
    if (mode === 'inference') return 'inference';
    if (mode === 'sample') return 'sample';
    return null;
  }
  return null;
}

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-for="(spec, index) in tools" :key="spec.kind + '-' + index">
      <PaymentTool
        v-if="panelOf(spec) === 'payment'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <NetworkTool
        v-else-if="panelOf(spec) === 'network'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :detail="detail"
        :t="translator"
      />
      <ScheduleTool
        v-else-if="panelOf(spec) === 'schedule'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :detail="detail"
        :t="translator"
      />
      <FrontierTool
        v-else-if="panelOf(spec) === 'frontier'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :detail="detail"
        :t="translator"
      />
      <DistributeTool
        v-else-if="panelOf(spec) === 'distribute'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :detail="detail"
        :t="translator"
      />
      <CounterTool
        v-else-if="panelOf(spec) === 'counter'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <KnobTool
        v-else-if="panelOf(spec) === 'knob'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <TallyTool
        v-else-if="panelOf(spec) === 'tally'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <SamplingTool
        v-else-if="panelOf(spec) === 'sampling'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <InferenceTool
        v-else-if="panelOf(spec) === 'inference'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
      <SampleTool
        v-else-if="panelOf(spec) === 'sample'"
        :spec="spec as never"
        :runtime="runtime"
        :snapshot="snapshot"
        :t="translator"
      />
    </template>
  </div>
</template>
