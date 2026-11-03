/**
 * 关卡种子：同一档案进同一关应得到同一序列（docs/02 §10.3 的 seedFor）。
 * 用 FNV-1a 而不是 Math.random：重进关卡内容不漂移，问题也可复现。
 */
export function seedFor(levelId: string, profileId: string): number {
  const input = levelId + '|' + profileId;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1_000_000_000;
}
