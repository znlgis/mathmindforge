import type { EvidenceDraft, SaveData, ShippedLevelId, StampId, ToolId } from '@mmf/game-kit';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { progressManager } from '../shell/progress';
import { setDebugSave } from '../shell/debug';

export interface CompletionInput {
  levelId: ShippedLevelId;
  variantId: string;
  stamps: StampId[];
  failureClassesSeen: string[];
  revisionCount: number;
  toolIds: ToolId[];
  durationMs: number;
}

export const useProgress = defineStore('progress', () => {
  const save = ref<SaveData | null>(null);
  const ready = ref(false);
  const initError = ref<string | null>(null);
  let inflight: Promise<void> | null = null;

  function sync(): void {
    const snapshot = progressManager.snapshot();
    save.value = snapshot;
    setDebugSave(snapshot);
  }

  function init(): Promise<void> {
    inflight ??= (async () => {
      try {
        save.value = await progressManager.init();
      } catch (cause) {
        initError.value = cause instanceof Error ? cause.message : String(cause);
        console.warn('[mmf] 存档读取失败，本次从空档开始', cause);
      } finally {
        ready.value = true;
        sync();
      }
    })();
    return inflight;
  }

  async function completeLevel(input: CompletionInput): Promise<void> {
    await progressManager.completeLevel(input);
    sync();
  }

  async function recordEvidence(levelId: ShippedLevelId, drafts: EvidenceDraft[]): Promise<void> {
    await progressManager.recordEvidence(levelId, drafts);
  }

  function completedBefore(levelId: ShippedLevelId): boolean {
    return save.value?.levels[levelId]?.completed === true;
  }

  async function clear(): Promise<void> {
    await progressManager.clear();
    sync();
  }

  return { save, ready, initError, init, completeLevel, recordEvidence, completedBefore, clear, sync };
});
