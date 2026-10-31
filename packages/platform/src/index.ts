/**
 * 平台包入口：Web 实现 + 平台契约类型转发。
 * 游戏 / 工具 / 外壳代码只从这里拿平台能力，不直接碰 localStorage / indexedDB。
 */
export {
  AGGREGATE_KEY,
  EVIDENCE_KEY,
  MAX_EVIDENCE_EVENTS,
  MMF_DB_NAME,
  MMF_KV_STORE,
  SAVE_KEY,
  createWebPlatform,
} from './web';

export type {
  AudioBus,
  EvidenceAggregate,
  EvidenceDraft,
  EvidenceEvent,
  EvidenceRecord,
  EvidenceStore,
  FileBus,
  LifecycleBus,
  PlatformServices,
  Preferences,
  ProgressStore,
  SaveData,
  Telemetry,
} from '@mmf/game-kit';
