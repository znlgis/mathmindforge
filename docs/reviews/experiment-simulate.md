# reviewer-experiment-simulate 审查报告

> 范围：experiment（tally / sampling / inference / duel）与 simulate（queue / dispatch）两个模板共 7 关。
> 方法：只读源码 + 既有测试/内容 JSON，按源码推导最少交互（未跑 dev/build/e2e）。点击数为"从默认状态到黄金解再提交"的最少动作数，**不含**读题、滚动。
> 结论先行：这 7 关的"流程"大多不是教学，而是**为 evidencePlan 检查点服务的仪式**——3 个"查看指标/查看区间"按钮点了屏幕不变，tally 关 20 次 +1 是纯输入摩擦，simulate 的指标藏在第二张手风琴卡里导致"运行"像坏按钮。
>
> **最硬的一条**：这 7 关里有 4 关（tally×2、sampling、inference、winrate 的 claim）**玩家其实没有在"填答案"**——要么是把系统已经算好的数再手敲一遍（tally：runtime 已算出 `dataset.counts`，experiment/runtime.ts:77-90、:383-393，界面只给 chips 让玩家重数），要么是一键让工具把答案算出来（sampling/inference/winrate 的 claim 全部自动生成，SamplingTool.vue:63-82、InferenceTool.vue:53-79、SampleTool.vue:70-88）。真正由玩家给出答案的只有 queue/dispatch 的参数向量。所以简化的第一步不是删点击，而是先回答"**这一关玩家到底答什么**"：tally=数字，inference=三选一，queue/dispatch=参数，winrate=分配；答案一旦定义清楚，点击和提示自然塌缩。

## 0. 覆盖范围

- 模板：`packages/templates/src/experiment/{runtime,logic,verifier,schema,tally,sampling,inference,duel,sampling-runtime,inference-runtime}.ts`；`packages/templates/src/simulate/{runtime,logic,engine,verifier,queue,schema,queue-runtime}.ts`；共享状态机 `packages/templates/src/shared/runtime.ts`。
- 工具 UI：`packages/toolkit-ui/src/{TallyTool,SamplingTool,InferenceTool,SampleTool,KnobTool,MetricsTool,QueueMetricsTool,ToolDock}.vue`、`metricsRows.ts`。
- 内容：`packages/content/src/details/{k-data-tally,g13-data-weather,g79-data-sampling,g1012-data-inference,g46-modeling-queue,g79-modeling-dispatch,g1012-modeling-winrate}.level.json`、`packages/content/src/levels/*.json`、`games/forge/src/levels/*.ts`（7 关全部 `runEnabled:false`、`hasCanvas:false`）。
- 宿主：`apps/site/src/views/WorkshopView.vue`、`apps/site/src/components/GuideBubble.vue`。
- 门禁：`scripts/content-check.ts`、`scripts/audit-levels.ts`、`packages/content/src/schema.ts`、`packages/i18n/src/index.test.ts`、`e2e/m1.spec.ts`、`e2e/shared.ts`。
- 现有 e2e 真实点击只覆盖 3 关：k-data-tally（m1.spec.ts:50-72）、g79-data-sampling（:157-169）、g1012-data-inference（:183-190）；其余 4 关只有 autoplay + 无工具提交被拒（m1.spec.ts:7-25），点击数为源码推导。

### 0.1 与 `.scratch/review/BASELINE.md` 的口径差异（供 Lead 改表）

| 关卡 | BASELINE 写 | 实际（源码） | 差异原因 |
|---|---|---|---|
| k-data-tally | 28 击 | 27 击（e2e 28） | 方向默认 `most`（TallyTool.vue:26），e2e 多点了一次 `tally-claim-most`（m1.spec.ts:65），非必需 |
| g13-data-weather | ~28 击 | **19 击** | batchSize=7（level JSON:24-28）→ 2 次采样 + 14 次 +1，不是 4+20 |
| g1012-modeling-winrate | ~10 击、"3 滑块+1 数字" | 设计路径 **21 击**、最短已知 **20 击**（knob/run）、理论最短 **6 击** | 无滑块：KnobTool 是 ± 步进/select；50/50/0 要 16 击（step 5） |
| g46-modeling-queue | ~8 击、"滑块" | **7 击** | 无滑块；默认 2/4/30 只需 serviceTime −2 |
| g79-modeling-dispatch | ~8 击、"滑块" | **6 击** | 无滑块；默认 2/1/90，黄金解只需 vehicles +1 |
| g79-data-sampling / g1012-data-inference | 4 / 3 击 | 一致 | — |

---

## 1. 逐关审查

### k-data-tally（模板 experiment/tally，工具 probe → TallyTool）

- **观察可得性：A**。规则=数清 20 个图形、按类别记数、回答最多/最少；首屏 chips（TallyTool.vue:139-148）就是全部题面。缺的信息只有一条：**并列时要把另一类也选上**（tally.ts:116-129 `claimMatches`；level JSON:156-158 `tiedWith`）——这是判定细节，放失败反馈即可（现有反馈已写好：level JSON:439-443 "如果是并列，把另一类也选上"），不需要开场步骤清单。失败反馈现状：4 类都有 message+hint（level JSON:423-443），但玩家要走到 submit 才看到；A 类关建议直接暴露答题面。
- **当前最少交互序列**：1) `tally-sample` ×4（大按钮，TallyTool.vue:129-137）→ 2) `tally-plus-<id>` ×20（± 步进，TallyTool.vue:165-186；6/5/6/3）→ 3) `tally-category-<id>` ×1（点选，:215-228；方向默认 most）→ 4) `tally-claim-submit` ×1（:235-243）→ 5) `level-submit` ×1（WorkshopView.vue:635-643）。**27 击**，阶段 3（sample/tally/claim，level JSON:111-130）。控件：1 大按钮 + 8 步进 + 4 点选 + 2 提交。
- **摩擦点**：
  1. **20 次 +1 是最大摩擦**：每次 dispatch 一条 `probe/tally` 证据（experiment/runtime.ts:118-131）+ 工具使用计数 +1（shared/runtime.ts:280-284）→ 20 击 = 20 条 construct 证据，日志噪音。probe/knob 两类工具里没有任何数字输入控件（全仓唯一数字输入在 CounterTool.vue:209，属反例线）。
  2. 4 次采集是人为拆步：runtime 强制采满才能记统计条（experiment/runtime.ts:118-121），batchSize=5（level JSON:26-28），20/5=4 击只为把 20 个 chip 放出来。
  3. 提示语在教点按钮而不是讲规则："每采完一把，就在这里给对应类别加一格"（TallyTool.vue:152）。
  4. 方向+类别两次点选可合成一次（TallyTool.vue:191-228）。
  5. 并列 `tiedWith` 由工具自动算（TallyTool.vue:47-54）——好设计，保留。
- **建议序列**：1) 「全部倒出来」1 击（TallyTool.vue:58-68 现在固定传 `{}`，改成传 `{ n: 剩余 }` 即可；runtime 已支持 payload.n，experiment/runtime.ts:102-106）→ 2) 4 个数字框填 6/5/6/3（`inputmode=numeric`，blur/Enter 时 dispatch `probe/tally`，复用现有动作，runtime 不改）→ 3) 合并答案 chip「最多 ● 圆」1 击（direction+category 一次 `probe/claim`；并列仍自动）→ 4) 「完成」1 击。**3 击 + 4 次输入**，阶段 3（sample/tally/claim 全保留）。
- **前后对比**：点击 **27→3**（−24），阶段 3→3，输入控件 1 大按钮+8 步进+4 点选 → 1 大按钮+4 数字框+4 答案 chip（1 击）。
- **不可破坏项 / 风险**：sample/tally/claim 三个 checkpoint 必须保留（A1 无工具提交被拒 + A8 autoplay 全满足：audit-levels.ts:56-61、:128-143；evidencePlan ≥2：content-check.ts:208）；`probe-tally-wrong`/`probe-claim-mismatch` 失败类与 4 条负例不能删（audit-levels.ts:84-99、content-check.ts:161-171）；e2e m1.spec.ts:50-72 的 `tally-plus-*` 点击要改成 `fill`。

### g13-data-weather（模板 experiment/tally，工具 probe → TallyTool）

- **观察可得性：A**。与 k-data-tally 同构（14 天、4 类、最多/最少），首屏即题面。缺的信息同样只有并列规则（本关无并列，故实际不需要任何提示）。失败反馈 4 类齐全（level JSON:364-385），可全下沉到提交后。
- **当前最少交互序列**：1) `tally-sample` ×2（batchSize=7，level JSON:24-28）→ 2) `tally-plus-<id>` ×14（5/4/3/2）→ 3) `tally-category-sunny` ×1 → 4) `tally-claim-submit` ×1 → 5) `level-submit` ×1。**19 击**，阶段 3（level JSON:105-124）。控件同上一关。
- **摩擦点**：与 k-data-tally 同源（20 次 +1 → 14 次 +1；TallyTool.vue:165-186；提示语 :152）。额外一条：本关 **没有任何 e2e 真实点击用例**（m1.spec.ts 只覆盖 tally/sampling/inference），交互退化不会被测试发现。
- **建议序列**：同 k-data-tally（1 击倒出 + 4 数字框 + 1 合并答案 + 1 完成）→ **3 击 + 4 输入**。
- **前后对比**：点击 **19→3**（−16），阶段 3→3。
- **不可破坏项 / 风险**：同 k-data-tally；负例含 `probe-not-collected`（level JSON:276-296）依赖"没采集就提交"被 missingEvidence 拦住，改倒出按钮时不能把 sample 检查点变成进入即 true。

### g79-data-sampling（模板 experiment/sampling，工具 probe → SamplingTool）

- **观察可得性：B**。规则（抽两批 → 用样本比例 + 95% 区间估计总体）不是首屏可观察：总体 60/40 不可见，区间概念需要一次点破。缺的信息：**区间是什么、为什么要两批、样本量小会怎样**——当前开场两步提示（level JSON:48-61）只是步骤名（"至少抽两批，每批 20 个"/"记录样本比例与区间"），一条都没解释。正确做法：这些点破放进失败反馈（现有 feedback 已覆盖 sampling-too-small/far/ci-miss，level JSON:250-286）。
- **当前最少交互序列**：1) `sampling-sample-20` ×2（按钮，SamplingTool.vue:100-121）→ 2) `sampling-claim` ×1（:131-139，value/CI 自动算）→ 3) `level-submit` ×1。**4 击**，阶段 2（sample/claim）。控件：1 采样按钮 + 1 结论按钮 + 1 提交（+ 可选清空）。
- **摩擦点**：
  1. **"两批"是计数门禁而不是证据**：工具只显示累计 red/total 与 CI（SamplingTool.vue:88-90、:123-128），runtime 只存累计（sampling-runtime.ts:11-17、:53-73）。实测两批是 **13/20=65% 与 9/20=45%**（seed 101/102，sampling.ts:58），界面完全看不到；而 checkpoint 与失败类 `sampling-too-few-batches` 都在要求"比较两次样本比例"（sampling-runtime.ts:103-109；sampling.ts:95-97；文案 zh-source.ts:180）。→ 玩家抽两批只是为了过关，看不到波动。
  2. 结论是自动算好的（SamplingTool.vue:63-82），玩家没有判断动作——输入形态已是"一键"，但"用样本说话"变成了"点一下"。
  3. "倒回袋里"清空无确认（SamplingTool.vue:112-120 + sampling-runtime.ts:75-80），误点丢样本。
  4. 采样确定性且只有 20 一档（sampling.ts:33-57），重玩结果一样。
  5. **4 个失败类玩家永远看不到**：checkpoints 要求 `total>=40` 且 `batches>=2`（sampling-runtime.ts:103-109），submit 先走 missingEvidence（shared/runtime.ts:186-199）→ `sampling-no-sample`/`sampling-too-small`/`sampling-too-few-batches` 在 UI 路径上不可达；`sampling-no-claim` 也被 claim 检查点拦。verifier 却把它们列为可达类（experiment/verifier.ts:103-105），content-check 只验负例产物、不验运行时可达性（content-check.ts:161-171），所以门禁全绿但玩家看不到这些提示。
- **建议序列**：1) 「抽两批（每批 20）」1 击（内部连续 dispatch 两次；同时把每批比例显示成两行）→ 2) 结论 1 击 → 3) 完成 1 击。**3 击**，阶段 2。显示批次比例需 sampling-runtime 在 state 里保留每批 red/n（小改）。
- **前后对比**：点击 **4→3**，阶段 2→2，控件 1 采样按钮 → 1 采样按钮 + 2 行批次结果。
- **不可破坏项 / 风险**：统计诚实性不能放宽——claim 的 value/n 必须来自样本、CI 必须盖住真值（sampling.ts:89-104）；`sampling-too-small`/`too-few-batches`/`sampling-far`/`sampling-ci-miss` 与 4 条负例（level JSON:116-224）保留；e2e m1.spec.ts:157-169 要同步。

### g1012-data-inference（模板 experiment/inference，工具 probe → InferenceTool）

- **观察可得性：B**。判定标准"区间重叠 → 差异不明确"反直觉（不能只比 70% vs 30%），需要一次点破；但当前不是点破，是**直接给答案**。缺的信息："用区间而不是点估计判断"这条判据——题干（level JSON:8-9）只说"差异是真的吗"，没有给出判据；而工具把结论写屏（InferenceTool.vue:103-105），玩家既没学到判据也没机会判断。
- **当前最少交互序列**：1) `inference-focus`「查看区间」×1（InferenceTool.vue:86-88）→ 2) `inference-a-higher` ×1（三选一，:107-111）→ 3) `level-submit` ×1。**3 击**，阶段 2（compare/claim，level JSON:56-69）。控件：1 死按钮 + 3 结论按钮 + 1 提交。
- **摩擦点**：
  1. **「查看区间」是死按钮**：统计卡与区间一直渲染（InferenceTool.vue:90-105），点击只 dispatch `probe/focus`（:43-51）→ inference-runtime.ts:58-62 置 `focused`；`focusId` 写进快照（inference-runtime.ts:106）但 InferenceTool 从不读 → **点与不点屏幕完全一样**。它唯一作用就是凑 compare 检查点。
  2. **工具直接念答案**：InferenceTool.vue:103-105 渲染"两组区间重叠：差异还不明确"/"两组区间不重叠：方向可判断"，玩家读字点按钮即可，判断被代做（泄题）。
  3. 结论的 CI 是合成值：InferenceTool.vue:59-62 `low=max(0.001, delta-0.25)`、`high=min(0.999, delta+0.25)`，与两组真实区间无关；校验只看方向与 `ci[0]>0`（inference.ts:88-101）。
  4. 规则没教：题干只说"差异是真的吗"（level JSON:8-9），没说"看区间是否重叠"；工具给了答案 → 规则既没教又被代答。
- **建议序列**：删「查看区间」按钮（`checkpoints.compare` 改为进入即 true，或点结论时置 true；A1 仍有 claim 缺失）；删结论行，把"区间重叠 → 差异不明确"下沉到失败反馈（B 类的正确做法）；三选一保留。**2 击**，阶段 2→2（compare 自动）。
- **前后对比**：点击 **3→2**，阶段 2→2，控件 3 按钮不变；屏幕少 1 个死按钮 + 1 行泄题。
- **不可破坏项 / 风险**：`inference-claim-wrong`/`inference-ci-includes-zero` 与 4 条负例（level JSON:140-280；inference.ts:88-101）保留；`claimOptions` 三选一（level JSON:50-54）保留；若把 evidencePlan 合并为 1 阶段，会撞 content schema `min(2)`（content/schema.ts:179）、content-check.ts:208、audit-levels.ts:129——见 §4；e2e m1.spec.ts:183-190 要删 `inference-focus`。

### g46-modeling-queue（模板 simulate/queue，工具 knob + probe → KnobTool + QueueMetricsTool）

- **观察可得性：B**。目标/约束题干写全（level JSON:8-9：全部服务、平均等待≤1、不加班、成本≤30），但"哪个旋钮影响等待/加班/成本"必须跑一次才建立；不需要分步引导。缺的信息：**运行结果**——而当前运行后主面板不显示任何指标（见摩擦点 1），玩家连"跑一次看后果"都做不到；失败反馈 4 类齐全（level JSON:280-306），应作为唯一提示来源。
- **当前最少交互序列**（源码推导，无 e2e 真实点击）：默认 2/4/30（queue-runtime.ts:33-39；level JSON:91-108），黄金解 2/2/30（level JSON:141-176）。1) `knob-serviceTime-minus` ×2（± 步进，KnobTool.vue:160-182；4→2）→ 2) `knob-run` ×1（:212-220；文案"运行两个种子"，messages.ts:101）→ 3) `knob-commit` ×1（:221-229）→ 4) 展开 probe 卡 ×1（ToolDock.vue:54 默认只开第一张）→ 5) `queue-focus`「查看排队指标」×1（QueueMetricsTool.vue:63-70）→ 6) `level-submit` ×1。**7 击**，阶段 3（params/run/compare，level JSON:120-139）。
- **摩擦点**：
  1. **运行后主面板无反馈（本关最严重）**：KnobTool 只认 `sim-runs-v1`（metricsRows.ts:10-23、:62-64），queue 的 dataset id 是 `queue-runs-v1`（queue-runtime.ts:11）→ `latest` 恒 null → KnobTool.vue:208 永远显示"还没有运行记录。调好旋钮，再点'运行两个种子'。"，且按钮文案"运行两个种子"对单日排队关是错的（messages.ts:101）。玩家点完"运行"看不到任何变化。
  2. **「查看排队指标」是死按钮**：表格在按钮下方已渲染（QueueMetricsTool.vue:75-107），点击只 dispatch `probe/focus`（:47-56）→ `compared=true`（queue-runtime.ts:136-141），屏幕无变化。
  3. **三按钮仪式**：run + commit + submit；artifactOf 只要求 `committed==params==lastRun.params`（queue-runtime.ts:42-46），run 已确定参数，commit 不产生新信息。
  4. 指标卡默认折叠：结果藏在第二张卡（ToolDock.vue:54），必须多点一次卡头。
  5. **改参数→锁定→完成 会静默失败**：queue 的 `knob/set` 不清 `lastRun`（queue-runtime.ts:87-98，与 dispatch 的 simulate/runtime.ts:180-187 不一致）→ 改参后 `run`/`compare` 检查点仍为 true、`params` 由锁定按钮置 true → submit 时 artifactOf 因 `committed != lastRun.params` 返回 null（queue-runtime.ts:42-46）→ 共享运行时 `fail('还差一个可以提交的结构。')`（shared/runtime.ts:200-203）→ 宿主只处理有 verdict 的失败（WorkshopView.vue:98-113、:246-252），**横幅不出现、点了"完成"没反应**。复现：改服务台 → 锁定参数 → 完成。
- **建议序列**：1) 服务时长改数字框/档位（1 次输入或 1 击）→ 2) 「运行并锁定」1 击（run 时 committed=values；指标表内嵌同一张卡，run 后同屏显示 avgWait/overtime/cost + 达标灯）→ 3) 「完成」1 击。**3 击**，阶段 3→2（compare 由 run 自动满足）。
- **前后对比**：点击 **7→3**（−4），阶段 3→2，控件 3 组 ± → 1 数字框 + 1 运行 + 1 完成。
- **不可破坏项 / 风险**：`queue-wait`/`queue-overtime`/`queue-budget`/`queue-not-run` 与负例（level JSON:178-254；queue.ts:136-148）保留；checkpoint `params` 的"committed==values"语义不能丢（否则改参数不重跑会误判，queue-runtime.ts:42-46）；run 自动 commit 会改 `checkpoints.params` 语义，但 simulate/logic.test.ts:188-199 只断言"改参数后 params/run 变 false"仍成立；queue 目前**没有单测**（logic.test.ts 只覆盖 dispatch），建议补一条最小路径测试；KnobTool 改造属 toolkit-ui（Lead 负责）。

### g79-modeling-dispatch（模板 simulate/dispatch，工具 knob + probe → KnobTool + MetricsTool）

- **观察可得性：B**。目标/预算在 MetricsTool 顶部列全（MetricsTool.vue:79-84），参数→指标需一次运行；不需要分步引导。缺的信息：指标表的完整历史（第二张卡默认折叠），以及"两个种子日都要达标"的可见结果——run 后 KnobTool 只显示最近一条（KnobTool.vue:197-204），够用但不如合并。
- **当前最少交互序列**：默认 2/1/90/single（logic.ts:115-123；level JSON:217-237），黄金解 A 3/1/90 或 B 2/2/90（level JSON:260-318）。1) `knob-vehicles` ×1（2→3，KnobTool.vue:160-182）→ 2) `knob-run` ×1 → 3) `knob-commit` ×1 → 4) 展开 probe 卡 ×1 → 5) `metrics-focus` ×1（MetricsTool.vue:86-94）→ 6) `level-submit` ×1。**6 击**，阶段 3（level JSON:239-258）。
- **摩擦点**：
  1. commit + focus 两个仪式动作（同 queue；MetricsTool.vue:61-72 的 focus 只置 focusId，表格已在 :103-142 渲染）。
  2. 指标与旋钮分居两卡：KnobTool 内嵌只显示最近一条（KnobTool.vue:197-204），完整表在第二张卡且默认折叠。
  3. `latestIsCurrent` 硬编码 `vehicles/teams/shift/route`（KnobTool.vue:54-62）——只对 dispatch 成立；queue/winrate 的指标框因此永远空/错（见 §2-6）。
  4. 改参数后必须重跑（simulate/runtime.ts:186 清 lastRun；KnobTool.vue:205-207 有提示）——语义正确，不建议改成"自动重跑"（见 §2-3）。
  5. 参数输入：2 个 ± 步进 + 2 个 select（KnobTool.vue:146-182）；本关最优只需 1 击。
- **建议序列**：1) 参数 1 击 → 2) 「运行并锁定」1 击（指标同屏）→ 3) 「完成」1 击。**3 击**，阶段 3→2。
- **前后对比**：点击 **6→3**（−3），阶段 3→2，控件 4 旋钮 → 不变（仍 2 步进 + 2 select）。
- **不可破坏项 / 风险**：`sim-budget`/`sim-coverage`/`sim-wait`/`sim-overfit-seed` 与两个种子（level JSON:319-444；logic.ts:247-358）保留；"指标从 params 重算、不信任产物手写数字"（logic.ts:243-247）保留；actionsFor 测试期望（simulate/logic.test.ts:212-226、:266-269）在改动作顺序时要同步。

### g1012-modeling-winrate（模板 experiment/duel，工具 knob + probe → KnobTool + SampleTool）

- **观察可得性：C**。缺的是**目标与判定标准**：`targets.winRate=0.55 / winRateLow=0.5 / baselineB=0.52`（level JSON:130-134）从未上屏；SampleTool 只显示胜率/区间（SampleTool.vue:121-132）；失败反馈说"还没到目标线"（level JSON:386-389）但不说线在哪。B 种子迁移门（experiment/logic.ts:265-270；duel.ts:258-269）也不可见。→ 需要最小引导（目标条 + 失败反馈），不是开场步骤清单。当前 GuideBubble 三步（level JSON:145-164）只念"分资源/跑一次采样/写结论"，恰好没提目标与 B 种子，属于把内部步骤名念一遍。
- **当前最少交互序列**：默认 30/30/40（level JSON:102-106）。设计路径 50/50/0：1) `knob-attack` ×4 → 2) `knob-defense` ×4 → 3) `knob-economy` ×8（共 16 击，± 步进 step 5，KnobTool.vue:160-182）→ 4) `knob-commit` ×1 → 5) 展开 probe 卡 ×1 → 6) `sample-1000` ×1（SampleTool.vue:107-119）→ 7) `sample-claim` ×1（:144-152）→ 8) `level-submit` ×1。**21 击**，阶段 3（strategy/run/claim，level JSON:145-164）。
  另有捷径：KnobTool 自带 `knob/run`（"跑满 1000 局"，level JSON:52；experiment/runtime.ts:231-266 同时 commit+sample）→ **20 击**，但两个运行入口并存。
  **理论最短**：30/35/35 或 35/30/35 只需 2 击调参（把 5 点从经济移到守/攻），实测均过 A 目标、区间下界与 B 种子 → 2+1(run)+1(展开卡)+1(claim)+1(submit)=**6 击**。但玩家不知道目标线，找不到这条路径。
- **摩擦点**：
  1. **16 击重新分配 100 点（本关最大摩擦）**：sumTo 只在 commit/run 时校验（experiment/runtime.ts:204-207、:239-241），中途和值非法；UI 没有"已分配 X/100"实时反馈 → 中途点运行必报错。
  2. **presets 未实现**：level JSON:53-64 配了 presets，content schema 允许（content/schema.ts:67-68），KnobTool 的 `KnobConfigView` 不读（KnobTool.vue:26-35）→ 快捷档位没上屏。
  3. **两个运行入口**：KnobTool `knob/run` 自动 commit+sample；SampleTool `probe/sample` 要求先 commit（experiment/runtime.ts:267-270）。玩家要猜顺序。
  4. **目标线不可见**（同上）；**B 种子不可见**（SampleTool 只显示当前 seed，experiment/runtime.ts:401-412）。
  5. 采样按钮 100/500 是陷阱：能点，但 submit 判 `exp-sample-small`（duel.ts:243-250），UI 不拦不提示。
  6. 结论自动算（SampleTool.vue:70-88），玩家无判断空间。
- **建议序列**：1) 3 个数字框（攻/守/经）+ 实时"已分配 100/100"（或 presets 一键 1 击）→ 2) 只保留一个「跑满 1000 局」（自动锁定；同屏显示 A 胜率/区间/目标线 + B 种子结果）→ 3) 「用这次数据下结论」1 击 → 4) 「完成」1 击。**6 击（数字框）或 4 击（presets）**，阶段 3→2（strategy 由运行自动满足）。
- **前后对比**：点击 **21（设计路径）/20（已知捷径）/6（理论最短）→ 4~6**，阶段 3→2，控件 3 组 ±5 → 3 数字框 + 1 运行 + 1 结论 + 1 完成。
- **不可破坏项 / 风险**：`exp-sample-small`/`exp-below-baseline`/`exp-claim-beyond-ci`/`exp-overfit-seed`（level JSON:227-325；duel.ts:210-316）保留；n≥1000（duel.ts:243-250）、区间下界≥0.5（duel.ts:270-280）、B 种子迁移门（experiment/logic.ts:168-199）保留；"重算不信任产物"（duel.ts:252-256）保留；experiment/logic.test.ts:230-241（knob/run 语义）、:243-255（改参数清样本）要同步。

### 1.8 答案输入形态汇总（控件类型 → 最直接形态）

| 关卡 | 当前答案怎么填 | 控件类型 | 最直接形态 | 理由 |
|---|---|---|---|---|
| k-data-tally | 4 类计数 + 方向 + 类别 | 8 个 ± 步进 + 4 个点选 + 2 个提交 | 4 个数字框 + 1 个"最多/最少 × 类别"合并 chip | 计数是数字，数字框一次输入=一步；方向与类别是同一个答案，不该拆两步 |
| g13-data-weather | 同上 | 同上 | 同上 | 同上 |
| g79-data-sampling | 样本比例 + 区间（自动） | 1 个采样按钮 + 1 个结论按钮 | 保留（1 键结论） + 每批比例上屏 | 结论本就由数据算出，玩家只需"用数据说话"；缺的是可比较的两批 |
| g1012-data-inference | 三选一（A/B/不明确） | 3 个点选 | 保留三选一，删"查看区间"死按钮 | 判定本身是分类答案，点选最直接 |
| g46-modeling-queue | 3 个参数 | 3 组 ± 步进 | 3 个数字框/档位（+ 运行即锁定） | 参数是数字；步进 4→2 要 2 击 |
| g79-modeling-dispatch | 4 个参数（2 步进 + 2 下拉） | ± 步进 + select | 保留（本关最优只需 1 击） | 输入形态已够直接，问题在 run/commit/focus 仪式 |
| g1012-modeling-winrate | 3 个参数（和=100） | 3 组 ±5 步进（16 击） | 3 个数字框 + 实时"已分配 X/100" + presets 一键 | 和约束需要实时反馈；presets 已在内容里配好但未实现 |

> 计数口径：点击=从默认状态到黄金解再提交的最少动作；数字输入/下拉各计 1 次输入（不算点击）；阶段=evidencePlan 检查点数。

---

## 2. 模板级问题（按影响排序）

1. **三个"查看"按钮是仪式按钮，只为 compare 检查点存在**。`MetricsTool.vue:61-72`（按钮 :86-94，表格 :103-142 早已渲染；点击后唯一可见变化是 :97 打出内部 id "正在看：metrics-table"）、`QueueMetricsTool.vue:47-56`（表格 :75-107；点了屏幕完全不变）、`InferenceTool.vue:43-51`（区间 :90-105；点了屏幕完全不变，`focusId` 无人读，inference-runtime.ts:106）。三处都只 dispatch `probe/focus` 把 `compared/focused` 置 true。**改法**：compare 检查点由"数据在屏/run 完成"自动满足，删按钮；content 侧只删 descriptionKey 引用，不改 schema。
2. **simulate 的指标与旋钮分居两张卡，queue 运行后完全无反馈**。ToolDock 手风琴默认只开第一张（ToolDock.vue:54）；KnobTool 只认 `sim-runs-v1`（metricsRows.ts:23、:62-64），queue 的数据集是 `queue-runs-v1`（queue-runtime.ts:11）→ KnobTool.vue:208 永远"还没有运行记录"，按钮文案还是"运行两个种子"（messages.ts:101）。**改法**：simulate 合并为单卡（旋钮+指标+运行），或给 KnobTool 加 config 驱动的指标适配（queue 字段 vs dispatch 字段不同）。
3. **run/commit/submit 三按钮仪式，以及两个运行入口**。simulate：`knob/run` + `knob/commit` + `submit`（queue-runtime.ts:99-129；simulate/runtime.ts:201-245），artifactOf 只要求 committed==values==lastRun.values；experiment/duel：KnobTool `knob/run` 与 SampleTool `probe/sample` 两个入口（experiment/runtime.ts:231-266 vs :267-295）。**改法**：run 即锁定（`committed=values`），删 commit；duel 只留一个运行入口。
   **"改一次参数即自动重跑"评估**：不建议。① 每次 ±1 都重跑会写入 RunRecord/证据（shared/runtime.ts:146-160、:244-259），16 击调参 = 16 条运行记录，与 docs/01 §5.5"每次运行产生 RunRecord"冲突，queue 的 history 上限 10 会瞬间刷满（queue-runtime.ts:112）；② 会让"先预测再运行"的学习节奏消失。折中：**参数变动只显示"预览指标"（不落 RunRecord/证据），点"运行"才记一次实验**；queue/dispatch 可做，winrate 不做（样本量是本关教学目标）。
4. **GuideBubble 有步进 bug，且文案就是内部步骤名**。`guideVisible` 只显示"当前 guideStep 那一步未完成"（WorkshopView.vue:117-126），玩家完成第 1 步后气泡隐藏，但 `guideStep` 只有点"知道了"才前进（:434-441）→ **后续步骤永远不会自动出现**；文案取自 `evidencePlan[].descriptionKey`（:79-85），即"先把整筐采完（一次 5 个）/把每一类的数量记进统计条/选最多或最少，提交结论"——把内部步骤名念一遍。**改法**：A 类关卡不显示；B 类只在失败后出现；或修成"完成一步自动前进"。
5. **evidencePlan 把"顺序"变成门禁**。tally 必须先采满才能记统计条（experiment/runtime.ts:118-121）；simulate 必须 commit+run+focus 三件套（shared/runtime.ts:131-144）。**改法**：只保留对理解有增量的阶段；顺序门禁降级为产物门禁。
6. **KnobTool 的 `latestIsCurrent` 硬编码 dispatch 字段**（KnobTool.vue:54-62）：queue/winrate 的字段名不同，指标框永远空（winrate 的 probe dataset id 是 `dataset-duel`，experiment/runtime.ts:403，也读不到）→ 空状态文案"还没有运行记录。调好旋钮，再点'运行两个种子'"（:208）对这两关都是错的。
7. **probe/knob 两类工具没有任何数字输入**：答案输入只有 ± 步进（TallyTool、KnobTool）和点选；全仓唯一数字输入在 CounterTool.vue:209（反例线的目标金额）。tally 20 击、winrate 16 击都源于此。**改法**：给 TallyTool/KnobTool 加 `<input type="number" inputmode="numeric">`，复用现有 dispatch 动作（无需改 runtime）。
8. **泄题**：InferenceTool.vue:103-105 直接渲染判定结论；TallyTool.vue:152 教点按钮。规则可观察的关不需要提示（A），反直觉的关提示应放失败反馈（B）。
9. **采样批次证据不可见**：SamplingTool.vue:88-90、:123-128 只显示累计；sampling-runtime.ts:11-17 不存批次记录。两批 65%/45% 的波动没上屏，"两批"退化为计数门禁。
10. **`evidencePlan.require` 是死数据**：只作为 `missingEvidence[].actionHint`（shared/runtime.ts:138-141），而宿主失败横幅只显示 descriptionKey、把 hint 丢掉（WorkshopView.vue:110-112）。content-check 只校验非空（content-check.ts:213）。不要把它当门禁依据。

11. **门禁全绿 ≠ 玩家路径成立（这是所有摩擦能活到今天的原因）**：audit 的 A8 走的是 `runtime.autoplay()` → `actionsFor`（shared/runtime.ts:290-305；audit-levels.ts:128-143），完全绕开 UI 与控件；A1 只要求"无工具提交出现失败横幅"（audit-levels.ts:56-61）；content:check 只对内容 JSON 跑 validateArtifact（content-check.ts:143-205）。所以"27 击才能填完统计条""运行后主面板没有指标""查看区间是死按钮"都能通过全部门禁。**改法**：给 audit 加一条"UI 路径冒烟"（至少断言每个工具面板的可见结果区在关键动作后发生变化），否则这轮简化做完，下一轮还会长出新的仪式按钮。

### 2.1 状态机陷阱（对应 RUBRIC §2-4）

1. **"运行"与"提交"是否同一份校验**：是——共享运行时 `run` 走 `adapter.validate`（shared/runtime.ts:244-259），`submit` 走同一份 `adapter.validate` + 迁移门（:204-241）。但 7 关全部 `runEnabled:false`（games/forge/src/levels/*.ts），宿主"试一下"按钮被隐藏（WorkshopView.vue:625-634），所以这两个模板里**不存在 run/submit 双按钮**；真正的"运行"是工具内的 `knob/run`/`probe/sample`。
2. **同模板不同 mode 的"状态失效"语义三套，互不一致**：duel 的 `knob/set` 会清 `params/sample/claim`（experiment/runtime.ts:186-193）→ 改参数即打掉已提交结论（合理）；dispatch 的 `knob/set` 只清 `lastRun`、不清 `committed`（simulate/runtime.ts:180-187）→ 改参数后 params 检查点变 false（合理）；queue 的 `knob/set` **什么都不清**（queue-runtime.ts:87-98）→ 改参数后 run/compare 检查点仍为 true，直到锁定才因 artifact 不一致静默失败（见 §1 g46 摩擦点 5）。这是同一模板三份状态机漂移。
3. **失败横幅会被"缺步骤"吞掉**：submit 先判 missingEvidence（shared/runtime.ts:186-199），再判产物/约束。sampling 的 `sampling-no-sample`/`sampling-too-small`/`sampling-too-few-batches` 因此不可达（§1 g79 摩擦点 5）；inference 的 `inference-too-small`/`inference-sample-mismatch` 同理（checkpoint 只要求 claim 存在，claim 由三选一生成，样本量由脚本写死——这两个失败类实际只能由构造的负例触发，玩家路径不可达）。**门禁层面没人发现**：content-check 只对负例产物跑 validateArtifact（content-check.ts:161-171），不跑运行时路径；audit-levels 的 A1 只要求"无工具提交有缺失证据"（audit-levels.ts:56-61）。
4. **失败反馈的两个出口不一致**：有 `failure` 的走内容 feedback（WorkshopView.vue:105-109）；只有 `missingEvidence` 的只显示 `level.failureMissing` + descriptionKey，`actionHint`（即 evidencePlan.require）被丢弃（:110-112）；`ok:false` 的（artifact null）**什么都不显示**（:246-252 只处理 verdict）。→ 简化方案里如果删检查点，必须同时确认失败类仍能从 validate 路径出来，否则玩家会撞上"点了没反应"。


---

## 3. 可直接落地的改动清单

| # | 改动 | 文件 | 影响关卡 | 风险 |
|---|---|---|---|---|
| 1 | TallyTool 加"全部倒出"按钮（复用 probe/sample，n=items.length） | toolkit-ui/TallyTool.vue | k-data-tally、g13-data-weather | 低：runtime 已支持 payload.n（experiment/runtime.ts:102-106）；sample 检查点仍可达 |
| 2 | TallyTool 的 ± 改数字框（blur/Enter dispatch probe/tally） | toolkit-ui/TallyTool.vue | 同上 | 低：probe/tally 接收整份 counts；需处理空值与 0 |
| 3 | 答案合并成一个 chip（direction+category 一次 claim） | toolkit-ui/TallyTool.vue | 同上 | 低：probe/claim 已接收完整 claim |
| 4 | 删 InferenceTool「查看区间」按钮；compare 改为进入即 true | toolkit-ui/InferenceTool.vue + experiment/inference-runtime.ts | g1012-data-inference | 中：改 checkpoint 语义；A1/A8 仍过 |
| 5 | 删 InferenceTool 的"区间重叠/不重叠"结论行，文案下沉到失败反馈 | toolkit-ui/InferenceTool.vue + 内容 feedback | g1012-data-inference | 中：需新增/改 feedback 文案（i18n 登记） |
| 6 | SamplingTool 显示每批比例；加"抽两批"按钮 | toolkit-ui/SamplingTool.vue + experiment/sampling-runtime.ts | g79-data-sampling | 中：state 增 batchRecords |
| 7 | simulate 指标并入旋钮卡 / KnobTool 支持 queue 数据集 | toolkit-ui/{KnobTool,ToolDock}.vue + metricsRows.ts | g46-modeling-queue、g79-modeling-dispatch | 中高：toolkit-ui 与 e2e testid |
| 8 | knob/run 自动 commit（run 即锁定），删"锁定参数"按钮 | simulate/runtime.ts、simulate/queue-runtime.ts、KnobTool.vue | queue、dispatch、winrate | 中：checkpoints.params 语义；测试同步 |
| 9 | duel 只留一个运行入口（隐藏 KnobTool run 或 SampleTool 采样） | KnobTool.vue / SampleTool.vue + 内容 config | g1012-modeling-winrate | 低：config passthrough（content/schema.ts:69） |
| 10 | 数字框替换 ±5 步进（攻/守/经）+ 实时"已分配 100/100" | toolkit-ui/KnobTool.vue | g1012-modeling-winrate | 中：sumTo 校验在 runtime（experiment/runtime.ts:204-207） |
| 11 | 显示目标线（55%/区间下界 50%/B 种子 52%）与 B 种子结果 | toolkit-ui/SampleTool.vue + experiment/runtime.ts | g1012-modeling-winrate | 中：需把 targets 传进 toolState |
| 12 | GuideBubble 只对 B/C 关显示，且失败后才出 | WorkshopView.vue | 全部 7 关 | 低：纯宿主 |
| 13 | queue 的 knob/set 与 dispatch 对齐：改参数清 lastRun（或统一三套状态机） | simulate/queue-runtime.ts | g46-modeling-queue | 中：需补 queue 单测（现在没有） |
| 14 | 宿主对 `ok:false` 也给失败反馈（当前点了没反应） | apps/site/src/views/WorkshopView.vue | 全部 7 关 | 低：纯宿主；需与失败横幅去重 |
| 15 | 修不可达失败类：要么放宽检查点（让 validate 先跑），要么从可达类/负例里删 | 模板 checkpoints + 内容 negativeSamples/feedback | sampling、inference、queue、dispatch | 中高：动 A4 门禁语义，需 Lead 定 |
| 16 | KnobTool 空状态文案/按钮文案按关卡配置（"运行两个种子"对 queue/winrate 是错的） | toolkit-ui/KnobTool.vue + i18n | queue、winrate | 低：i18n 需登记 |
| 17 | 删/改 e2e 真实点击序列 | e2e/m1.spec.ts | tally/sampling/inference | 必做 |

### 3.1 门禁影响与兼容办法（改前必读）

| 门禁 | 位置 | 本方案会碰到什么 | 兼容办法 |
|---|---|---|---|
| content:check 证据计划 | content-check.ts:207-219 | 删/合并 checkpoint 会撞"≥2 阶段"与 require/descriptionKey 非空 | 保留 2 个检查点（第二个自动满足）或按 §4-1 申请放宽；descriptionKey 改文案要同步 i18n |
| content:check 解/负例/变体 | content-check.ts:143-205 | 删失败类会让负例"失败类不符"、feedback 覆盖不全 | 失败类只增不减；删动作可以，删判定不行 |
| audit A1/A1b | audit-levels.ts:56-61、116-120 | 检查点变"进入即 true"后，无工具提交仍必须给 missingEvidence（A1 只要求非空） | 至少保留 1 个"提交时才有"的检查点（tally=claim；inference=claim） |
| audit A2 | audit-levels.ts:76-82 | 数字输入替代步进后，actionsFor 仍要有 ≥2 种非选择动作 | 保留 probe/tally + probe/claim（tally）、knob/run + probe/claim（simulate） |
| audit A3 | audit-levels.ts:63-74 | tally 两解（s-most-tie / s-least-star）产物不同，保留 | 不动 |
| audit A4 | audit-levels.ts:84-99 | 可达类与负例必须一一对上；sampling/inference/queue 的不可达类见 §2.1-3 | 要么放宽检查点让 validate 先跑，要么从 reachableFailureClasses 与负例里同时删（需 Lead 定） |
| audit A6 / 迁移门 | audit-levels.ts:101-114；experiment/logic.ts:265-270 | winrate 的 v-seed-b 必须仍能过；tally/sampling/inference/simulate 无迁移门 | 不动 |
| audit A8 | audit-levels.ts:128-143 | autoplay 必须走通且所有 evidencePlan 检查点满足 | 改 actionsFor 时同步（sampling 的 actionsFor 现在写死 value 0/n 0，靠 claim 检查点兜底，注意别删） |
| content schema | content/schema.ts:176-191（strict） | 新增工具 config 字段无需改 schema（probe/knob 是 passthrough，:69/:82）；新增 probe mode 要改 enum（:75） | 优先用 passthrough 字段 |
| e2e | e2e/m1.spec.ts:50-72、157-169、183-190 | 三条真实点击序列会失效 | 同步改成 fill / 删死按钮；autoplay 与无工具提交循环（:7-25）不受影响 |
| i18n | packages/i18n/src/index.test.ts:36-75 | 新增中文文案必须能翻成英文 | 新 key 进 zhSourceEn；删文案时 referenced 数量仍 >150 |

**全局不可破坏项**：①判定一律从产物/脚本重算（duel.ts:252-256、logic.ts:243-247、sampling.ts:89-104、inference.ts:88-101）——简化只动输入形态，不动判定；②失败类与 feedback 覆盖（content-check.ts:191-205）；③印章/迁移门/变体；④无工具提交必须被拒（A1）；⑤7 关 runEnabled/hasCanvas 不变（games/forge/src/levels/*.ts）。

---

## 4. 需要 Lead/用户决策的问题

1. **evidencePlan 最小 2 阶段能否放宽到 1？** inference 的 compare/claim 合并后只剩 1 个；不改 schema 的话必须保留一个"自动满足"的 compare 检查点（语义不干净）。影响 content/schema.ts:179、content-check.ts:208、audit-levels.ts:129、i18n/index.test.ts:55-57。
2. **tally 关是否允许"一键倒出全部"？** 会把"观察"从 4 次采集压成 1 次；若认为"分把采集"本身是教学目标，则保留 4 击（但建议至少去掉 20 次 +1）。
3. **simulate 是否合并 run+commit（run 即锁定）？** 影响 checkpoints.params 语义与 simulate/logic.test.ts:188-199/212-226；不合并则 commit 这一击保留。
4. **是否允许"参数一动显示预览指标（不落证据）"？** queue/dispatch 可行且能去掉"点运行看结果"的仪式；winrate 不建议（样本量是教学目标）。
5. **winrate 是否显示目标线与 B 种子结果？** 显示会降低难度，但不显示则目标不可得、玩家只能乱试（当前最短路径 30/35/35 需要知道目标）。
6. **sampling 是否改成"给定两批数据"（去掉抽样动作，2 击通关）？** 会丢掉"抽样"这个动作语义，但当前两批波动不可见、抽样本身没有决策空间。
7. **simulate 是否重做成单卡面板（旋钮+指标+运行）？** 涉及 toolkit-ui 与 e2e testid，工作量大但能根治 queue"运行无反馈"。
