<script setup lang="ts">
import { TOOL_LABELS } from '@mmf/content/ids';
import type { ToolId } from '@mmf/content/ids';
import { navigate } from '../router';
import { useI18n } from '../shell/useI18n';

const { t } = useI18n();

const tools: { id: ToolId; key: string }[] = [
  { id: 'pattern', key: 'home.tool.pattern' },
  { id: 'rule', key: 'home.tool.rule' },
  { id: 'construct', key: 'home.tool.construct' },
  { id: 'knob', key: 'home.tool.knob' },
  { id: 'probe', key: 'home.tool.probe' },
  { id: 'counter', key: 'home.tool.counter' },
];
</script>

<template>
  <section class="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-10">
    <div class="rounded-3xl border border-grid bg-card p-8 shadow-sm">
      <p class="text-xs font-bold tracking-[0.3em] text-brass">{{ t('app.kicker') }}</p>
      <h1 class="mt-3 text-4xl font-black text-blueprint">{{ t('app.title') }}</h1>
      <p class="mt-2 text-lg font-semibold text-ink-soft">{{ t('app.subtitle') }}</p>
      <p class="mt-6 max-w-2xl text-base leading-7">{{ t('home.intro') }}</p>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">{{ t('home.body') }}</p>
      <button
        type="button"
        data-testid="home-start"
        class="mt-8 min-h-14 rounded-2xl bg-blueprint px-8 text-lg font-bold text-white active:scale-95"
        @click="navigate('/forge')"
      >
        {{ t('home.start') }} →
      </button>
    </div>

    <div>
      <h2 class="text-xl font-bold">{{ t('home.tools') }}</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="tool in tools" :key="tool.id" class="rounded-2xl border border-grid bg-card p-5">
          <p class="text-sm font-bold text-teal">{{ TOOL_LABELS[tool.id] }}</p>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ t(tool.key) }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
