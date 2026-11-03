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

export function edgeById(script: NetworkScript, id: string) {
  return script.edges.find((edge) => edge.id === id) ?? null;
}

/** 并查集：只接受候选边，忽略重复/未知 id。 */
export function selectedEdges(script: NetworkScript, artifact: unknown): { ids: string[]; cost: number; keys: number } {
  const raw = artifact as NetworkArtifact | null;
  const ids = Array.isArray(raw?.edges)
    ? [...new Set(raw.edges.filter((id): id is string => typeof id === 'string' && edgeById(script, id) !== null))]
    : [];
  let cost = 0;
  let keys = 0;
  for (const id of ids) {
    const edge = edgeById(script, id);
    if (!edge) continue;
    cost += edge.cost;
    if (script.nodes.find((node) => node.id === edge.a)?.key) keys += 1;
    if (script.nodes.find((node) => node.id === edge.b)?.key) keys += 1;
  }
  return { ids, cost, keys };
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
  const { ids, cost, keys } = selectedEdges(script, artifact);
  const components = connectedComponents(script, ids);
  if (components.length !== 1) {
    return { passed: false, failures: ['network-disconnected'], metrics: { ...metrics, components: components.length } };
  }
  if (cost > script.budget) {
    return { passed: false, failures: ['network-budget'], metrics: { ...metrics, cost } };
  }
  if (keys < script.minKeyEdges) {
    return { passed: false, failures: ['network-key'], metrics: { ...metrics, keys } };
  }
  return { passed: true, failures: [], metrics: { ...metrics, cost, components: 1 } };
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
