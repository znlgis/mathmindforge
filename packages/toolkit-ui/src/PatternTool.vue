<script setup lang="ts">
import type { LevelAction, LevelRuntime, PatternTransform, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { tokenAt } from '@mmf/toolkit/pattern';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中的 pattern 成员结构一致；toolkit-ui 不直接依赖 content。 */
type PatternSpec = Extract<ToolSpecLike, { kind: 'pattern' }>;

/**
 * 工具配置里尚可选的扩展字段（content schema 由 Lead 独占，暂不加 transforms）：
 * 缺省时回退到关卡脚本自己的 allowedTransforms，再缺省才列出全量。
 */
interface PatternConfigExtras {
  tokens: string[];
  maxPeriod?: number;
  transforms?: PatternTransform[];
}

interface PatternLevelScript {
  scenario?: { length?: number; visible?: (string | null)[] };
  pattern?: { allowedPeriods?: number[]; allowedTransforms?: PatternTransform[] };
}

const props = defineProps<{
  spec: PatternSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const ALL_TRANSFORMS: PatternTransform[] = ['none', 'mirror', 'rotate', 'shift', 'reflect'];
const busy = ref(false);
const error = ref<string | null>(null);

const patternState = computed(() => props.snapshot.toolState.pattern);
const committed = computed(() => patternState.value?.committed === true);
const cycle = computed<string[] | undefined>(() => patternState.value?.cycle);
const transform = computed<PatternTransform>(() => patternState.value?.transform ?? 'none');
const selectedKey = computed(() => (
  cycle.value && cycle.value.length >= 2 ? cycle.value.join('') + '-' + transform.value : ''
));

const config = computed(() => props.spec.config as unknown as PatternConfigExtras);
const script = computed<PatternLevelScript>(() => {
  const raw = props.runtime.detail.levelScript as unknown;
  return raw && typeof raw === 'object' ? (raw as PatternLevelScript) : {};
});

/** 变换 chip 只列本关允许的选项：不再像原来的下拉那样摆一个"选了必错"的项。 */
const transforms = computed<PatternTransform[]>(() => {
  const declared = config.value.transforms;
  if (Array.isArray(declared) && declared.length > 0) {
    return declared.filter((item) => ALL_TRANSFORMS.includes(item));
  }
  const allowed = script.value.pattern?.allowedTransforms;
  if (Array.isArray(allowed) && allowed.length > 0) return allowed;
  return ALL_TRANSFORMS;
});

interface RuleCandidate {
  key: string;
  tokens: string[];
  transform: PatternTransform;
  label: string;
}

/**
 * 「一键候选」：从带子可见格直接推出候选重复单元。
 * 口径与 runtime 的 repair-only 校验一致（周期内每格都可见、能解释所有可见格），
 * 所以点候选就是把这个玩家从带子里读出来的规律交给判定。
 */
const candidates = computed<RuleCandidate[]>(() => {
  const visible = script.value.scenario?.visible ?? [];
  const length = script.value.scenario?.length ?? visible.length;
  const periods = script.value.pattern?.allowedPeriods ?? [];
  const maxPeriod = config.value.maxPeriod ?? 6;
  const out: RuleCandidate[] = [];
  const seen = new Set<string>();
  for (const period of periods) {
    if (period < 2 || period > length || period > maxPeriod) continue;
    const tokens: string[] = [];
    let complete = true;
    for (let index = 0; index < period; index += 1) {
      const token = visible[index];
      if (!token) {
        complete = false;
        break;
      }
      tokens.push(token);
    }
    if (!complete) continue;
    for (const item of transforms.value) {
      const rule: PatternRule = { tokens: [...tokens], period, transform: item };
      let explains = true;
      for (let index = 0; index < length; index += 1) {
        const token = visible[index];
        if (token === null || token === undefined) continue;
        if (tokenAt(rule, index) !== token) {
          explains = false;
          break;
        }
      }
      if (!explains) continue;
      // testid 里不放冒号：选择器更稳，也方便 e2e 用可读的名字。
      const key = tokens.join('') + '-' + item;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        tokens: [...tokens],
        transform: item,
        label: tokens.join(' ') + ' · ' + translate('pattern.transform.' + item),
      });
    }
  }
  return out;
});

async function dispatch(action: LevelAction): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch(action);
    if (!result.ok) {
      error.value = result.message ? translate(result.message) : null;
      return false;
    }
    return true;
  } finally {
    busy.value = false;
  }
}

/** 候选 chip 一次点击 = 选中并提交这条规律（第二产物），不再让玩家逐字母拼单元。 */
async function pickRule(tokens: string[], nextTransform: PatternTransform): Promise<void> {
  if (busy.value) return;
  if (!(await dispatch({ type: 'pattern/setCycle', payload: { cycle: [...tokens], transform: nextTransform } }))) return;
  await dispatch({ type: 'pattern/commit', payload: {} });
}

async function pickTransform(nextTransform: PatternTransform): Promise<void> {
  if (!cycle.value || cycle.value.length < 2) return;
  await pickRule([...cycle.value], nextTransform);
}

async function preview(): Promise<void> {
  if (!cycle.value || cycle.value.length < 2) return;
  await dispatch({ type: 'pattern/preview', payload: { cycle: [...cycle.value], transform: transform.value } });
}
</script>

<template>
  <section class="mt-2 flex flex-col gap-2" data-testid="pattern-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">点画布上的空格直接补字母，一次点击填一格。</p>
      <span
        v-if="committed"
        data-testid="pattern-committed"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        {{ translate('pattern.committed') }}
      </span>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">{{ translate('pattern.cycle') }}</p>
      <p v-if="committed" class="mt-1 text-xs text-ink-soft">带子里重复的那几格就是答案，点一下选中。</p>
      <p v-else class="mt-1 text-xs font-bold text-brass" data-testid="pattern-rule-hint">
        先点一条候选规律，再补画布上的缺口（完成时要用到这条规律）。
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="candidate in candidates"
          :key="candidate.key"
          type="button"
          :data-testid="'pattern-candidate-' + candidate.key"
          :disabled="busy"
          :aria-pressed="selectedKey === candidate.key"
          class="min-h-11 rounded-2xl border px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="selectedKey === candidate.key
            ? 'border-teal bg-mint text-teal'
            : (committed ? 'border-grid bg-paper text-ink' : 'border-brass bg-brass/10 text-ink')"
          @click="pickRule(candidate.tokens, candidate.transform)"
        >
          {{ candidate.label }}
        </button>
        <p v-if="candidates.length === 0" class="text-xs text-ink-soft">带子上还没看出重复的单元。</p>
      </div>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">{{ translate('pattern.transform') }}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="option in transforms"
          :key="option"
          type="button"
          :data-testid="'pattern-transform-' + option"
          :disabled="busy || !cycle || cycle.length < 2"
          :aria-pressed="transform === option"
          class="min-h-11 rounded-2xl border px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="transform === option ? 'border-teal bg-mint text-teal' : 'border-grid bg-paper text-ink'"
          @click="pickTransform(option)"
        >
          {{ translate('pattern.transform.' + option) }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="pattern-preview"
        :disabled="busy || !cycle || cycle.length < 2"
        class="min-h-11 flex-1 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="preview"
      >
        {{ translate('pattern.preview') }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
