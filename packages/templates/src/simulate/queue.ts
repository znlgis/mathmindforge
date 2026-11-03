import { round2 } from '@mmf/toolkit/shared';
import { z } from 'zod';

/** 排队关：固定到达序列 + 确定性服务台分配；不读时钟、不用随机。 */
export const queueScriptSchema = z.object({
  mode: z.literal('queue'),
  arrivals: z.array(z.number().int().min(0)).min(4).max(60),
  serviceTime: z.object({
    min: z.number().int().min(1).max(20),
    max: z.number().int().min(1).max(20),
    step: z.number().int().min(1).max(10),
    default: z.number().int().min(1).max(20),
  }),
  servers: z.object({
    min: z.number().int().min(1).max(8),
    max: z.number().int().min(1).max(8),
    step: z.number().int().min(1).max(4),
    default: z.number().int().min(1).max(8),
  }),
  openMinutes: z.object({
    min: z.number().int().min(20).max(240),
    max: z.number().int().min(20).max(240),
    step: z.number().int().min(5).max(30),
    default: z.number().int().min(20).max(240),
  }),
  targets: z.object({
    servedAll: z.boolean().default(true),
    avgWaitMax: z.number().min(0).max(60),
    overtimeMax: z.number().int().min(0).max(120),
  }),
  cost: z.object({
    serverCost: z.number().positive(),
    overtimePenalty: z.number().min(0),
    budget: z.number().positive(),
  }),
});
export type QueueScript = z.infer<typeof queueScriptSchema>;

export interface QueueParams {
  servers: number;
  serviceTime: number;
  openMinutes: number;
}

export interface QueueRun {
  served: number;
  avgWait: number;
  maxQueue: number;
  overtime: number;
  cost: number;
  passed: boolean;
}

export interface QueueEvaluation {
  run: QueueRun;
  failures: string[];
}

/** 每个服务台记下一次空闲时间；到达时取最早空闲，等待 = max(0, free - arrival)。 */
export function runQueue(script: QueueScript, params: QueueParams): QueueRun {
  const free: number[] = Array.from({ length: params.servers }, () => 0);
  const arrivals = [...script.arrivals].sort((a, b) => a - b);
  const starts: number[] = [];
  let waitTotal = 0;
  let served = 0;
  let lastFinish = 0;

  for (const arrival of arrivals) {
    let earliest = 0;
    for (let i = 1; i < free.length; i += 1) {
      if (free[i] < free[earliest]) earliest = i;
    }
    const start = Math.max(arrival, free[earliest]);
    const finish = start + params.serviceTime;
    free[earliest] = finish;
    starts.push(start);
    waitTotal += start - arrival;
    served += 1;
    lastFinish = Math.max(lastFinish, finish);
  }

  // 每个到达时刻仍在等待的客户数：已到达且尚未开始服务。
  let maxQueue = 0;
  for (let i = 0; i < arrivals.length; i += 1) {
    const at = arrivals[i] as number;
    let waiting = 0;
    for (let j = 0; j < arrivals.length; j += 1) {
      const arrival = arrivals[j] as number;
      const start = starts[j] as number;
      if (arrival <= at && start > at) waiting += 1;
    }
    maxQueue = Math.max(maxQueue, waiting);
  }

  const overtime = Math.max(0, lastFinish - params.openMinutes);
  const cost = round2(params.servers * script.cost.serverCost + overtime * script.cost.overtimePenalty);
  const avgWait = served > 0 ? round2(waitTotal / served) : 0;
  return {
    served,
    avgWait,
    maxQueue,
    overtime,
    cost,
    passed: served === arrivals.length
      && avgWait <= script.targets.avgWaitMax + 1e-9
      && overtime <= script.targets.overtimeMax
      && cost <= script.cost.budget + 1e-9,
  };
}

export function evaluateQueue(script: QueueScript, params: QueueParams): QueueEvaluation {
  const run = runQueue(script, params);
  const failures: string[] = [];
  if (run.served < script.arrivals.length) failures.push('queue-unserved');
  if (run.avgWait > script.targets.avgWaitMax + 1e-9) failures.push('queue-wait');
  if (run.overtime > script.targets.overtimeMax) failures.push('queue-overtime');
  if (run.cost > script.cost.budget + 1e-9) failures.push('queue-budget');
  return { run, failures };
}

export function queueArtifact(script: QueueScript, params: QueueParams): unknown {
  const evaluation = evaluateQueue(script, params);
  return {
    params: { ...params },
    run: {
      served: evaluation.run.served,
      avgWait: evaluation.run.avgWait,
      maxQueue: evaluation.run.maxQueue,
      overtime: evaluation.run.overtime,
      cost: evaluation.run.cost,
    },
    totalArrivals: script.arrivals.length,
  };
}

export function validateQueueArtifact(script: QueueScript, artifact: unknown): { passed: boolean; failures: string[]; run: QueueRun } {
  const raw = artifact as { params?: Partial<QueueParams> } | null;
  const params = raw?.params;
  if (!params || typeof params.servers !== 'number' || typeof params.serviceTime !== 'number' || typeof params.openMinutes !== 'number') {
    return { passed: false, failures: ['queue-not-run'], run: runQueue(script, { servers: script.servers.default, serviceTime: script.serviceTime.default, openMinutes: script.openMinutes.default }) };
  }
  const evaluation = evaluateQueue(script, {
    servers: Math.max(script.servers.min, Math.min(script.servers.max, Math.trunc(params.servers))),
    serviceTime: Math.max(script.serviceTime.min, Math.min(script.serviceTime.max, Math.trunc(params.serviceTime))),
    openMinutes: Math.max(script.openMinutes.min, Math.min(script.openMinutes.max, Math.trunc(params.openMinutes))),
  });
  return { passed: evaluation.failures.length === 0, failures: evaluation.failures, run: evaluation.run };
}
