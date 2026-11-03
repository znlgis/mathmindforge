import type { Locale } from './ids';
import type { LevelDetail, LevelSummary } from './schema';

export interface LocalizedSummary {
  title: string;
  thinkingTarget: string;
}

export interface LocalizedDetail {
  title: string;
  thinkingTarget: string;
  intro: string;
  prompt: string;
  done: string;
  retry: string;
}

export function localizedSummary(summary: LevelSummary, locale: Locale): LocalizedSummary {
  if (locale === 'en') {
    return {
      title: summary.titleEn ?? summary.title,
      thinkingTarget: summary.thinkingTargetEn ?? summary.thinkingTarget,
    };
  }
  return { title: summary.title, thinkingTarget: summary.thinkingTarget };
}

export function localizedDetail(detail: LevelDetail, locale: Locale): LocalizedDetail {
  if (locale === 'en') {
    return {
      title: detail.titleEn ?? detail.title,
      thinkingTarget: detail.thinkingTargetEn ?? detail.thinkingTarget,
      intro: detail.introEn ?? detail.intro,
      prompt: detail.promptEn ?? detail.prompt,
      done: detail.doneEn ?? detail.done,
      retry: detail.retryEn ?? detail.retry,
    };
  }
  return {
    title: detail.title,
    thinkingTarget: detail.thinkingTarget,
    intro: detail.intro,
    prompt: detail.prompt,
    done: detail.done,
    retry: detail.retry,
  };
}
