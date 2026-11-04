import { z } from 'zod';

/** 路网关：从候选边里选一组，连通所有站点且不超预算。 */
export const networkScriptSchema = z.object({
  mode: z.literal('network'),
  nodes: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    x: z.number().int().min(0).max(100),
    y: z.number().int().min(0).max(100),
    key: z.boolean().default(false),
  })).min(3).max(10),
  edges: z.array(z.object({
    id: z.string().min(1),
    a: z.string().min(1),
    b: z.string().min(1),
    cost: z.number().int().min(1).max(20),
  })).min(3).max(24),
  budget: z.number().int().positive(),
  maxEdges: z.number().int().positive(),
  minKeyEdges: z.number().int().min(0).max(10).default(0),
});
export type NetworkScript = z.infer<typeof networkScriptSchema>;

export interface NetworkArtifact {
  edges: string[];
}

export interface NetworkValidation {
  passed: boolean;
  failures: string[];
  metrics: Record<string, number>;
}

export interface NetworkSelection {
  ids: string[];
  cost: number;
  /** 至少有一端是关键站点的候选边数（同一条边只算 1 次，不按端点重复计数）。 */
  keyEdges: number;
  /** 真正接进路网的站点数（用于 UI 实时灯）。 */
  keyStations: number;
  totalKeyStations: number;
}

export function edgeById(script: NetworkScript, id: string) {
  return script.edges.find((edge) => edge.id === id) ?? null;
}

/**
 * 选边统计：只接受候选边，忽略重复/未知 id。
 *
 * minKeyEdges 的口径是「至少有几条候选边的一端是关键站点」（与工具文案一致）：
 * 同一条边即使两端都是关键站点也只算 1 条。旧实现按端点累加，会把一条
 * 两端都关键的边算成 2，和"边数"的说法对不上。
 */
export function selectedEdges(script: NetworkScript, artifact: unknown): NetworkSelection {
  const raw = artifact as NetworkArtifact | null;
  const ids = Array.isArray(raw?.edges)
    ? [...new Set(raw.edges.filter((id): id is string => typeof id === 'string' && edgeById(script, id) !== null))]
    : [];
  const nodeById = new Map(script.nodes.map((node) => [node.id, node]));
  let cost = 0;
  let keyEdges = 0;
  const keyNodes = new Set<string>();
  for (const id of ids) {
    const edge = edgeById(script, id);
    if (!edge) continue;
    cost += edge.cost;
    const aKey = Boolean(nodeById.get(edge.a)?.key);
    const bKey = Boolean(nodeById.get(edge.b)?.key);
    if (aKey || bKey) keyEdges += 1;
    if (aKey) keyNodes.add(edge.a);
    if (bKey) keyNodes.add(edge.b);
  }
  return {
    ids,
    cost,
    keyEdges,
    keyStations: keyNodes.size,
    totalKeyStations: script.nodes.filter((node) => node.key).length,
  };
}

export function connectedComponents(script: NetworkScript, ids: string[]): string[][] {
  const parent = new Map<string, string>();
  for (const node of script.nodes) parent.set(node.id, node.id);
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) as string;
    return current;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) {
    const edge = edgeById(script, id);
    if (edge) union(edge.a, edge.b);
  }
  const groups = new Map<string, string[]>();
  for (const node of script.nodes) {
    const rootId = find(node.id);
    const list = groups.get(rootId) ?? [];
    list.push(node.id);
    groups.set(rootId, list);
  }
  return [...groups.values()];
}

export function validateNetworkArtifact(script: NetworkScript, artifact: unknown): NetworkValidation {
  const raw = artifact as NetworkArtifact | null;
  const edges = Array.isArray(raw?.edges) ? raw.edges : [];
  const metrics = { edges: edges.length, cost: selectedEdges(script, artifact).cost };
  if (edges.length === 0) {
    return { passed: false, failures: ['network-empty'], metrics };
  }
  if (edges.length > script.maxEdges) {
    return { passed: false, failures: ['network-too-many'], metrics };
  }
  const { ids, cost, keyEdges, keyStations, totalKeyStations } = selectedEdges(script, artifact);
  const components = connectedComponents(script, ids);
  if (components.length !== 1) {
    return { passed: false, failures: ['network-disconnected'], metrics: { ...metrics, components: components.length } };
  }
  if (cost > script.budget) {
    return { passed: false, failures: ['network-budget'], metrics: { ...metrics, cost } };
  }
  if (keyEdges < script.minKeyEdges) {
    return {
      passed: false,
      failures: ['network-key'],
      metrics: { ...metrics, keyEdges, keyStations, totalKeyStations },
    };
  }
  return {
    passed: true,
    failures: [],
    metrics: { ...metrics, cost, components: 1, keyEdges, keyStations, totalKeyStations },
  };
}

/** 最小生成树式参考解：按成本排序后并查集贪心，供内容 solution 与审计用。 */
export function referenceNetwork(script: NetworkScript): string[] {
  const ids: string[] = [];
  const parent = new Map<string, string>();
  for (const node of script.nodes) parent.set(node.id, node.id);
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) as string;
    return current;
  };
  for (const edge of [...script.edges].sort((a, b) => a.cost - b.cost)) {
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    ids.push(edge.id);
  }
  return ids;
}