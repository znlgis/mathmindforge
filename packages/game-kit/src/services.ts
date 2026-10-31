import type { Locale } from '@mmf/content/ids';
import type { EvidenceAggregate, EvidenceEvent, EvidenceRecord, SaveData } from './save';

export interface ProgressStore {
  load(): Promise<unknown>;
  save(data: SaveData): Promise<void>;
}

export interface EvidenceStore {
  append(events: EvidenceEvent[]): Promise<void>;
  recent(limit: number): Promise<EvidenceEvent[]>;
  loadRecord(): Promise<EvidenceRecord | null>;
  loadAggregate(): Promise<EvidenceAggregate>;
  saveAggregate(agg: EvidenceAggregate): Promise<void>;
  clear(): Promise<void>;
}

export type SfxKey = 'tap' | 'correct' | 'retry' | 'pop' | 'complete' | 'sparkle';

export interface AudioBus {
  play(key: SfxKey): void;
  tone(freq: number, durationMs: number): void;
  speak(text: string, locale: Locale): Promise<void>;
  stopSpeech(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export interface FileBus {
  download(name: string, mime: string, text: string): void;
  pickText(accept: string, maxBytes: number): Promise<string | null>;
}

export interface Preferences {
  get(key: 'locale' | 'muted' | 'reducedMotion' | 'hints'): string | null;
  set(key: 'locale' | 'muted' | 'reducedMotion' | 'hints', value: string): void;
}

export interface LifecycleBus {
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
}

export interface Telemetry {
  track(type: string, payload: unknown): void;
  flush(): Promise<void>;
}

/** 唯一平台出口：游戏/工具代码不直接碰 localStorage / fetch / IndexedDB */
export interface PlatformServices {
  storage: ProgressStore;
  evidenceStore: EvidenceStore;
  audio: AudioBus;
  files: FileBus;
  preferences: Preferences;
  lifecycle: LifecycleBus;
  telemetry: Telemetry;
  now(): number;
}
