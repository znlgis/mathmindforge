<script setup lang="ts">
import type { LevelAction, LevelRuntime, ProgramBlock, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中 rule 成员结构一致；toolkit-ui 不直接依赖 content。 */
type RuleSpec = Extract<ToolSpecLike, { kind: 'rule' }>;

const props = defineProps<{
  spec: RuleSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const busy = ref(false);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);

const ruleState = computed(() => props.snapshot.toolState.rule);
const program = computed<ProgramBlock[]>(() => ruleState.value?.program ?? []);
/** RuleToolState 没有 committed 字段：提交后会写 lastTrace，编辑后清空，用它当"已提交"。 */
const committed = computed(() => ruleState.value?.lastTrace !== undefined);
const lastTrace = computed(() => ruleState.value?.lastTrace);
const selectedIndex = computed(() => program.value.findIndex((block) => block.id === selectedId.value));
const maxBlocks = computed(() => props.spec.config.maxBlocks);
const blockTotal = computed(() => countBlocks(program.value));

let serial = 0;
function nextId(prefix: string): string {
  serial += 1;
  return prefix + '-' + serial;
}

function countBlocks(blocks: readonly ProgramBlock[]): number {
  let total = 0;
  for (const block of blocks) total += 1 + countBlocks(block.children ?? []);
  return total;
}

function childText(block: ProgramBlock): string {
  const children = block.children ?? [];
  if (children.length === 0) return '空';
  return children.map((child) => labelOf(child)).join('、');
}

function labelOf(block: ProgramBlock): string {
  switch (block.op) {
    case 'forward': return '前进';
    case 'left': return '左转';
    case 'right': return '右转';
    case 'collect': return '收集';
    case 'repeat': return '重复 ' + (block.n ?? 1) + ' 次（' + childText(block) + '）';
    case 'if-wall': return '遇墙（' + childText(block) + '）';
    default: return '未知积木';
  }
}

function makeBlock(op: 'forward' | 'left' | 'right' | 'collect'): ProgramBlock {
  return { id: nextId(op), op };
}

function makeRepeat(): ProgramBlock {
  return {
    id: nextId('repeat'),
    op: 'repeat',
    n: 2,
    children: [{ id: nextId('forward'), op: 'forward' }],
  };
}

function makeIfWall(): ProgramBlock {
  return {
    id: nextId('if-wall'),
    op: 'if-wall',
    children: [{ id: nextId('right'), op: 'right' }],
  };
}

const PALETTE_ITEMS: { testid: string; label: string; build: () => ProgramBlock }[] = [
  { testid: 'rule-add-forward', label: '前进', build: () => makeBlock('forward') },
  { testid: 'rule-add-left', label: '左转', build: () => makeBlock('left') },
  { testid: 'rule-add-right', label: '右转', build: () => makeBlock('right') },
  { testid: 'rule-add-collect', label: '收集', build: () => makeBlock('collect') },
  { testid: 'rule-add-repeat2', label: '重复前进×2', build: makeRepeat },
  { testid: 'rule-add-ifwall', label: '遇墙右转', build: makeIfWall },
];

const traceText = computed(() => {
  const trace = lastTrace.value;
  if (!trace) return '';
  if (trace.failureClass === 'rule-wall') {
    return '试跑：第 ' + (trace.failureStep ?? trace.steps) + ' 步撞到墙了。';
  }
  if (trace.failureClass === 'rule-loop') {
    return '试跑：步数用完了，程序可能在绕圈。';
  }
  return '试跑：一共 ' + trace.steps + ' 步。';
});

async function dispatch(action: LevelAction): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch(action);
    if (!result.ok) {
      error.value = result.message ?? '这一步没有成功，再试一次。';
      return false;
    }
    return true;
  } finally {
    busy.value = false;
  }
}

async function addBlock(build: () => ProgramBlock): Promise<void> {
  if (busy.value) return;
  if (blockTotal.value >= maxBlocks.value) {
    error.value = '程序格子到上限了：先用重复把路线缩短。';
    return;
  }
  await dispatch({ type: 'rule/place', payload: { block: build(), at: program.value.length } });
}

function selectBlock(id: string): void {
  selectedId.value = selectedId.value === id ? null : id;
}

async function removeSelected(): Promise<void> {
  const block = program.value[selectedIndex.value];
  if (!block) return;
  const id = block.id;
  if (await dispatch({ type: 'rule/remove', payload: { id } })) {
    if (selectedId.value === id) selectedId.value = null;
  }
}

async function moveSelected(delta: number): Promise<void> {
  const index = selectedIndex.value;
  const block = program.value[index];
  if (!block) return;
  const at = index + delta;
  if (at < 0 || at >= program.value.length) return;
  await dispatch({ type: 'rule/move', payload: { id: block.id, at } });
}

async function commitProgram(): Promise<void> {
  await dispatch({ type: 'rule/commit', payload: {} });
}

const canMoveUp = computed(() => selectedIndex.value > 0);
const canMoveDown = computed(() => (
  selectedIndex.value >= 0 && selectedIndex.value < program.value.length - 1
));
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="rule-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">
        程序格 {{ blockTotal }}/{{ maxBlocks }}（重复里的块也算）
      </p>
      <span
        v-if="committed"
        data-testid="rule-committed"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        程序已提交
      </span>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">拼一条程序</p>
      <p class="mt-1 text-xs text-ink-soft">
        从上往下执行；重复格会把里面的积木执行多次。
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="item in PALETTE_ITEMS"
          :key="item.testid"
          type="button"
          :data-testid="item.testid"
          :disabled="busy || blockTotal >= maxBlocks"
          :aria-label="item.label"
          class="min-h-11 rounded-xl border border-grid bg-paper px-2 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
          @click="addBlock(item.build)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="rule-program">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-bold text-ink">程序列表</p>
        <span class="text-xs font-semibold text-ink-soft">{{ program.length }} 行</span>
      </div>
      <p v-if="program.length === 0" class="mt-2 text-xs text-ink-soft">
        还没有积木：先点上面的按钮，再按行选中，可以删除或上下挪。
      </p>
      <ol v-else class="mt-2 flex flex-col gap-1">
        <li v-for="(block, index) in program" :key="block.id">
          <button
            type="button"
            :data-testid="'rule-select-' + index"
            :aria-pressed="selectedId === block.id"
            class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold active:scale-95"
            :class="selectedId === block.id ? 'bg-mint text-teal' : 'text-ink'"
            @click="selectBlock(block.id)"
          >
            <span class="w-5 shrink-0 text-xs text-ink-soft">{{ index + 1 }}</span>
            <span class="flex-1">{{ labelOf(block) }}</span>
          </button>
        </li>
      </ol>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="rule-remove"
        :disabled="busy || selectedIndex < 0"
        class="min-h-11 flex-1 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="removeSelected"
      >
        删除选中
      </button>
      <button
        type="button"
        data-testid="rule-move-up"
        :disabled="busy || !canMoveUp"
        class="min-h-11 flex-1 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="moveSelected(-1)"
      >
        上移
      </button>
      <button
        type="button"
        data-testid="rule-move-down"
        :disabled="busy || !canMoveDown"
        class="min-h-11 flex-1 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="moveSelected(1)"
      >
        下移
      </button>
      <button
        type="button"
        data-testid="rule-commit"
        :disabled="busy || program.length === 0"
        class="min-h-11 flex-1 rounded-xl bg-blueprint px-3 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
        @click="commitProgram"
      >
        {{ translate('rule.commit') }}
      </button>
    </div>

    <p v-if="traceText" class="text-xs font-bold" :class="lastTrace?.failureClass ? 'text-red' : 'text-teal'">
      {{ traceText }}
    </p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
