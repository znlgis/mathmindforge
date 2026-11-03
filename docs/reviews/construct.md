# reviewer-construct 审查报告（construct 模板：6 关 / 5 种模式）

> 结论先行：construct 模板的问题**不是"点击多"**，而是**"唯一反馈通道（提交）被 evidencePlan 门禁堵住"**。逐类核对后：6 关内容共声明 31 条失败反馈，**玩家在正常 UI 里只能触发 9 条（29%）**；network 0/6、frontier 0/4、schedule 1/5、k-modeling-share 1/5。降点击是第二顺位。
> 本轮只出方案，未改任何文件。计数口径：**e2e 计** = Playwright 每次 click/selectOption/fill 记 1（与 e2e/ 现有用例对齐）；**真实计** = 原生 select 记 2 次点按、数字输入记 1 次输入。

## 0. 覆盖范围

- 模板：`construct`（5 种模式：payment / distribution / network / schedule / frontier）
- 关卡：`k-modeling-share`、`g13-modeling-pack`（distribution）、`g79-structure-network`（network）、`g79-algorithm-schedule`（schedule）、`g46-algorithm-payment`（payment + counter）、`g1012-algorithm-frontier`（frontier）
- 读过的源码：`packages/templates/src/construct/{runtime,logic,verifier,engine,schema,distribution,network,network-runtime,schedule,schedule-runtime,frontier,frontier-runtime,index}.ts`、`packages/templates/src/shared/runtime.ts`、`packages/toolkit-ui/src/{ToolDock,ConstructTool,DistributeTool,NetworkTool,ScheduleTool,PaymentTool,CounterTool,FrontierTool}.vue`、`apps/site/src/views/WorkshopView.vue`、`apps/site/src/components/GuideBubble.vue`、`games/forge/src/levels/`（这 6 关）、`games/forge/src/forge.test.ts`
- 读过的内容：`packages/content/src/details/`（这 6 关 .level.json）、`packages/content/src/schema.ts`
- 读过的门禁：`scripts/content-check.ts`、`scripts/audit-levels.ts`、`packages/templates/src/construct/logic.test.ts`、`packages/templates/src/i18n-coverage.test.ts`
- 读过的 e2e：`e2e/m1.spec.ts`（:27-48 payment、:97-109 k-share、:171-181 network、:192-202 schedule、:204-214 frontier）、`e2e/shared.ts`
- 读过的文档：`docs/01` §5.1/§5.4、`docs/11`、`docs/10` §6

**核心事实（先给汇总判断，逐关证据在 §1）**

| 关卡 | 模式 | 规则观察可得性 | 当前最少交互（e2e 计） | 建议最少交互 | 失败反馈可达性 |
|---|---|---|---|---|---|
| k-modeling-share | distribution | **A**（intro+prompt 已给"12 件 / 每盘 3 件"） | 13（12 次 +，1 次完成） | 5（3 次 + 配一盘、1 次"照这样分"、1 次完成） | **1/5**（只有 unequal 可达） |
| g13-modeling-pack | distribution | **A**（prompt 已给"9 件 / 每盒 3 件 / 至少两类"） | 10（9 次 +，1 次完成） | 5（3 次 + 配一盒、1 次复制、1 次完成） | **2/5**（unequal + missing-kind） |
| g79-structure-network | network | **A** 规则文本可得 / **判定不可观察**（无图、无连通块数） | 5（4 次选边，1 次完成） | 5（4 次点边，1 次完成；点击数不变，收益是自检+反馈） | **0/6**（全部被门禁 / 死代码挡） |
| g79-algorithm-schedule | schedule | **A** 规则文本可得 / 判定不可观察（无冲突提示、无偏好计数） | 5（e2e）/ 9（真实，4 个下拉） | 5（4 次点格，1 次完成） | **1/5**（只有 schedule-bonus 可达） |
| g46-algorithm-payment | payment+counter | 付款 **A**；反例 **B**（需一次点破） | 12（2 硬币、开卡、1 输入、3 勾选、测试、下拉前提、提交反例、完成） | 5-9（取决于是否保留"测试/提交反例"两步） | **5/6**（invalid 被 UI 禁用态挡住） |
| g1012-algorithm-frontier | frontier | **A**（intro 已给做法，prompt 给完整判定） | 5（4 次下拉）/ 9（真实） | 2（1 次改成本、1 次完成） | **0/4**（4 条 feedback 全部不可达） |

### 0.1 最硬的四条结论（供汇总直接用）

1. **construct 的"简化"不是删按钮，而是把 validator 的判定前置成可见状态。** 5 种模式的答案对象本来都能直接映射成控件（计数矩阵→步进/复制；边集→图上点边；课次×时段→网格；边权→内联数字），但现状是 3 种模式把答案对象藏进列表/下拉（`NetworkTool.vue:86-101`、`ScheduleTool.vue:75-84`、`FrontierTool.vue:66-74`），玩家看不到"我正在编辑的那个对象"；与此同时唯一的判定出口（提交）又被 evidencePlan 门禁占住（§1.7）。**两个问题必须一起修**，只删按钮 = 更快的盲操作。
2. **只改一处（`shared/runtime.ts:186-199` 的提交顺序）就能把 UI 可达的失败反馈从 9/31 提到约 17/31（55%）**：按分支推演，可救回 k-share 的 shortage、pack 的 shortage、network 的 disconnected/budget/too-many、schedule 的 incomplete/conflict、frontier 的 not-counter（空的 artifact 仍走"缺产物"分支，不计入）。这条是所有简化项里"性价比最高"的一条，且不碰内容 schema、不改 e2e 语义——**建议列为第一步**。
3. **最小交互有下界，下界 = 答案的自由度**：k-share ≥4（配一盘 3 + 复制 1，现在 13）、pack ≥4（现在 10）、network =4 条边（现在 5，本来就在下界）、schedule =4 次点格（现在 5/9）、frontier =1 次改动（现在 5/9，因为默认值只差一步）、payment =6（2 硬币 + 4 个反例参数，现在 12）。**任何低于下界的方案都是系统替玩家做题**——任务书里"每个容器一次点击循环数量"正是这种（§1 k-modeling-share）。

4. **6 关合计（逐项加总，口径见文首）**：
   - e2e 计：现在 **50 击**（13+10+5+5+12+5）→ 建议 **31 击**（5+5+5+5+9+2，payment 走保守 9）或 **27 击**（payment 走激进 5）。
   - 真实操作计（原生下拉按 2 次）：现在 **58 击**（不含引导）/ **72 击**（含 15 次引导点击）→ 建议 **31 击 / 0 次引导**。
   - **network 是本轮唯一"点击数不变但必须改"的关**（下界 4 条边），收益全在反馈可达性；frontier 是降幅最大的关（5→2），因为它本来只差一步。
   - 口径说明：引导步 = `evidencePlan` 条数 × 每次"知道了"；payment 的 4 步 → 建议 2 步，也是"阶段数"从 15 降到 9 的主要来源。


## 1. 逐关审查

### k-modeling-share（construct / distribution，工具 construct）
- **观察可得性：A**。`intro`「四个盘子，8 块饼干和 4 个苹果。每个盘子要一样多，而且不能剩。」+ `prompt`「把 12 件点心全分完，每个盘子 3 件。」（`packages/content/src/details/k-modeling-share.level.json:8-9`）已经把**规则 + 答案**都说完了；宿主把这两句渲染成一整条情境条（`apps/site/src/views/WorkshopView.vue:525-532`）。这关不需要"提示流程"，需要的是**少按几下**。
- **当前最少交互序列（13 击，e2e 实测 `e2e/m1.spec.ts:97-109`）**：
  1) 点 `dist-plus-0-cookie` ×2（+ 号按钮，`packages/toolkit-ui/src/DistributeTool.vue:120-129`）
  2) 点 `dist-plus-0-apple`（+ 号按钮）
  3) 对容器 1/2/3 重复 1-2（共 4 容器 × 3 击 = 12 击，`e2e/m1.spec.ts:101-105`）
  4) 点「完成」（按钮，`apps/site/src/views/WorkshopView.vue:635-643`）
  - 另有 GuideBubble 2 步：`先分一件` / `把物品全部分完`（`k-modeling-share.level.json:118-131`），要按 2 次「知道了」/1 次「不用了」才消失（`WorkshopView.vue:435-445`、`apps/site/src/components/GuideBubble.vue:46-62`）→ 真实操作 **15 击**。
- **摩擦点**：
  1. 12 击全是同质 + 号，四盘内容完全相同（`DistributeTool.vue:120-129`；e2e 就是 4×3 循环 `e2e/m1.spec.ts:101-105`）——纯重复劳动，无认知增量。
  2. GuideBubble 两步文案就是内部检查点名（`k-modeling-share.level.json:123,129`），与 prompt 完全重复；且 inline 变体占一整行把工具区往下推（`WorkshopView.vue:577-588`）。
  3. **"每盘数量一样"没有实时提示**：只有在物品全分完（`fill` 检查点，`packages/templates/src/construct/distribution.ts:213-219`）后才可能看到 `distribution-unequal`；只要还有点心没分完，提交被 `missingEvidence` 吞（`packages/templates/src/shared/runtime.ts:186-199` + `WorkshopView.vue:110-111`），孩子只看到"先完成工具步骤：把物品全部分完"。
  4. 容量约束 `maxPerContainer: 4`（json:67-71）在 prompt 里没写，只在工具角标 `{{ containerTotal }} / {{ maxPer }}`（`DistributeTool.vue:103`）——不是错，但属于"该在情境里说一句"的信息。
- **关于"每个容器一次点击循环数量"（任务书重点）**：**不可行**，两条硬证据：
  - 产物是 4×2 的计数矩阵（`distribution.ts:12-21`），"每盘总数 3"不能确定饼干/苹果怎么分；`validateArtifact` 校验的是 `totals[item.id] === item.count` + 等量 + 种类（`distribution.ts:100-110`）——总数一个维度不够。
  - `g13-modeling-pack` 有 `minKinds: 2`（`g13-modeling-pack.level.json:121-126`），若 UI 只让玩家设"每盒 3 件"并由系统按固定顺序填种类，会得到"一盒全是积木"这种**必然失败**的产物（`distribution.ts:92-97`）。
  - 结论：单控件循环 = 把两维答案压成一维，**要么删掉种类维度（玩法变浅），要么让系统替玩家决定种类（直接给答案）**。不建议。
- **建议最少交互序列（5 击）**：
  1) 点 `+` 两次给 1 号盘放 2 饼干（按钮，保留现有控件）
  2) 点 `+` 一次给 1 号盘放 1 苹果
  3) 点「其余盘子照这样分」/「复制到所有盘子」（**新增 1 个按钮**，UI 侧循环 dispatch `construct/place`，不动 runtime/schema）
  4) 点「完成」
  - 去掉 GuideBubble 的 2 击（见 §2-5）。
- **前后对比**：点击 **13→5**（真实 15→5）；evidencePlan 阶段 **2→2**（schema 下限，见 §2-3），但引导点击 **2→0**；输入控件 **2→3**（+ 号、复制、完成），且都在同一个容器上完成同一件事。
- **不可破坏项 / 风险**：
  - `evidencePlan` 至少 2 项（`packages/content/src/schema.ts:179`、`scripts/content-check.ts:208`）→ 不能把 progress 合并成 1 步。
  - e2e `m1.spec.ts:97-109` 的 `dist-plus-*` testid 必须保留（复制按钮是**增量**，旧用例不用改）。
  - 复制会触发 runtime 的"这种物品已经分完了"（`distribution.ts:176-182`）与 `DistributeTool.vue:57-60` 的早退；要把这类拒绝做成**可读反馈**（当前只是工具内一行红字 `DistributeTool.vue:140`），否则孩子不知道是"总数不够"还是"点错了"。
  - 若还想保留"每盘 4 件上限"的教学价值，建议只在"第一盘合法"时允许复制。

### g13-modeling-pack（construct / distribution，工具 construct）
- **观察可得性：A**。`prompt`「把 9 件玩具装进 3 个盒子，每盒 3 件、至少两类。」（`g13-modeling-pack.level.json:9`）已给全部判定；`minKinds: 2` 也在 prompt 里（不是隐藏规则）。
- **当前最少交互序列（10 击）**：9 次 `+`（每盒 block/ball/book 各 1）→ 完成。e2e 只有 autoplay（`e2e/m1.spec.ts:7-15`），真实点击路径由 `actionsFor` 逐件 dispatch（`distribution.ts:116-139`）等价推出：3 盒 × 3 件 = 9 击。
- **摩擦点**：
  1. 9 击同质重复（同 k-share，`DistributeTool.vue:120-129`）。
  2. 第三个约束"至少两类"没有实时提示；`distribution-missing-kind` 只有在 `fill` 达成的提交里才出现（`shared/runtime.ts:186-199`）。
  3. 同上 GuideBubble 2 步（`g13-modeling-pack.level.json:127-140`）。
- **建议序列（5 击）**：盒 1 放积木/球/书各 1（3 击）→「照这样装」复制（1 击）→ 完成（1 击）。
- **前后对比**：点击 **10→5**；阶段 2→2；控件 2→3。
- **不可破坏项 / 风险**：`s-mixed` 这条非对称金解（json:141-220）说明"复制"只是**快捷方式不是唯一解**，按钮文案要写成"照第一个盒子装"，不要写成"正确答案"。

### g79-structure-network（construct / network，工具 construct）
- **观察可得性：A（规则）/ 判定不可观察**。`prompt`（`g79-structure-network.level.json:9`）把 4 个条件全说了；但工具**没有图、没有连通块数**——只有 5 张节点卡 + 7 个候选边按钮 + 3 个计数器（`packages/toolkit-ui/src/NetworkTool.vue:70-106`）。"是否连通"这个唯一难点没有任何可观察入口。
- **当前最少交互序列（5 击，e2e 实测 `e2e/m1.spec.ts:171-181`）**：点 `network-edge-ab`、`bc`、`bd`、`ce`（4 次 toggle 按钮）→ 点「完成」。
- **摩擦点（本关是 6 关里最严重的）**：
  1. **失败反馈 0 可达**：`commit` 检查点 = `validateNetworkArtifact(...).passed`（`packages/templates/src/construct/network-runtime.ts:63-70`）。答错 → 检查点 false → 提交走 `missingEvidence`（`shared/runtime.ts:186-199`）→ 横幅只显示"先完成工具步骤：提交满足预算的路网"（`WorkshopView.vue:110-111`）。结果：json 里写好的 6 条 feedback（`g79-structure-network.level.json:264-295`，含 `network-disconnected` / `network-budget` / `network-too-many` / `network-key`）以及 runtime 里拼好的 conflict 文案（`network-runtime.ts:94-106`）**在正常 UI 里全部不可达**。
  2. 进度条变成答案 oracle：`commit` 亮起 = 已连通且预算内（`network-runtime.ts:68`），玩家可以"看灯通关"。
  3. 没有连通性反馈：`NetworkTool.vue:102-106` 只显示成本/边数/关键连接，缺少"连通块 1/2"。
  4. "关键连接"语义误导：`minKeyEdges=2` 的实现是**数端点**（`packages/templates/src/construct/network.ts:47-55`），任意生成树几乎必然 ≥2（e2e 选的 ab/bc/bd/ce 得 3）。而 prompt 说"连到学校与医院"（json:9），工具提示说"至少连到关键站点 2 次"（`NetworkTool.vue:68`）——三种说法，孩子对不上。
  5. 键控不一致：evidencePlan 的 `require: "network/complete"`（json:139）并不是任何 checkpoint id（真实 id 是 `commit`）；它只作 `actionHint` 展示（`shared/runtime.ts:131-144`），不进判定——属"看起来有门、其实是文案"。
- **建议序列（5 击，点击数不变）**：SVG 画 5 个站点（坐标 json:38-73 已有 x/y）→ 点 4 条边线段（保留 `network-edge-<id>` testid 挂在图元上，e2e `m1.spec.ts:171-181` 不用改）→ 图旁实时显示「连通块 1/1 · 成本 6/9 · 关键站点 2/2」→ 完成。
- **前后对比**：点击 **5→5**；阶段 3→2（把 `commit` 从判分改为"边全选过"这类动作记录，见 §2-2）；输入控件 1 种（边按钮）→ 1 种（图上可点边）；**可解释失败 0→6 条**。
- **不可破坏项 / 风险**：
  - 点击数不可能低于 4：5 个站点连通至少 4 条边，每击只能选一条。
  - `manifest.hasCanvas=false` → 只能在 Vue 面板里画 SVG，**不能**改成 Phaser 画布（`games/forge/src/levels/g79-structure-network.ts:11`；`games/forge/src/forge.test.ts:94-106` 钉死"只有 pattern/rule 有画布"）。SVG 走 CSP 安全，无新依赖。
  - 若改 `minKeyEdges` 语义（端点 → 关键站点必须接入），会动 `network.ts:47-55`、内容 json:121、negativeSample（json:167-210）——建议**先只改文案**，语义留待内容侧决定。

### g79-algorithm-schedule（construct / schedule，工具 construct）
- **观察可得性：A（规则）/ 判定不可观察**。`prompt`（`g79-algorithm-schedule.level.json:9`）给了全部约束；老师/班级/教室已在课次卡上（`packages/toolkit-ui/src/ScheduleTool.vue:73`）——规则可推，但"有没有冲突""满足几条偏好"要玩家自己算，工具不给任何灯。
- **当前最少交互序列（e2e 5 击 / 真实 9 击，e2e 实测 `e2e/m1.spec.ts:192-202`）**：4 次 `schedule-select-l{1..4}` 原生下拉选时段（`ScheduleTool.vue:75-84`；原生下拉真实 = 展开 + 选项 2 次点按）→ 完成。
- **摩擦点**：
  1. **冲突反馈不可达**：`conflictFree` 检查点 = 排满 + 无冲突（`packages/templates/src/construct/schedule-runtime.ts:66-73`）。有冲突 → 提交走 missingEvidence → 横幅"先完成工具步骤：四个课次都排进时段，且没有冲突"，`schedule-conflict` 的 feedback（json:265-270）与 runtime 里那两条 `teacher 冲突：l1 / l3` 结构化 cause（`schedule-runtime.ts:104-108`）**都到不了玩家眼前**。
  2. 唯一的奖励约束（`targetBonus=2`）既不在进度条也不在进度检查点（`schedule-runtime.ts:70-72` 只查 conflict），玩家无计可施；`schedule-bonus` 只有"排满且无冲突但偏好不够"时才可达。
  3. **共享组件写死本关内容**：`ScheduleTool.vue:88`「偏好：数学第一节、物理第二节；至少满足 2 条。」——把 `l1.preferredSlot=s1 / l2.preferredSlot=s2` 硬编码进了 toolkit-ui。换 `v-labels` 变体（时段改叫"上午一/上午二"，json:226-245）后，这句还在说"第一节"，且任何新 schedule 关都会显示别人的偏好。
  4. `maxPerSlot: 2`（允许同段 2 门课，金解 s-prefs 就是 l2/l3 同段 s2）没有任何 UI 提示，学生容易以为"一时段只能一门"。
- **建议序列（5 击）**：3 时段 × 4 课次的课表网格，点格子放课（再点同一格拿回）→ 冲突格实时红框 + 顶部「偏好 1/2」→ 4 击 + 完成 = 5 击（真实 9→5）。
- **前后对比**：点击 **5→5（e2e）/ 9→5（真实）**；阶段 3→2；输入控件 下拉→格子点选（点击后无需再确认）。
- **不可破坏项 / 风险**：
  - `placements` 是 `Map<lesson, slot>`（`schedule-runtime.ts:10-12`），同一课次改时段是覆盖（:32-33）——网格点击天然兼容，不用改 runtime。
  - 现有 e2e 用 `schedule-select-*` + `selectOption`（`m1.spec.ts:196-199`）；换成网格会**必须改这条用例**。稳妥做法：保留 `<select>`，但在每行加"时段格子步进"并在 `change` 同一路径上 dispatch，e2e 不动。
  - `schedule-bonus` 反馈必须留（`content-check.ts:191-195` 要求可达类 ⊆ feedback）。

### g46-algorithm-payment（construct / payment，工具 construct + counter）
- **观察可得性：付款 A / 反例 B**。柜台金额与面额都在面板上（`packages/toolkit-ui/src/PaymentTool.vue:101-120`），"最少枚数"由 `thinkingTarget`+prompt 给出（json:8,433）；反例那半是"贪心不一定最优"的反直觉点——`intro` 只给了"看看贪心会不会失手"（json:7），选哪条前提需要一次点破 → 归 **B**（提示应进失败反馈，不做开场引导）。
- **当前最少交互序列（12 动作，e2e 实测 `e2e/m1.spec.ts:27-48`）**：
  1) 点 `payment-add-3` ×2（按钮，`PaymentTool.vue:108-120`）
  2) 点 `tool-card-toggle-counter-1` 展开第二张卡（按钮，`ToolDock.vue:84-100`；首张卡默认展开 `ToolDock.vue:54`）
  3) `counter-target` 输入 10 + blur（数字输入，`CounterTool.vue:208-217`）
  4) 勾 `counter-denom-1/3/4`（3 次 checkbox，`CounterTool.vue:229-237`）
  5) 点 `counter-test`（按钮，`CounterTool.vue:241-249`）
  6) `counter-premise` 下拉选 `greedy-optimal`（原生 select，`CounterTool.vue:264-273`）
  7) 点 `counter-commit`（按钮，`CounterTool.vue:276-284`）
  8) 点「完成」
- **摩擦点**：
  1. **门禁冗余（任务书问题 4 的直接回答：是，冗余）**：
     - `requiredToolArtifacts: ["payment","counterexample"]`（json:79-82）**在运行时根本没有实现**——`shared/runtime.ts:186-199` 只读 `evidencePlan`；`requiredToolArtifacts` 全仓只出现在内容 schema（`packages/content/src/schema.ts:177`）、content-check 的"有没有工具产得出它"（`scripts/content-check.ts:135-138`）和一条单测（`construct/logic.test.ts:67-70`）。`docs/01` §5.1（`docs/01-产品与玩法设计.md:176-183`）写的第一道门是**文档有、代码没有**。
     - 真正生效的 4 个检查点（json:115-140）**全部被 `validateArtifact` 蕴含**：`tested` 必须 true（`construct/logic.ts:231`）、前提必须对（:261-268）、枚数必须等于最优（:186-194）、`construct` 检查点在 ≥2 枚时点亮（`construct/runtime.ts:234`）。也就是说 4 步门禁对判定零增量，唯一效果是**把 `construct-overpay` / `counter-invalid` 等真实失败类换成"先完成工具步骤"**。
     - 也不是强制"先做反例"：检查点无顺序（`shared/runtime.ts:131-144`），只是"必须两件都做"。
  2. **"测试贪心"是仪式按钮**：对比面板在点它之前就已经显示"贪心 4 枚，最优 3 枚"——`artifactSummaries` 只要 `state.counter` 存在就现场计算（`construct/runtime.ts:86-96` → `logic.ts:109-125`），`CounterTool.vue:32-34,251-252` 直接渲染；而 `testCounter` 只置 `tested=true` + `lastTest`，从不失败（`construct/runtime.ts:136-165`）。它存在的意义只是给 artifact 补一个 `tested` 标记以过 `logic.ts:231`。
  3. **手风琴把第二件工具藏起来**：`ToolDock.vue:54` 默认只开第一张，GuideBubble 第 2 步"测试一个贪心反例"（`level.payment.test`，`packages/i18n/src/messages.ts:68`）指向一个**没展开的面板**。
  4. **静默死路（payment 独有）**：`mark()` 只置 true 从不撤销（`construct/runtime.ts:41-43`），`checkpoints` 直接返回它（:299-301）。玩家 2 枚硬币 → 测试 → 选前提 → 提交反例，然后把硬币全删掉再点完成：4 个检查点仍全 true，`artifact()` 返回 null，`dispatch` 返回 `{ok:false, message:'还差一个可以提交的结构。'}`（`shared/runtime.ts:200-203`），而 `WorkshopView.submit` **只读 verdict、不读 message**（`WorkshopView.vue:234-258`）→ 没有横幅、只有"重试"音效。同类问题在所有 `fail()` 路径上（非法动作被拒）都成立。
  5. 工具卡头像用了 construct 的通用文案「构造块 / 把缺的块放到断开的地方」（`messages.ts:108-109`）——payment 关也是这句，语义错位。
- **建议序列（5-9 动作）**：
  1) 硬币 2 击（保留）
  2) 反例卡：目标金额（数字输入，保留 1 次输入）、面额 3 个 chip（保留 3 击）、失效前提改成**单选 chip**（1 击，替掉下拉的 2 击）
  3) 去掉「测试贪心」：编辑即自动 `counter/test`（`test` 检查点自然满足），实时显示"贪心 4 / 最优 3 / 差 1"
  4) 保留一个「提交反例」（1 击）
  5) 完成
  = 2+1+3+1+1+1 = **9 动作**；若内容侧接受"反例卡预填 target=10、面额{1,3,4}"（这正是金解给的提示量），可再降到 **5 动作**。
- **前后对比**：动作 **12→9**（激进 12→5）；evidencePlan 阶段 **4→2**；输入控件 **5 类→3 类**（按钮/数字输入/chip）；artifact 契约字段 `tested/committed` → 删除。
- **不可破坏项 / 风险**：
  - `evidencePlan` ≥2（`content/schema.ts:179`、`content-check.ts:208`）→ 4→2 合法。
  - `audit-levels.ts:56-61` A1 要求"无工具提交必须**带 missingEvidence**"、:116-120 A1b 要求"空产物必须是结构反馈"；:128-143 A8 要求 autoplay 后所有 evidencePlan 检查点为 true → 改 id 时 `construct/runtime.ts:41-43` 的 mark 点要同步改名。
  - 删 `tested/committed` 会动 `construct/schema.ts:87-97`、`construct/logic.ts:231`、`construct/runtime.ts:190-210`、`construct/logic.test.ts:190-216`、`e2e/m1.spec.ts:35-44`。
  - `level.payment.{construct,test,annotate,commit}` 四个 i18n key（`messages.ts:67-70`、`en.ts:75-78`）可保留作工具内文案，不必删。
  - **test/e2e 兼容**：若保留 `counter-test` 按钮（只自动停用/自动触发），`m1.spec.ts:35-44` 的点击序列可以不动，只在末尾多断言"自动测试已生效"。

### g1012-algorithm-frontier（construct / frontier，工具 construct）
- **观察可得性：A**。`prompt` 给了完整判定（1-10、贪心总代价严格大于最优，`g1012-algorithm-frontier.level.json:9`），`intro` 甚至把做法说了：「贪心会在起点选更便宜的第一段——你能让它最后反而更贵吗？」（json:8）。规则层面没有需要引导的东西。但 UI **没有图**：只有 4 行 `起点 → A 站` + 下拉（`packages/toolkit-ui/src/FrontierTool.vue:64-75`），看不到两条路径、看不到贪心/最优代价。
- **当前最少交互序列（e2e 5 击 / 真实 9 击，e2e 实测 `e2e/m1.spec.ts:204-214`）**：4 次 `frontier-cost-*` 下拉（其中 3 次是在选**默认值**——空操作）→ 完成。
- **摩擦点（本关问题最密集）**：
  1. **开局就是 2/3 步**：`initialState` 用 `edge.default` 填满 costs（`frontier-runtime.ts:21-25`），而 `set` 检查点 = "键数量 == 边数"、`run` = "贪心能到终点"（:64-70）→ 初始即 true。进度条开局「第 3 步 / 共 3 步」（`WorkshopView.vue:558-575`）；而 GuideBubble 要求首步未完成才出现（`WorkshopView.vue:118-124`）→ **本关 GuideBubble 永不出现**。这是"进度条/引导语义"的实锤 bug。
  2. **失败反馈 0 可达**：`counter` 检查点 = `result.counterexample`（`frontier-runtime.ts:69`），答错 → missingEvidence → 横幅"先完成工具步骤：构造出贪心更贵的反例"。4 条 feedback（json:263-284）全部不可达；`frontier-empty/incomplete/range`（`frontier.ts:97-107`）也**无法由 UI 触发**（下拉限 1-10 且默认填满）。
  3. **默认值离答案只差一步**：默认 sa=1, sb=2, at=9, bt=9（json:64-97）→ 贪心 10、最优 10；把 **bt 从 9 改成 1** 即贪心 10 > 最优 3。也就是整关的"思考量"= 一次下拉。
  4. 过期文案：`FrontierTool.vue:63` 说「点"验证"后引擎会跑贪心与最优两条路径」——"验证"按钮早已改名「完成」（`messages.ts:34`），且点完成也不会把两条路径画出来。
  5. 硬编码中文 → 英文界面漏中文（见 §2-7）。
- **建议序列（2 击）**：SVG 四节点图（坐标 json:38-63 已给）→ 边上直接点数字/加减（1 击把 bt 设成 1）→ 回显即实时刷新「贪心 10 / 最优 3」→ 完成 = **2 击**。
- **前后对比**：点击 **5→2（e2e）/ 9→2（真实）**；阶段 **3→1-2**（`set`/`run` 两个假检查点删/改语义）；输入控件 4 个下拉→1 个图上数字按钮。
- **不可破坏项 / 风险**：
  - `audit-levels.ts:56-61` A1 要求无工具提交有 missingEvidence → 初始必须**至少有一个检查点为 false**（现在靠 `counter` 撑着；若把 `set` 改成"玩家改过至少一条边"，`counter` 仍是 false，安全）。
  - 现有 e2e `frontier-cost-*` + `selectOption`（`m1.spec.ts:208-211`）若换成数字按钮会失败 → 需同步改 e2e；若只在图上叠加同 testid 的 `<select>` 则不用改（但不推荐，下拉本身就是摩擦点）。
  - 内容侧建议同时改默认值：把 base 的默认改成对称中值（如全 5，`v-default` json:222-261 已经是这样），否则"一步通关"的观感不会因为 UI 变化而消失。
  - 删两个假检查点不影响 `content:check`（`evidencePlan` ≥2 有真实两项）。

### 1.7 失败反馈可达性逐类核对（本轮最硬的判定增量）

做法：对每关的 `reachableFailureClasses`（verifier 视角）逐条走"玩家在 UI 里怎么才会触发它"，再对照 `validateArtifact` 的实际分支与检查点门禁。结论：**verifier 声明的可达类 ≠ UI 可达类**，缺口全部来自"检查点复用判分器 + 提交先查门禁"。

| 关卡 | 声明（`reachableFailureClasses`） | UI 实际可触发 | 不可达的根因（按类） |
|---|---|---|---|
| k-modeling-share | 5：shortage / overflow / unequal / missing-kind / empty | **1**：unequal | shortage：`fill` 检查点要求"全部物品分完"（`distribution.ts:213-219`），没分完时提交被 missingEvidence 拦（`shared/runtime.ts:186-199`）；overflow：`+` 按钮到 4 件就早退（`DistributeTool.vue:61-64`）；missing-kind：本关 `minKinds: 0`，分支永不进入（`distribution.ts:92-97`）；empty：UI 没有"清空容器"动作 |
| g13-modeling-pack | 5 | **2**：unequal、missing-kind | shortage / overflow / empty 同 k-share |
| g79-structure-network | 6：empty / disconnected / budget / too-many / key / not-general | **0** | empty / disconnected / budget / too-many：`commit` 检查点 = `validateNetworkArtifact().passed`（`network-runtime.ts:63-70`），只要不合法就被 missingEvidence 拦；key：`minKeyEdges=2` 数端点（`network.ts:47-55`），任意生成树都满足，属内容恒真；not-general：`transferVariants(){return []}`（`network-runtime.ts:116-118`），永不产生 |
| g79-algorithm-schedule | 5：empty / incomplete / conflict / bonus / unknown | **1**：bonus | empty / incomplete / conflict：`conflictFree` 检查点要求"排满且无冲突"（`schedule-runtime.ts:66-73`），前面几类必然先撞门禁；unknown：下拉 Option 只有合法 `slot.id`（`ScheduleTool.vue:82-83`），触发不了 |
| g46-algorithm-payment | 6：not-optimal / overpay / not-tested / invalid / reused-main / wrong-premise | **5/6**：除 invalid 外全可达 | invalid：**结构上不可能**——`counter-commit` 在 `lastTest.passed=false` 时禁用（`CounterTool.vue:279`），提交后改参数会把 `tested` 重置为 false（`construct/runtime.ts:118-133`）→ 先撞 not-tested。not-tested 反而可达：做满 4 步后再改目标金额，粘滞检查点仍全 true，提交直接进 validator（`construct/logic.ts:231`） |
| g1012-algorithm-frontier | 4：empty / incomplete / range / not-counter | **0** | empty / incomplete / range：下拉只给 `min..max`（`FrontierTool.vue:73`）且初始即填满（`frontier-runtime.ts:21-25`），UI 造不出空/缺/越界；not-counter：`counter` 检查点 = 答案正确（`frontier-runtime.ts:69`），答错即被 missingEvidence 拦 |

**合计：声明 31 条，UI 可达 9 条（29%）。**（k-share 1 / pack 2 / network 0 / schedule 1 / payment 5 / frontier 0）

> 注：payment 的 `counter-invalid` 只在单测里可达（`construct/logic.test.ts:93-99` 直接调 `validateArtifact`，绕过了 UI 的禁用态）。这提示一类更隐蔽的问题：**内容为某个失败类写了反馈，但 UI 的禁用态让该失败类在物理上不可能出现**——这比"被门禁挡住"更难发现，因为单测和 audit 都直接调 validator。反过来，payment 的 `not-tested` 能到达，全靠"检查点粘滞"（§2-16）：做完 4 步再改参数就绕过了 `test` 门禁——一个 bug 刚好救了另一条反馈。

**为什么门禁没抓住**：`scripts/audit-levels.ts:56-61`（A1）与 `scripts/content-check.ts:191-195`（可达类 ⊆ feedback）都只做**声明层**校验——verifier 说某个类可达，就要求内容为它写 feedback，**没人验证玩家点得到**。所以 31 条反馈文案是"写全了、但用不上"。这条建议作为简化方案的**验收口径**：改完之后，每个声明类要么能由 UI 触发一次，要么从 `reachableFailureClasses` 里删掉（像 `docs/10` §6.1-3 对 `queue-unserved` 的处理那样）。

## 2. 模板级问题（跨关卡共性，按影响排序）

1. **提交先查门禁、后做校验 → 真实失败类被"缺步骤"顶掉（P0，影响 3/5 模式）**
   `packages/templates/src/shared/runtime.ts:186-199`：`submit` 先算 `missingEvidence()`，非空就直接返回 missing-evidence verdict，**根本不调用 `validate()`**。宿主渲染时优先显示 `verdict.failure`，但 missing-evidence verdict 没有 failure（`WorkshopView.vue:98-113`），横幅文案 = `level.failureMissing {step}`（`messages.ts:44`）+ 第一个检查点的 `descriptionKey`（`shared/runtime.ts:131-144`）——也就是**把内部步骤名念给玩家**（"先完成工具步骤：提交满足预算的路网"）。
   这条是 network/schedule/frontier 全部 feedback 不可达的**唯一根因**（见 §1 各自条目），也是 `docs/11 §2 P1-3` 记录的旧 bug（`docs/11-可玩性改造方案.md:48`）**至今未修**（那次只修了"横幅粘住"）。
   **改法（兼容 A1）**：即使检查点缺失也跑一次 `validate()`；若 artifact 非空且判定失败，返回 `{ passed:false, failure, missingEvidence }`（Verdict 两个字段并存），宿主天然优先显示 failure；artifact 为空/无工具时仍只返回 missingEvidence（同时满足 `audit-levels.ts:56-61` A1 与 :116-120 A1b）。
   影响门禁：A1/A1b 不受影响；需更新 `docs/01` §5.1 的顺序。已有单测 `construct/logic.test.ts:134-139` 只断言 missingEvidence>0，仍通过。

2. **检查点直接复用判分器 → 进度条变成答案 oracle（P0，和 1 同源）**
   `network-runtime.ts:63-70` 的 `commit`、`frontier-runtime.ts:68-69` 的 `counter`、`schedule-runtime.ts:70-72` 的 `conflictFree` 都是"validator 通过"。两个后果：① 上一条的反馈吞没；② 进度条会在玩家提交前宣布"已解出"。检查点的语义应回到 docs 的本意——**记录玩家做过的动作/观察**，不承担判分。
   改法：`edges`/`connected`/`conflictFree` 改成"玩家至少 toggle 过 1 条边""玩家点过预览/连线检查"这类动作；判分只留在 `validate()`。
   风险：`content-check.ts:208`、`audit-levels.ts:129-143` A8 要求通过后检查点全 true → 新语义要能被 autoplay 满足（`actionsFor` 里补对应动作或把检查点改为 artifact 派生物）。

3. **`requiredToolArtifacts` 是"文档里的第一道门"，代码里没有（P1）**
   `docs/01-产品与玩法设计.md:176-183` 与 `packages/content/src/schema.ts:177` 都把它当门禁；但只被 `scripts/content-check.ts:135-138` 用来校验"有工具产得出它"。运行时（`shared/runtime.ts`）从不读它。6 关每关都写了一份（例：g46 json:79-82），属于**纯仪式字段**。
   改法：要么在 runtime 里实现（等于给缺产物单独一类 Verdict，需要新门禁豁免），要么在文档里降级为"内容自检字段"。**建议后者**（不要为一个零增量的门加代码）。

4. **construct 全 6 关 `hasCanvas=false` + `runEnabled=false` → 没有"试一下"，唯一反馈是提交（P1）**
   `games/forge/src/levels/*.ts`（k-modeling-share:12-13、payment:15-16、network:11-12、schedule:11-12、frontier:11-12、pack:11-12）；`WorkshopView.vue:625-643` 在 `runEnabled===false` 时隐藏"试一下"。而 `forge.test.ts:108-117` 用测试钉死 `runEnabled === hasCanvas`——**要开放单关的"试运行"，必须同时改这条门禁**。
   收益：把"提交才反馈"变成"试一下就有反馈"，直接缓解问题 1 的效果（但不是根治，仍建议做 1）。

5. **GuideBubble = 把 evidencePlan 的 descriptionKey（内部步骤名）念给玩家（P1）**
   `WorkshopView.vue:80-84` 把 `evidencePlan` 直接当 steps，:118-126 取 `descriptionKey` 作为气泡文案，:577-588 渲染；`GuideBubble.vue:24-65` 每步要一次点击。而这些 descriptionKey 恰恰是"系统内部步骤名"——证据：它们全部进了"中文源串→英文"兜底表（`packages/i18n/src/zh-source.ts:45-46,151-153,166-168,204-206`），不是教学内容。
   对 A 类关（k-share/pack/frontier）**零增量**，只增加 2-4 次关闭点击 + 一行高度；对 frontier 甚至永不出现（见 §1）。`docs/01` §5.4 写的三级提示（`docs/01-产品与玩法设计.md:216-222`）**没有一级是"玩家失败后出现"**——现在的气泡是开场步骤清单。
   建议：删除开场气泡；把"该做什么"合并进工具面板的一行提示（toolkit-ui 已有这类行），把第三级"连续两次同类失败后给示范"做成真正的失败后文案。保留 `guideVisible/advanceGuide` 代码骨架即可，不必删组件。

6. **5 种模式共用一张工具卡的头像文案（P1，语义错位）**
   所有 construct 关的 `tools[].titleKey/descriptionKey` 都是 `tool.construct.*`（`messages.ts:108-109`：构造块 / "把缺的块放到断开的地方"）。于是支付关、课表关、路网关卡头都写着"把缺的块放到断开的地方"。建议按模式给 key（`tool.construct.payment/network/schedule/distribution/frontier`），i18n 补 10 条；`content-check.ts:139-141` 只校验 key 非空，不会红。

7. **模式工具面板硬编码中文 + 硬编码内容（P1，i18n 与内容双泄漏）**
   `i18n-coverage.test.ts:18-30` 只扫 `packages/templates/src/**` 的 24 个文件，**不扫 toolkit-ui**；于是 6 个模式面板把中文直接写在模板里，英文界面必然漏中文：
   `DistributeTool.vue:93,112,123,137`、`NetworkTool.vue:68,80,85,98,103-105`、`ScheduleTool.vue:62,77,82,88`、`PaymentTool.vue:101,102,106,114,125,141,152`、`CounterTool.vue:207,218,222,236,248,252,258,263,271,283,287`、`FrontierTool.vue:63,68,76`。
   其中 `ScheduleTool.vue:88` 还把本关偏好写死（见 §1 schedule），`FrontierTool.vue:63` 引用已不存在的"验证"按钮。
   建议：把这些字符串搬进 `packages/i18n`（20-30 条），并把 toolkit-ui 纳入 i18n-coverage 的扫描范围（新增门禁，先 warning 后 error）。

8. **无"实时约束灯"（P2，但直接决定"观察可得"）**
   `docs/01-产品与玩法设计.md:80` 要求 construct 面板"约束以检查项列表实时显示（覆盖 12/12 ✓，重叠 1 ✗）"。5 种模式现状：distribution 只有每容器 `x/maxPer` + 剩余计数（`DistributeTool.vue:103,136-139`）；network 有三项计数但**没有连通块**（`NetworkTool.vue:102-106`）；schedule 没有任何冲突/偏好灯；frontier 没有任何贪心/最优读数；payment 只有合计（`PaymentTool.vue:124-126`）。这是"B/C 类关卡看着像 C 类"的原因——缺的不是提示流程，是**约束可视化**。
   建议：每个模式补 1-2 个只读计数/灯（连通块、冲突数、偏好数、贪心 vs 最优），不动判定。

9. **同一份参数在 `tools[].config` 与 `levelScript` 各写一遍，且读取方不一致（P2，内容漂移隐患）**
   `PaymentTool.vue:24-27` 读 `spec.config.target/maxCoins/palette`，而 runtime 读 `levelScript`（`construct/runtime.ts:317` → `parseScript(detail.levelScript)`）；`DistributeTool.vue:24` 读 `detail.levelScript`，`ConstructTool.vue:24-25` 读 `spec.config`。`content-check.ts` **不校验两者一致** → 内容作者只改一处就静默分裂（比如柜台显示 6 元、判定按 8 元）。
   建议：content-check 增加"`tools[].config` 与 `levelScript` 关键字段一致"断言（先 warning），或让 UI 一律读 `levelScript`。

10. **`transferVariants()` 恒空 → 2 个变体 + 迁移印章在 construct 永不生效（P2，门禁仪式）**
    `construct/runtime.ts:309-312`（注释：只换表征不改变判定，因此没有迁移门）、`distribution.ts:248-250`、`network-runtime.ts:116-118`、`schedule-runtime.ts:133-135`、`frontier-runtime.ts:121-123` 全部返回 `[]`；而 `content-check.ts:173-188` 仍强制每关 ≥2 个变体、`audit-levels.ts:101-114` A6 仍逐条 applyVariant。**结果是内容写了 12 个变体、玩家一次也遇不到**，完成面板的"变体通行证"在 construct 恒为空（`WorkshopView.vue:719-731`）。
    建议二选一：① 承认 construct 的变体只是"内容自检"，把 `variants` 从"每关必须"降为可选（动 `content/schema.ts:182` 与两个门禁，影响面大）；② 给 representation 类变体一个"换表征重玩同一题"的可玩入口（工作量大）。**本轮不建议改，只标注为"已知仪式"**。

11. **手风琴默认只开第一张 + 多工具关卡（P2）**
    `ToolDock.vue:54` `openIndex=0`；payment 关有 2 件工具（json:12-78），第二件默认折叠（:102-107）。e2e 也必须先 `openTool`（`e2e/shared.ts:31-40`、`m1.spec.ts:35`）。第一张卡内做完后，GuideBubble 的"下一步"不告诉玩家去开第二张卡。
    建议：多工具关卡默认展开"当前证据计划指向的那张卡"，或卡头加未读点。

12. **frontier 初始即满足 2 个检查点（P2，已并入 §1 frontier，此处仅登记为模板级模式）**
    凡是"检查点由初始 state 派生的"（frontier 的 `set`），都会造成假进度；建议给 `set` 类检查点加"玩家动作计数 > 0"的前置。

13. **`dispatch` 返回 `ok:false` 时宿主不上屏（P2）**
    `WorkshopView.vue:234-258` 的 `submit` 只看 `result.verdict`，忽略 `result.ok=false` 的 `message`。所以"删空硬币后再提交"这类路径**静默失败**（见 §1 payment 摩擦点 4）；`run()`（:260-276）同理。
    建议：`submit`/`run` 里 `if (!result.ok)` 时把 message 上屏（横幅或 toast），至少不要"点了没反应"。


14. **`evidencePlan.require` 是纯装饰字段（P2，第三个"看起来有门"的字段）**
    `EvidenceCheckpointSchema` 只要求它非空（`packages/content/src/schema.ts:135-140`）；运行时把它塞进 `actionHint`（`shared/runtime.ts:140`），而**全仓没有任何 UI 渲染 `actionHint`**（grep 只有两处赋值）。更糟的是它经常不是真实 checkpoint id：network 写 `"network/complete"`（json:139）而真实 id 是 `commit`；payment 写 `"construct/place >= 2"`（json:119）而真实 id 是 `construct`。孩子与内容作者都会被它误导。
    建议：要么 content-check 增加"`require` 必须等于该关某个 checkpoint id 或形如 `<tool>/<action> >= n`"的合法表达式"，要么把字段从 schema 删掉（20 关 + 2 个门禁一起改）；**后者更彻底**。

15. **"声明可达"与"UI 可达"脱钩 → 反刷题门禁假绿（P1，指标而非功能）**
    `audit-levels.ts` A4 与 `content-check.ts:191-195` 只验证"verifier 声明的类都有 feedback"，不验证"玩家点得到"。实测 31 条声明里 8 条可达（§1.7），门禁照样全绿。
    建议：把"每个声明类必须有一条 UI 级触发序列（dispatch 序列即可，不必 Playwright）"写进 `audit-levels.ts`；达不到就要求把该类从 `reachableFailureClasses` 移除（先例：`docs/10` §6.1-3 对 `queue-unserved` 的处理）。

16. **payment 的检查点是"粘滞标记"，其余模式是现算（P2，状态机不一致）**
    只有 payment 用 `mark()` 写进 state（`construct/runtime.ts:41-43`、`:299-301`），一旦点亮**永不撤销**；distribution / network / schedule / frontier 的 `checkpoints()` 都是从当前 state 现算。两种语义混用带来一个专属 bug：payment 先做满 4 步、再清空硬币 → 检查点仍全 true、artifact 为 null → `fail()` 返回 `{ok:false}`，宿主不读 message（`WorkshopView.vue:234-258`）→ **点了"完成"没任何反馈**。
    建议：payment 也改成现算（`pieces.length >= 2`、`counter?.tested`、`counter?.premiseId`、`counter?.committed && artifactValid`）；顺带解决"删空后静默"。

## 3. 可直接落地的改动清单

| # | 改动 | 文件 | 影响关卡 | 风险 / 门禁 |
|---|---|---|---|---|
| 1 | submit 改为"先 validate 再报缺步骤"（failure 与 missingEvidence 同时返回） | `packages/templates/src/shared/runtime.ts:186-199` | 全部 6 关 | 低；须保住 `audit-levels.ts:56-61` A1；更新 docs/01 §5.1 |
| 2 | 检查点语义从"判分"改为"动作记录"（network `commit`、frontier `set/run`、schedule `conflictFree`） | `network-runtime.ts:63-70`、`frontier-runtime.ts:64-70`、`schedule-runtime.ts:66-73` | 3 关 | 中；A8/autoplay 会红，需同步 `actionsFor` |
| 3 | distribution 增加"照第一个容器分"按钮（UI 循环 dispatch，不动 runtime） | `packages/toolkit-ui/src/DistributeTool.vue` | k-share、pack | 低；e2e `m1.spec.ts:101-105` 不用改（+ 号保留） |
| 4 | payment 合并"测试贪心/提交反例"为一张反例卡（编辑即 test，前提改单选 chip） | `CounterTool.vue`、`construct/runtime.ts:136-210`、`construct/logic.ts:231` | payment | 中高；动 `logic.test.ts:190-216`、`m1.spec.ts:35-44`、`schema.ts:87-97` |
| 5 | payment evidencePlan 4→2（保留 payment + counter 两阶段） | `g46-algorithm-payment.level.json:115-140`、`construct/runtime.ts:41-43` | payment | 中；`content:check` ≥2 合法；A8 需 autoplay 覆盖新 id |
| 6 | network 画 SVG 图 + 连通块/成本实时显示（testid 保留在图上） | 新增 `NetworkGraph.vue` 或改写 `NetworkTool.vue` | network | 低；`hasCanvas=false` 不能动（`forge.test.ts:94-106`） |
| 7 | schedule 改课表网格（保留 `<select>` 兼容 e2e），冲突格实时红框 + 偏好计数；删 `ScheduleTool.vue:88` 硬编码 | `ScheduleTool.vue` | schedule | 低；e2e 可不动 |
| 8 | frontier 画四节点图 + 边成本直接编辑 + 实时"贪心/最优"；删过期"验证"文案 | `FrontierTool.vue`、`g1012-algorithm-frontier.level.json:101-120` | frontier | 中；`m1.spec.ts:204-214` 需改 testid |
| 9 | 删除开场 GuideBubble（保留组件与 guide 状态机），改为工具面板内一行提示 + 连续失败后的失败文案 | `WorkshopView.vue:118-126,577-588`、6 关 descriptionKey | 全部 | 低；需给"连续两次同类失败"补文案（可先用 `level.retry`） |
| 10 | 工具卡文案按模式区分（新增 `tool.construct.<mode>` key） | `messages.ts:108-109`、`en.ts`、6 关 `tools[].titleKey/descriptionKey` | 全部 | 低；content-check 只校验非空 |
| 11 | 模式面板中文入 i18n + toolkit-ui 纳入 i18n-coverage | 6 个 `.vue` + `messages.ts/en.ts/zh-source.ts` + `i18n-coverage.test.ts:18-30` | 全部 | 中；新增门禁要跑一遍确认 |
| 12 | dispatch 失败消息上屏（`submit`/`run` 里处理 `ok:false`） | `WorkshopView.vue:234-276` | 全部 | 低 |
| 13 | content-check 增加"tools[].config 与 levelScript 关键字段一致" | `scripts/content-check.ts` | payment、distribution | 低；先 warning |
| 14 | `requiredToolArtifacts` 在文档降级为内容自检字段（不写代码） | `docs/01` §5.1 | 全部 | 零 |

| 15 | payment 检查点改现算（去掉 `mark` 粘滞），同步删空后不再静默 | `packages/templates/src/construct/runtime.ts:41-43,299-301` | payment | 中；与 #5 一起做 |
| 16 | `evidencePlan.require` 要么删字段、要么 content-check 校验其与 checkpoint id 一致 | `packages/content/src/schema.ts:135-140`、`scripts/content-check.ts`、20 关 json | 全部 | 中；删字段要动 20 关与 2 个门禁 |
| 17 | audit 增加"声明失败类必须有 UI 触发序列"（dispatch 级） | `scripts/audit-levels.ts` | 全部 | 中；会先红一片，正好量化本次简化收益 |

## 4. 需要 Lead/用户决策的问题

1. **是否接受"复制第一个容器"这类批量输入**？它把 12/9 击压到 4/3 击，但也把"一盘一盘数、每盘都验一遍"的练习密度降下来了。对 K 段（k-modeling-share）我倾向接受；g13 段建议同步把 `minKinds` 的讲解放回失败反馈。
2. **payment 是否允许把 evidencePlan 从 4 步压到 2 步、并从 artifact 契约里删掉 `tested/committed`**？这是本轮唯一会动判定契约（`construct/schema.ts`）的改动，需要确认"反例只要数字对、不需要先按过一次测试按钮"在教学设计上可接受。
3. **是否给 construct 关卡开放"试一下"**？这要改 `forge.test.ts:108-117` 的 `runEnabled === hasCanvas` 断言。
4. **network/schedule 的"关键连接/偏好"语义要不要改**？现在 `minKeyEdges` 数端点、`targetBonus` 数偏好，都不是玩家直觉里的"连到学校与医院"。只改文案成本最低，改语义要动内容与负例。
5. **frontier 的默认值是否重设**？现在"改一个下拉即通关"，无论 UI 怎么改，观感都不会变好。建议 base 默认给对称中值（如 `v-default` 的全 5）。
6. **是否引入"连续两次同类失败后给一句示范"**（`docs/01` §5.4 第三级）来替代开场 GuideBubble？这需要一个"失败计数"状态（`RunSnapshot.runs` 已有最近 10 条，`shared/runtime.ts:146-160`，可直接算）。
7. **变体/迁移印章在 construct 永不生效（§2-10）**：是接受"内容自检"，还是这轮把 6 关的 variants 砍到只留 1 个（需改 schema 与 3 个门禁）？我建议本轮只标注，不砍。

8. **是否接受"进度条不再当对错指示"**（§2-2 的检查点改造）？好处：失败反馈终于能出来；代价：玩家失去"我快对了"的即时确认，必须同时把约束灯（§2-8）做出来补上。两者要打包发布，不能只做一半。
9. **本轮是否就动 `evidencePlan.require`（删字段）**？会波及 20 关内容 JSON 与 content-check / audit 两个门禁，建议拆成独立 PR；若不做，至少让 content-check 校验它和真实 checkpoint id 对得上（低成本，防内容漂移）。

---
*本报告只读源码与既有测试，未运行 dev/build/e2e；行为结论均可由文中的源码路径与既有 e2e 序列复核。*