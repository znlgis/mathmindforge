/** 可注入种子的确定性 RNG；纯逻辑层唯一允许的随机来源。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function digest(value: unknown): string {
  // JSON.stringify(undefined / 函数 / symbol) 返回 undefined 而不是字符串；
  // 产物摘要来自玩家输入，缺字段是常态，这里退成空串，避免取 .length 时整次提交崩掉。
  const text = JSON.stringify(value) ?? '';
  return hashString(text).toString(16).padStart(8, '0');
}
