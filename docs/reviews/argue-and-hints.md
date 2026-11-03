# reviewer-argue-hints 审查报告（argue 模板 3 关 + 全仓提示/文案/引导横向审计）

> 结论先行：argue 三关的"论证"实际上是一道**已给出答案的选择题**——主张、范围都只有一个合法值，证据由工具自动算出并自动挂上，剩余的真实作答只有"依据"二选一（染色/奇偶，且两者都被判对）。当前 10 击里有 6 击（铺骨牌×2、展开卡、采样、挂证据、提交论证）对判定没有增量信息。全仓提示系统的核心问题不是"文案差"，而是 **GuideBubble + 进度条把 evidencePlan 的内部步骤名念给玩家，且不随真实进度推进**；60 条 evidencePlan `descriptionKey`（20 关）里 0 条在讲判定标准，除 argue 的 3 条"统计黑白格或总格数"外全是对按钮的复述（另有 29 条工具描述键）。

## 0.0 定稿补记：两条最硬的结论（补进正文前没写透的）

**(a) argue 关的"证书判定"实际只判了四个集合成员关系，失败类门禁与真实可达性脱节。**
- `artifact()` 在 `committed=false` 时返回 null（`argue/runtime.ts:161-172`），共享运行时因此先走 missingEvidence（`shared/runtime.ts:186-199`）——也就是说**判定器从来没有在"玩家还没宣布提交"的论证上校验过任何内容**；玩家点"提交论证"这个动作本身就是判定的一部分，证书的"可检验"属性被降级为一次按钮确认。
- 真正被校验的只有：claim 是否在 `script.claims` 且等于 impossible（`argue/logic.ts:84-89`）、counts 是否等于 boardCounts（:90-92，但 counts 只能由 probe 复制，UI 不可能填错）、warrant 是否在集合内且该分支证据对得上（:93-111）、scope 是否在集合内（:115-117，而 UI 只提供那一个值）。
- 由此 **6 个失败类里从 UI 可达的只有 3 个**：`argue-claim-unsupported`（选 possible，1 击可达）、`argue-warrant-unsupported`（选 area，1 击可达）、`argue-invariant-false`（只在"先挂证据再换依据"的顺序陷阱下可达，见 §1 摩擦点 8）；`argue-scope-wrong`（scope 只有一个选项）、`argue-evidence-missing`（artifact() 保证了四字段齐全）、`argue-not-general`（迁移门恒过，见 (b)）在 UI 上都不可达。但 `reachableFailureClasses` 返回全部 6 类（`argue/logic.ts:152-154`），content:check 因此强制 20 关每关都为这 6 类写反馈（`content-check.ts:190-203`）、audit A4 用同一函数判定覆盖（`audit-levels.ts:92-99`）——**失败类覆盖门禁在 argue 上测的是"内容里有没有写"，不是"玩家能不能遇到"**。规则建议：content schema 的 reachableFailureClasses 改为"可由 UI 动作空间到达"，或至少为 argue 增加一条"不可达失败类"白名单并在 content:check 打印警告。
- 对简化的意义：既然判定只剩"选对集合成员"，把论证板压成"一次 chip 选择 + 完成"**不会损失任何判定能力**（P1/P2 方案不是"降低难度"，而是把早已不存在的证明深度如实呈现）。

**(b) argue 的迁移门（transfer gate）在数学上恒过，是装饰性门禁。**
- `rotateRemoved` 把去掉的格子旋转 90/180（`argue/engine.ts:37-54`）；对宽高为奇数（5、7）的棋盘，旋转后每格的 `x+y` 奇偶不变（quarter=1 时新旧奇偶差 = height-1-2y，为偶数），因此 **black/white/cells 三个计数在变体下完全不变**，任何"计数型不变量"论证（coloring/parity）在旋转后照样通过。
- 于是 `argue-not-general`（`transferFailureClass`，`argue/logic.ts:163-165`）在现有三关里不可达；迁移门每次都会自动加 `transfer` 印章（`shared/runtime.ts:227-230`），玩家拿到的"迁移"印章并不代表论证迁移过。
- 修法（若本轮不动内容，建议在方案里明确列为"下一轮修"）：变体改为**换棋盘尺寸**（例如 base 5×5/47 格，变体 7×7；或 base 奇数格、变体 8×8 去同色格 62 格），让计数与依据在变体间真的不同，这样"你的依据在变体上是否还成立"才成为真问题；修改会同时影响 `variants`、`solutions`、负例与 A3/A6 审计（`audit-levels.ts:63-74,101-114`）。
- 同一条数学事实也解释了"依据二选一"为什么假：现有三关总格数分别 23/47/47，全是奇数 → black+white 为奇数 → 黑白永远不等，**coloring 与 parity 在任何去角奇数棋盘上都恒真**（`argue/logic.ts:96-111`），玩家选哪个都被判对；而 area 其实同样成立（23/47 不是 2 的倍数），却被 validator 以"还检验不了"拒绝（:112-114）。要让选择真正有区分度，需要**偶数格棋盘 + 黑白不等**（如 8×8 去两个同色格：62 格、30/32），此时只有 coloring 能过；若要出"铺得满"的关，模板还必须先支持 `claim='possible'`（现在写死 impossible，`argue/logic.ts:87-89`，导致所有 argue 关只能出"不可能"题）。

## 0. 覆盖范围

- 模板：`argue`（`packages/templates/src/argue/{schema,engine,logic,runtime,index}.ts`）。
- 关卡：`g1012-structure-invariant`、`g46-data-invariant`、`g46-structure-tiling`（三关的 level JSON、manifest、autoplay/真实点击路径）。
- 外壳与工具：`apps/site/src/views/WorkshopView.vue`、`apps/site/src/components/GuideBubble.vue`、`packages/toolkit-ui/src/{ArgumentBoard,DominoTool,InvariantProbeTool,ToolDock}.vue`。
- 判定链：`packages/game-kit/src/runtime.ts`、`packages/templates/src/shared/runtime.ts`、`scripts/{content-check,audit-levels}.ts`。
- 文案：`packages/i18n/src/{messages,en,zh-source,index.test}.ts`、20 关 `evidencePlan.descriptionKey`、docs/01 §2/§5.1/§5.3/§5.4、docs/11。
- 行为证据：`e2e/m1.spec.ts:74-95`（argue 真实点击）、`e2e/level.spec.ts:36-65`（pattern 真实点击）、`e2e/m1.spec.ts:17-24`（无工具提交被拒）。未运行 dev/build/e2e。

## 1. 逐关审查

### 1.0 全 20 关观察可得性 A/B/C 总表（提示系统的取舍依据）

判定口径（RUBRIC §3）：**A = 规则/答案能从首屏观察直接推出 → 取消提示流程，直接暴露答题面；B = 需一次点破（判定标准反直觉）→ 提示放失败反馈；C = 多约束耦合/需新表征 → 保留最小引导。**

| 关卡 | 模板 | 首屏能看到什么 | 分类 | 提示处置 |
|---|---|---|---|---|
| k-structure-pattern-path | pattern | 带子上已给出重复片段+3 个缺口（画布可点） | **A** | 删 4 步 evidencePlan 引导，画布即答题面 |
| g13-structure-symmetry | pattern | 左半墙完整、缺口位置可见 | **A** | 同上；只保留"对称/重复"一次点破（可放失败反馈） |
| k-algorithm-train | rule | 地图、墙、星、终点全可见；程序只能用现有积木拼 | **A** | 删 2 步引导，保留失败时的撞墙/漏星 hint |
| g13-algorithm-route | rule | 同上，路线两处转弯可见 | **A** | 同上 |
| k-modeling-share | construct/distribution | 4 盘、8 饼干+4 苹果、prompt 已写"每盘 3 件" | **A** | 删 2 步引导（"先分一件"就是按钮名） |
| g13-modeling-pack | construct/distribution | 3 盒、3 类各 3 件、prompt 写"每盒 3 件+至少两类" | **A** | 同上 |
| g79-structure-network | construct/network | 5 站点+候选边+预算/上限全写在 prompt | **A** | 删 3 步引导，保留预算/连通失败反馈 |
| g79-algorithm-schedule | construct/schedule | 4 课次×3 时段、约束（老师/班级/教室/偏好）在 prompt | **B** | 冲突判定是"同一时段三列不能撞"，失败后再点破；开场不念步骤 |
| g46-algorithm-payment | construct/payment+counter | 6 元目标、面额可见；"贪心何时不是最优"不可观察 | **B** | 主任务 A、反例 B：反例部分提示放失败反馈（"先测试一次"已是失败路径） |
| g1012-algorithm-frontier | construct/frontier | 两条路径与边权输入可见，但"如何让贪心更贵"无直接观察 | **B** | 保留"先让第一段有差距"类一次性提示（失败后给） |
| k-data-tally | experiment/tally | 筐里图形可数、采集按钮可点 | **A** | 删 3 步引导；"一次 5 个"已在 intro |
| g13-data-weather | experiment/tally | 14 天记录可采、类别可见 | **A** | 同上 |
| g79-data-sampling | experiment/sampling | 袋子不可见，样本比例/区间需概念 | **B** | "至少两批"是样本量门槛，失败后给；开场只留一句目标 |
| g1012-data-inference | experiment/inference | 两组 50 样本直接给出，区间需工具算 | **B** | "区间是否跨 0"放失败反馈 |
| g1012-modeling-winrate | experiment/duel+knob | 旋钮可见，胜率/区间是模拟结果 | **C** | 保留最小引导（加点→确认→采样→结论的因果关系需示范） |
| g46-modeling-queue | simulate/queue | 顾客到达时间、旋钮可见，等待/成本是模型输出 | **C** | 同上（先改一个旋钮看后果的示范有意义） |
| g79-modeling-dispatch | simulate/queue | 同上，另加两个种子 | **C** | 同上 |
| g1012-structure-invariant | argue | 23 格奇数、黑白可数；prompt 已给"铺不满" | **A** | 删 4 步引导 + 论证板假选择（见下文） |
| g46-data-invariant | argue | 47 格、黑白 23/24 | **A** | 同上 |
| g46-structure-tiling | argue | 47 格、黑白 23/24；prompt 中性 | **A** | 同上（且与上一关重复，见 §1 g46 段） |

合计：**A 12 关 / B 5 关 / C 3 关**。A 类占 60%，它们当前的 2~4 步"观察→提交→补块→运行"引导（evidencePlan）与 GuideBubble 全部属于"规则可观察却强制走提示流程"。

### g1012-structure-invariant（模板 argue，工具 construct/domino + probe/invariant + ArgumentBoard）

**观察可得性：A（观察可得，应取消提示流程、直接暴露答题面）**

- 首屏就能数出：5×5 去两角 = 23 格，1×2 多米诺每块盖 2 格，23 是奇数 → 铺不满。`levelScript.board` 5×5、removed 两角（`packages/content/src/details/g1012-structure-invariant.level.json:53-64`）。
- 主张甚至不用推：prompt 已写"说明它为什么**不能**被 1×2 多米诺铺满"（同文件 :8），等于把 claim 的答案印在题面上。
- 真正的教学内容（"不随摆放改变的量"）是概念，不是观察不出来的判定标准；但 `evidencePlan` 第二步直接把方法说出来（"统计黑白格或总格数"，:90），连"发现不变量"这一步都被跳过。→ 该提示应删，或只在失败后出现。

**当前最少交互序列（e2e 实测口径，`e2e/m1.spec.ts:74-95` + `e2e/shared.ts:36-40`）**

1) [点击格子] `domino-cell-0-1` → 2) [点击格子] `domino-cell-0-2`（满足 attempt 检查点，与判定无关）
3) [点击卡头] 展开"数据采集器"（手风琴默认开构造卡，`ToolDock.vue:54,83-100`）
4) [点击按钮] `invariant-sample`「统计黑白格」（`InvariantProbeTool.vue:38-46`）
5) [下拉] 主张 → 不可能铺满（`ArgumentBoard.vue:104-113`）
6) [下拉] 依据 → 黑白染色（`ArgumentBoard.vue:118-127`）
7) [点击按钮] 把统计数据挂到论证上（`ArgumentBoard.vue:136-144`）
8) [下拉] 适用范围 → 1×2 多米诺铺满（`ArgumentBoard.vue:152-161`）
9) [点击按钮] 提交论证（`ArgumentBoard.vue:165-173`）
10) [点击按钮] 完成（宿主 submit，`WorkshopView.vue:635-643`）

= **7 点击 + 3 下拉 = 10 次交互，4 个阶段**（construct → observe → argue → submit）。开场的 GuideBubble 另需 1~4 击才能关掉（见 §2.3）。

**摩擦点**

1. **attempt 检查点是纯仪式**：`argue/logic.ts:60-126` 的 validateArtifact 从不读 `dominoes`，`artifact()` 只输出 counts+argument（`argue/runtime.ts:161-172`）；但 `checkpoints.attempt` 要求先放一块（`argue/runtime.ts:187-194`），evidencePlan 把它列为第一步（`g1012-structure-invariant.level.json:79-85`，g46 两关同理为 80-86）。放骨牌对"能不能铺满"没有任何判定增量（放 1 块说明不了任何事）。
2. **主张是假选择**：claims 只有 possible/impossible（JSON:66-69），solutions 的 claim 恒为 impossible（JSON:114-117），validator 直接写死 `argument.claim !== 'impossible'` 就失败（`argue/logic.ts:87-89`）。而且 prompt 已经说"不能被铺满"。possible 是纯诱饵。
3. **范围是单选项下拉**：scopes 只有 `domino-tiling`（JSON:75-77），ArgumentBoard 仍然渲染一个只有一个 option 的下拉（`ArgumentBoard.vue:152-161`），玩家点开—选中的动作没有任何信息。
4. **依据二选一但判据不区分**：coloring 与 parity 都能过（`argue/logic.ts:96-111`）；area 是**数学上同样成立**的论证（23 格为奇数），却被 validator 判"这条依据在这一关还检验不了"（`argue/logic.ts:112-114`）。这不是思维陷阱，是命名陷阱。
5. **证据按钮是复制粘贴**：`argue/attachEvidence` 只是把 probe 算出的 counts 抄进 argument（`argue/runtime.ts:135-142`），没有判定增量；`argue/invariant` 的 counts 是确定性计算（`argue/runtime.ts:110-124`），不是采样，不点也不会变。
6. **提交论证与宿主完成重复**：`argue/commit` 只置 `committed=true` 并通过 `commit` 检查点；宿主"完成"才是真判定（`shared/runtime.ts:186-242`）。两个按钮背靠背，玩家第一反应是不知道哪个才是"交答案"。
7. **改任意下拉会静默清掉 committed**：`argue/runtime.ts:125-147` 每个 set* 都置 `committed=false`，UI 按钮文案还写着"论证已提交（可再改）"（`ArgumentBoard.vue:172`）。改完不重新点"提交论证"，宿主提交只会得到"先完成工具步骤：提交论证证书"（`shared/runtime.ts:131-144` + `WorkshopView.vue:110-111`），真实错误被吞。
8. **先挂证据后换依据会坏证书**：attachEvidence 按当时的 warrant 决定写 `{black,white,cells}` 还是 `{cells}`（`argue/runtime.ts:135-142`）；若先挂（warrant=parity）再改成 coloring，validator 检查 `evidence.black !== actual.black` 会失败（`argue/logic.ts:96-100`），提示是"染色证据没有挂上当前图形的黑白格数量"，玩家看不出是自己顺序错了。该失败类 `argue-invariant-false` 的 hint 却是"重新数一遍黑白格"（JSON:248-252），而数字是工具算的、根本数不错。
9. **计数与谱系不看摆放**：`boardCounts` 只看棋盘（`argue/engine.ts:26-35`），和玩家铺了哪些骨牌无关；`summarizeArgument` 也不含 pieces（`argue/logic.ts:41-58`）。
10. **两个 g46 关卡是同一道题**：`g46-data-invariant` 与 `g46-structure-tiling` 的棋盘（7×7 去同色角）、两条解、evidencePlan、feedback 完全相同（diff 实测；差异仅 maxPieces 16 vs 20、probe sampleSizes 47 vs 63、以及一条负例的 counts 24/23 vs 23/24，后者在 tiling 里其实自相矛盾：counts=23/24 而 evidence=24/23，靠 evidence 不一致才判红）；且 tiling 的 thinkingTarget 写"8×8"（JSON:7）但棋盘是 7×7（JSON:53-55），probe 的 sampleSizes=[63]（JSON:42）也与 47 格不符；`InvariantProbeTool` 根本不读 sampleSizes（只 `SampleTool.vue:32`、`SamplingTool.vue:23` 读），属死配置。
11. **en 文案泄漏 8×8 错误**：`thinkingTargetEn` 写 7×7（JSON:280），中文 thinkingTarget 写 8×8（:7）——同一关中英不一致。

**建议序列（两档，供 Lead 选）**

- P1（保留证据门，合并答案面）：1) [只读] 棋盘上直接标注"共 23 格 · 黑 11 / 白 12"（删除 probe 采样这一步；counts 是确定性计算，不是观察行为）→ 2) [点选] 依据一行三选一（`黑白染色 / 奇偶 / 面积`，chip 按钮，不是下拉）→ 3) [点击] 完成（删除"挂证据""提交论证"两个按钮；claim 由依据推出、scope 由脚本唯一值自动填、evidence 在选依据时自动附加）→ **3 击，2 个阶段**。
- P2（按"观察可得"口径的大胆版）：1) [点选] 直接问"哪里能证明铺不满？"三个 chip（`黑白格差 1` / `总格数是奇数` / `面积不够`）→ 2) [点击] 完成 → **2 击，1 个阶段**；提交后在论证板上回显组装好的证书（"黑白染色：黑 11 ≠ 白 12 → 不可能铺满 · 1×2 多米诺铺满"）作为**结果呈现**，而不是输入控件。
- 前后对比：**单击 10 → 2/3，阶段 4 → 1/2，输入控件 6（3 下拉 + 3 按钮）→ 1**。放骨牌可保留为自由沙盒（不设检查点）。

**不可破坏项 / 风险**

- 保留 `argueArtifactSchema` 的 claims/warrants/scopes 选项池（`argue/schema.ts:3-16`）与 `validateArtifact` 的字段校验（content:check:146-171、audit A3/A4 依赖）；
- 迁移门：`transferVariants` 旋转 90/180 后仍要能过（`argue/logic.ts:156-161`）——计数在旋转下不变，合并后仍成立；
- 论证印章 `stamps:['argument']` 与 transfer 印章（`argue/logic.ts:118-125`、`shared/runtime.ts:227-230`）必须保留（徽章/报告消费）；
- audit A2 要求 actionsFor 有 ≥2 种非选择动作（`audit-levels.ts:76-82`），A8 要求 autoplay 通过且 evidencPlan 全满足（:128-143）——若删 attempt 检查点，需确认 actionsFor 仍保留至少两种 action（现为 construct/place + probe/sample + argue/* 共 7 步，安全）；
- e2e `m1.spec.ts:74-95` 需同步改选择器（argue-claim/argue-warrant/argue-attach/argue-scope/argue-commit）；`m1.spec.ts:17-24` 无工具提交仍须给出 missingEvidence（A1 口径）。

### g46-data-invariant（模板 argue，同构）

**观察可得性：A**。7×7 去两个同色角 = 47 格、黑 23 / 白 24，奇偶与染色都能一眼推出；intro 直接说"先铺几块，再找那个不随摆放改变的量"（JSON:8），evidencePlan 直接说"统计黑白格或总格数"（:91）。理由同 g1012，且**与 g46-structure-tiling 为同一道题**（见上）。

**当前最少交互序列**：与 g1012 完全同构（10 次交互：铺 2 格 → 展开 probe → 采样 → 3 下拉 + 挂证据 + 提交论证 → 完成；`BASELINE.md:23` 同口径）。
1) [点击格子] `domino-cell-0-1` → 2) [点击格子] `domino-cell-0-2` → 3) [点击卡头] 展开 probe → 4) [点击] `invariant-sample` → 5) [下拉] 主张=impossible → 6) [下拉] 依据=coloring → 7) [点击] 挂证据 → 8) [下拉] 范围=domino-tiling → 9) [点击] 提交论证 → 10) [点击] 完成。
**建议序列**：同 g1012（3 击/2 阶段；或 2 击/1 阶段）。
**前后对比**：10 → 2/3，阶段 4 → 1/2，控件 6 → 1。
**不可破坏项 / 风险**：同上；另建议把本关与 g46-structure-tiling 合并/差异化（换棋盘让"黑白染色"与"奇偶"只能二选一，才有真正的选择）。若两个都留，至少让其中一关的 board 变成 8×8 且**去掉两个同色格**（62 格、黑 30 / 白 32）——总格数偶数、黑白不等，于是只有 coloring 能过，parity 会被"格子数是偶数"拒掉（`argue/logic.ts:109-111`），"依据选择"才第一次有区分度；注意 7×7 这类奇数棋盘做不到这一点：47 格必然黑白不等（black+white=47 为奇数），coloring 与 parity 恒真，area 在数学上也成立。

**摩擦点**（本关额外）
1. 与 g46-structure-tiling 重复出题，学段/主线不同但答案是同一句，玩家会怀疑"是不是加载错了"（JSON 对照：`g46-data-invariant.level.json:51-105` 与 `g46-structure-tiling.level.json:51-105`）。
2. evidencePlan 的 claim 步骤文案是"把证据挂到论证上"（:97），描述的是**操作**而不是**判断**；玩家从进度条看到的是 4 条操作指令，而不是"要证明什么"。

### g46-structure-tiling（模板 argue，同构）

**观察可得性：A**。棋盘 7×7 去角（JSON:53-65），47 格；prompt 故意中性的"判断它能否被铺满"（:9），比 g1012/g46-data 更适合作为"真的要做判断"的版本——但三关的 solutions/validator 仍然只接受 impossible，且 scope/claim 依旧是假选择。

**当前最少交互序列**：同构，10 次交互 / 4 阶段；e2e 未单独覆盖本关，只有 `m1.spec.ts:5` 的 autoplay 与无工具提交用例。
1) [点击格子] `domino-cell-0-1` → 2) [点击格子] `domino-cell-0-2` → 3) [点击卡头] 展开 probe → 4) [点击] `invariant-sample` → 5) [下拉] 主张=impossible → 6) [下拉] 依据=coloring → 7) [点击] 挂证据 → 8) [下拉] 范围=domino-tiling → 9) [点击] 提交论证 → 10) [点击] 完成（本关无真实点击 e2e，改动后真实交互无回归覆盖，需补一条真实点击用例）。
**建议序列**：同 g1012。
**前后对比**：10 → 2/3，阶段 4 → 1/2，控件 6 → 1。
**不可破坏项 / 风险**：若按上一条"去异色角"改造，levelScript 与 solutions/negativeSamples/负例失败类要同步改（content:check:143-171 会逐条验证解与负例的失败类），迁移门（旋转）不变；audit A3 要求 2 条互不相同的有效解（`audit-levels.ts:63-74`）——去异色角后 coloring 解会失效，只剩 parity 一条，必须补第二条（例如"总格数 47 为奇数"与"黑白差为正"两种表述），否则 A3 红。

**8 问速答（argue 三关共用，回答 RUBRIC §2）**

| # | 问题 | 结论 |
|---|---|---|
| 1 | 观察可得性 | 三关全部 **A**：格子数奇偶 + 黑白计数都在首屏可数；prompt 甚至直接给出 claim（g1012/g46-data），g46-tiling 中性但 47 格仍可直接推出。缺的不是信息，是"怎么把观察写成证书"的示范 |
| 2 | 仪式步骤 | attempt（铺 1 块）、probe/sample（确定性计数）、attachEvidence（复制）、commit（置标记）四步都是门禁驱动，对判定 0 增量；只有 warrant 选择有判断 |
| 3 | 答案输入形态 | 现状：3 下拉 + 3 按钮（挂证据/提交论证/完成）；直接形态：1 次 chip 点选（依据）+ 1 次完成；证据/主张/范围由棋盘与脚本自动派生 |
| 4 | 语义重复与状态机陷阱 | run 对 argue 已关（`runEnabled:false`，`games/forge/src/levels/g1012-structure-invariant.ts:12`），不存在 run/submit 双校验；但"改下拉→committed 静默清零"与"先挂证据后换依据"两个状态机陷阱真实可达（`argue/runtime.ts:125-147`、`argue/logic.ts:96-108`） |
| 5 | 门禁与提示 | evidencePlan 4 个 checkpoint 强制固定顺序（attempt→counts→claim→commit）；GuideBubble 只是把步骤名念一遍（`WorkshopView.vue:117-126`），且含泄题句（JSON:90/91） |
| 6 | 失败反馈 | 结构失败被"缺步骤"吞掉（`shared/runtime.ts:186-204`）；hint 里"重新数一遍黑白格"（JSON:248-252）与实际（工具自动算）不符 |
| 7 | 简化前后对比 | 10 击/4 阶段/6 控件 → 2~3 击/1~2 阶段/1 控件（见各关"前后对比"） |
| 8 | 不可破坏项 | 论证 artifact schema、论证/迁移印章、迁移门、content:check（解/负例/反馈覆盖）、audit A1/A2/A3/A4/A8、manualAudit；可申请调整的是 e2e 选择器与 evidencePlan 的步骤数 |

**模板级共性问题**：三关的 ArgumentBoard 交互模型、假选择、顺序陷阱完全一致，见 §2.1。

## 2. 模板级问题（跨关卡 / 全仓）

### 2.1 论证板：把"证书"当表单填，而不是"一次组装 + 一次提交"

- 实际控件数：**3 个下拉（主张 / 依据 / 适用范围）+ 2 个按钮（挂证据 / 提交论证）**，加上宿主"完成"共 6 个入口（`ArgumentBoard.vue:104-173`、`WorkshopView.vue:635-643`）。任务描述里的"4 次下拉"= 把"证据"那一块（按钮）也算作一个字段；按控件类型准确说是 3 下拉 + 3 按钮。
- 其中只有"依据"携带判断（且 coloring/parity 都对），其余 5 个入口的信息量为 0：claim 被 prompt 与 validator 写死（`argue/logic.ts:87-89`）、scope 只有 1 个选项（JSON:75-77）、evidence 是工具计数复制（`argue/runtime.ts:135-142`）、commit 与宿主的完成重复、attach 与 commit 之间还有"改了就失效"的状态机（`argue/runtime.ts:125-147`）。
- 一次组装方案：论证板 = 一行句子 `[依据 chip] → [自动：黑 11 / 白 12] → [自动：不可能铺满] → [自动：1×2 多米诺]`，加一个"完成"。运行时侧把 `committed` 改成派生状态（claim && warrant && evidence 齐备即真），保留 `argue/commit` action 供 autoplay/audit 使用（幂等），这样 audit A2/A8、content:check、印章、迁移门全部不动。
- 若担心"取消主张选择"削弱教学：可把主张变成"判断题"呈现（一句"这张棋盘能铺满吗？[能] [不能]"两个大按钮），同时把 scope 从控件降级为**只读的一句陈述**（"在 1×2 多米诺铺满的范围内"）。这样仍保留 2 个真实作答点，但都不需要下拉。

### 2.2 证据门与失败反馈：缺步骤吞掉真实错误（argue 可达）

- 判定顺序是"先 missingEvidence 再 validate"（`shared/runtime.ts:186-204`；docs/01 §5.1:176-183 明确写死），宿主只显示第一条缺失（`WorkshopView.vue:110-111`）。
- 因此 argue 里"主张选错但没点提交论证"的提交，得到的是"先完成工具步骤：提交论证证书"，真实的结构错误（claim 错）被隐藏。这与 docs/11:48 记录的 g46 支付关是同一类 bug，argue 仍然可以复现。
- 注意：单独"调整判定顺序"修不了这个坑——`argue/runtime.ts:161-172` 的 `artifact()` 在 `committed=false` 时直接返回 null，所以没点"提交论证"时校验器根本拿不到论证。真正的修法是 §2.1 的"commit 派生"：claim/warrant/evidence 齐备即视为已提交，artifact 立刻可校验，结构错误就能在第一次"完成"时暴露；同时保留 checkpoints 的 missingEvidence 优先（空产物时仍满足 audit A1，`shared/runtime.ts:186-199`）。文案层面：缺失证据应指向**具体控件**（"在'论证板'里选一条依据"），而不是内部检查点名"提交论证证书"。
- 证据门当前只校验 checkpoints，**不校验 `requiredToolArtifacts`**（grep 全仓：只在 `content/schema.ts:177` 与两个测试里出现，`shared/runtime.ts` 未消费）——docs/01 §5.1 的第一道门在运行时不存在，属于文档与实现漂移，可在方案里明确"要么补门，要么改文档"。

### 2.3 GuideBubble：应整体删除，最多降级为"失败 2 次后的单条提示"

现状（`WorkshopView.vue:117-126,434-445,540-550,577-588`；`GuideBubble.vue:24-66`）：

1. 内容 = `evidencePlan[].descriptionKey`（`WorkshopView.vue:80-84`），即**把内部步骤名念给玩家**（"先真的铺一块试试"…）。这既不是环境提示，也不是工具说明，更不是失败示范——与 docs/01 §5.4 的三级提示系统不是一回事。
2. **不跟随真实进度**：`guideVisible` 依赖 `!steps[guideStep].done`（:123），但 `guideStep` 只在点"知道了"时 +1（:435-441）。玩家若先动手完成任务 0，气泡永久消失，后续 3 步永远不出现；若玩家先做了第 2 步再点"知道了"，`steps[1].done=true` 时气泡也会立刻消失。实际效果是"开场一条首步提示"，不是向导。
3. **最后一步按钮语义错误**：最后一步的 next-label 是 `level.guideStart`「开始」（:546），但点击它的动作是 `guideDismissed=true`（:436-439）——**点"开始"= 关闭教程**，没有任何东西被"开始"。
4. **重复**：同一份步骤文本在一屏内出现 3 次——情境条（intro/prompt，:525-532）、进度条（竖条 title + "x/y 步完成" + "第 n 步 / 共 total 步"，:557-575）、GuideBubble（:577-588）。
5. **与文档相反**：docs/01:30 写"只在卡住时出现"，现状是进关即出现；docs/01 §5.4:216-222 的三级提示（环境/工具/示范）、§5.4 末"提示使用记录为证据（scaffold）"、§2:30"设置里可关掉"全部未实现（见 §2.5）。
6. **无测试**：e2e 全仓无 `guide-bubble` 选择器（grep 仅出现在组件自身），删改没有 e2e 门禁兜底，也没有测试保护现状，属于"低风险可删"。

建议：
- **删除开场 GuideBubble 与进度条**（`WorkshopView.vue:557-575,540-550,577-588` 及 `GuideBubble.vue` 两个用例；i18n 的 `level.hintTitle/guideNext/guideSkip/guideStart/progress/progressDone` 同步删除，zh/en 必须成对删——`i18n/src/index.test.ts:8-13` 强制一一对应）。
- 若保留"卡住才提示"，按 docs/01 重做**失败驱动**：同一关连续 2 次同类失败后，在失败横幅里追加一条**解释判定标准**的提示（不是步骤名），并写 `scaffold='tool'` 证据（字段已存在：`game-kit/src/save.ts:18,30`、`progress/src/manager.ts:211-213`，但全仓无生产者）。这必须新增"失败计数"状态（宿主已有 `finalSnapshot.runs` 可取最近失败类，`WorkshopView.vue:193-195` 只用来记 `failureClassesSeen`）。
- 提示文案只在失败后出现，且必须能回答"我的东西哪里不符合哪条判定"；**规则可观察的关卡（A 类）不给提示**。

### 2.4 20 关 evidencePlan 文案审计：60 条 descriptionKey，0 条在讲判定标准

- 口径：20 关 `evidencePlan` 共 **60 条**（每关 2~4 条，`evidencePlan.length` 实测），另有 29 条工具 `descriptionKey`（两者合计 89 个引用，任务描述里的"89"应是合计口径）。
- 4 关用 `level.*` 点号 key（k-structure-pattern-path、g13-algorithm-route、g46-algorithm-payment、g79-modeling-dispatch），**16 关用中文字面量当 key**（走 `zh-source.ts` 兜底翻译）。`i18n/src/index.test.ts:55-57,67-75` 要求每条 descriptionKey 在英文下可解析——所以**删/改 evidencePlan 文案会碰 i18n 覆盖测试**，必须同步更新 `zh-source.ts`（实测 314 条）或换成点号 key。
- 分类（60 条逐条看过）：

| 类别 | 条数 | 例子（file:line） | 判断 |
|---|---|---|---|
| **泄题：说出方法** | 3 | "统计黑白格或总格数"：`g1012-structure-invariant.level.json:90`、`g46-data-invariant.level.json:91`、`g46-structure-tiling.level.json:91` | 直接给不变量方法，正是本关 thinkingTarget（"用一个不随操作改变的量…"，`g1012…json:278`）；应删 |
| **重述按钮动作** | 57 | argue "先真的铺一块试试"/"把证据挂到论证上"/"提交论证证书"（`:84/96/102`）；"先把整筐采完（一次 5 个）"/"把每一类的数量记进统计条"/"选'最多'或'最少'，提交结论"（`k-data-tally.level.json:116,122,128`）；"拼出程序并提交"/"让程序跑一次"（`k-algorithm-train.level.json:59,65`）；"给四条边都设好代价"/"让贪心走到终点"/"构造出贪心更贵的反例"（`g1012-algorithm-frontier.level.json:106,112,118`）；"先锁定一组参数"/"运行一次…"/"打开排队指标对照"（`g46-modeling-queue.level.json:125,131,137`） | 玩家点按钮就知道自己在干什么；作为提示零增量 |
| **判定标准** | 0 | —— | 真正的判定标准在 `feedback.*.messageKey/hintKey` 与 `retry`（如 `g1012…json:237-267`），那才是提示该待的地方 |

- 逐关条数（20 关，2~4 条/关）：2 条 = g13-algorithm-route、g13-modeling-pack、k-algorithm-train、k-modeling-share、g79-data-sampling、g1012-data-inference；3 条 = k-data-tally、g13-data-weather、g79-structure-network、g79-algorithm-schedule、g1012-algorithm-frontier、g1012-modeling-winrate、g46-modeling-queue、g79-modeling-dispatch；4 条 = k-structure-pattern-path、g13-structure-symmetry、g46-algorithm-payment、g1012-structure-invariant、g46-data-invariant、g46-structure-tiling。
- 首屏信息对照（A 类关卡的"可观察"证据，intro/prompt 行号）：全部 20 关的 `intro` 在 JSON 第 7~8 行、`prompt` 紧随其后一行（实测：g1012-structure-invariant 为 7/8，其余为 8/9；g46-algorithm-payment、k-structure-pattern-path 为 7/8）。A 类 12 关的首屏已经同时给出【目标 + 缺什么 + 怎么操作】，evidencePlan 的步骤名是第四遍重复。
- 结论：`descriptionKey` 这个字段现在的用途是"给玩家看内部步骤名"，3 个消费点（进度条 title、GuideBubble、missingEvidence 文案 `shared/runtime.ts:131-144`）没有一个需要它。建议**保留字段（schema 不动）但 UI 不再展示**；若要展示，改为"判定标准摘要"并在失败后出现。
- 另外两个永远不上屏的字段：`evidencePlan[].require`（只进 `actionHint`，无渲染，`shared/runtime.ts:140`/`game-kit/runtime.ts:151`）与 `feedback[].focus`（claim/warrant/evidence，UI 只读 messageKey/hintKey，`WorkshopView.vue:105-108`）。它们是 schema 门禁（`content/schema.ts:129-140`）要求的死元数据——可保留，但别指望它们产生提示。

### 2.5 全仓提示文案分类表（i18n 口径）

以 `messages.ts` 224 个 key（`en.ts` 一一对应）为底，按**用途**分类：

| 类别 | 数量 | 代表 key（file:line） | 处置 |
|---|---|---|---|
| **教学必需**：解释判定标准/失败原因 | 45（`*.message`/`*.hint`） | `level.rule.wall.hint`（`messages.ts:89`）、`level.pattern.cycleWrong.hint`（:136）、`level.payment.notOptimal.hint`（:56）、`level.g79.sim.wait.hint`（:78） | **保留**，且只在失败后出现（现在已是失败横幅路径，`WorkshopView.vue:98-113`） |
| 工具说明/控件标签 | 23 + 12 | `pattern.tokenHint`（:112）、`pattern.transform.*`（:117-121）、`construct.*`（:122-126）、`tool.*.desc`（:46-53,107,109） | 保留控件标签；工具说明只在工具面板内出现一次（现在卡头和面板各一份，重复） |
| **步骤复述**（内部步骤名） | 13 + 4 引导/进度 | `level.pattern.observe/hypothesis/repair/run`（:127-130）、`level.rule.build/run`（:84-85）、`level.payment.*`（:67-70）、`level.g79.sim.*`（:81-83）、`level.progress`（:187）、`level.progressDone`（:188）、`level.hintTitle/guideSkip/guideNext/guideStart`（:189-192） | **删除**（或仅保留为进度条内部状态，不上屏） |
| **噪音/死键** | 18 | `level.passed`（:38）、`level.running`（:37）、`level.workshop`（:42）、`level.canvas`（:43）、`level.evidence`（:45）、`level.artifactMissing`（:98）、`complete.body`（:161）、`common.retry/close/yes/no`（:164-169）、`level.next`（:186）、`badges.sticker`（:200）、`forge.thinking/tools`（:27,30）、`nav.about`（:7）、`probe.sample`（:102）、`construct.place`（:124） | **删除**（zh/en 成对删，`index.test.ts:8-13` 会拦单边删除） |

- 说明：`band.*`、`thread.*`、`pattern.transform.*`、`stamp.*` 是动态拼接（`WorkshopView.vue:58-59`、`ForgeView.vue:45,54`、`PatternTool.vue:28,47`、`JournalView.vue:83`），**不算死键**；`failcat.*` 有字面引用（`JournalView.vue:33-47`）。
- `zh-source.ts` 314 条"中文句子当 key"的兜底表是过渡态技术债（`zh-source.ts:1-16` 自己写了原因）：argue 的 12 条 feedback 文案就在其中（:106-121）；删步骤文案时必须同步删表项，否则 `index.test.ts:67-75` 的"每个 key 可解析"会残留未被引用的死表项（当前测试只检查被引用 key，不检查多余表项，但会扩大英文包体积）。
- 文案层面的"泄题"只有 argue 的 3 条 descriptionKey 和 3 关的 intro/retry（intro "再找一个不随摆放改变的量"、retry "数一数黑白格或总格数"），**判定标准类文案没有泄题**。

### 2.6 docs/01 §5.4 三级提示系统落地缺口

| 规格（docs/01） | 现状 | 证据 |
|---|---|---|
| 环境提示：自动 3 秒高亮可操作区、工具呼吸、首次进入 10 秒演示（:218） | **未实现**（apps/site/src 与 packages/toolkit-ui/src 无 animate/pulse/呼吸/计时逻辑；hit 仅来自 canvas-kit 的 phaser 压缩产物） | grep `animate-|highlight|呼吸|pulse`（限定 `apps/site/src`、`packages/toolkit-ui/src`）= 0 |
| 工具提示：玩家点"墨点"解释工具、不泄题（:219） | **未实现**：墨点是自动出现、内容是 evidencePlan 步骤名、无工具说明、无"点墨点"入口 | `GuideBubble.vue:24-66`、`WorkshopView.vue:540-550` |
| 示范提示：连续两次同类失败后给不同情境微示范（:220） | **未实现**：失败横幅只有内容 feedback（message+hint），无失败计数、无迁移示范 | `WorkshopView.vue:98-113`；无连续失败计数代码 |
| 提示使用记录为证据（scaffold）（:222、:246） | **未实现**：`Scaffold` 类型与 `manager.ts` 接受逻辑在，但全仓无生产者 | `game-kit/src/save.ts:18,30`、`progress/src/manager.ts:211-213` |
| 设置里可关闭自动提示（:30、:222） | **未实现**：设置只有静音与语言 | `apps/site/src/stores/settings.ts:9-19` |
| 动态难度按证据调提示/变体（:237-246） | **未实现** | 无变体切换代码 |

另：docs/01:185-190 要求缺失证据"变成世界里的动作"（缺观察→向导说话、缺运行→按钮呼吸），现状是宿主用 `level.failureMissing` 把步骤名拼成一句话（`WorkshopView.vue:111`）——这是"清单式报错"，与设计意图相反。

### 2.7 提示该不该下沉到失败反馈：判定标准类文案清单

"下沉"= 从开场/常驻位置移到`failure-banner`（`WorkshopView.vue:591-599`）。值得下沉且**已经**在失败路径的：20 关 feedback 的 45 条 message/hint（见 §2.5 第一行）。值得下沉但**还没**在失败路径、目前以 intro/retry/descriptionKey 形式常驻的（按收益排序）：

| 现位置 | 文案（示例） | 建议去向 |
|---|---|---|
| evidencePlan.descriptionKey（60 条） | "统计黑白格或总格数"（3 关） | 删除；失败 2 次后再以"试试数一数黑格与白格"出现 |
| intro（20 条，JSON:7-8） | "先铺几块，再找那个不随摆放改变的量" | A 类关删除该句（等于给方法）；B/C 类保留 |
| retry（20 条，JSON:10-11） | "数一数黑白格或总格数，看看每次铺一块这个量会怎么变" | 已在失败横幅兜底路径使用（`WorkshopView.vue:108` 当 feedback 缺失时）；保留但要求立项时只给一条 |
| tool.*.desc（5 条，常驻卡头） | "把缺的块放到断开的地方" | 删除卡头那行，只留工具面板内说明；按 mode 拆 key（§3 #7） |

不应下沉（保留常驻）：操作型标签（`pattern.tokenHint`、`construct.empty`、`pattern.transform.*`）——它们是控件说明，不是答案。

## 3. 可直接落地的改动清单

| # | 改动 | 文件 | 影响关卡 | 风险 / 门禁影响 |
|---|---|---|---|---|
| 1 | 删除 GuideBubble 两个渲染点 + 进度条；`advanceGuide/dismissGuide/guideStep/guideDismissed` 及其 replay 重置一并删 | `WorkshopView.vue:52-53,117-126,418-419,434-445,540-550,557-575,577-588`；删 `GuideBubble.vue` | 20 关全部 | 无 e2e 依赖；删 6 个 i18n key（zh/en 成对，`index.test.ts:8-13`）；`level-progress`/`level-step-*` testid 无 e2e 引用 |
| 2 | suggest：论证板合并为"一行组装 + 完成"；claim/scope 改只读或自动派生，evidence 自动附加；`committed` 改派生 | `ArgumentBoard.vue:96-175`、`argue/runtime.ts:125-155,187-194`、`WorkshopView.vue:610-617` | argue 3 关 | 保留 `argueArtifactSchema` 与 `argue/commit` action（幂等）→ content:check/audit A2/A3/A4/A8 不动；e2e `m1.spec.ts:74-95` 需改选择器 |
| 3 | 删除 argue 的 attempt 检查点（保留铺骨牌自由沙盒） | 3 个 level JSON：g1012 为 :79-85，g46 两关为 :80-86 | argue 3 关 | evidencePlan 4→3 ≥2（`content-check.ts:207-215`、`audit-levels.ts:128-143`）；`shared/runtime.ts` 自动适配；e2e 步骤可保留（构造动作仍被接受） |
| 4 | 失败反馈优先显示结构错误，缺步骤文案改为指向具体控件 | `shared/runtime.ts:186-204`、`WorkshopView.vue:105-113` | 20 关 | A1（空产物→missingEvidence）必须保留；`level.failureMissing`→改用"在哪点哪个按钮" |
| 5 | 删除 18 个死 i18n key；删除 `level.progress*`/`hintTitle/guide*` | `messages.ts`、`en.ts` | 全仓 | `index.test.ts:8-13` 要求成对删；无内容引用 |
| 6 | argue 三关内容去重：g46-structure-tiling 与 g46-data-invariant 至少一关换棋盘（建议 8×8 去两个同色格（62 格、黑 30/白 32），或按 tiling 的 thinkingTarget 改成 8×8 并让变体换尺寸）；修 thinkingTarget 8×8 / sampleSizes 63 的漂移 | `g46-structure-tiling.level.json:7,41-45,53-55`（及 solutions/negatives） | 2 关 | content:check:143-171（解/负例/迁移）、audit A3（2 条不同解）、i18n 文案覆盖 |
| 7 | 工具卡头 desc 与面板内说明二选一；`tool.construct.desc` 按 mode 拆分（现在 7 个 mode 共用"把缺的块放到断开的地方"，对 payment/network/schedule/frontier 均不准） | `ToolDock.vue:92-95`、`messages.ts:109` | 10 关（construct 系） | content 里 titleKey/descriptionKey 是共享 key；拆 key 需改 20 个 JSON 对应字段与 i18n |
| 8 | （可选，较大）实现 docs/01 §5.4 的失败驱动提示：连续 2 次同类失败→失败横幅追加判定标准提示，写 `scaffold:'tool'` 证据 | `WorkshopView.vue:98-113`、`shared/runtime.ts`、`progress` | 全仓 | 需要新增失败计数状态；不动 schema；报告/证据消费方已支持 scaffold |

## 4. 需要 Lead/用户决策的问题

1. **argue 三关要不要"降级为判断题"**：删除主张/范围下拉、证据自动附加、只留"依据"一次选择（3 击/2 阶段），还是更进一步只留一个"为什么铺不满"的选择（2 击/1 阶段）？后者最符合"直接填答案"，但"证书"这个产品概念会被削弱为结果展示。
2. **两条 g46 不变量关是否合并**：它们是同一道题（棋盘/解/evidencePlan/feedback 全同，差异只有 maxPieces、sampleSizes 与一条负例，见 §1 摩擦点 10）。合并会影响星图（少一关）、徽章（boundary-explorer 出现两次）与报告统计；不合并则应换棋盘，让"依据"真正有区分度（8×8 去两个同色格：只有 coloring 能过；7×7 这类奇数棋盘做不到，见 §0.0(b)）。
3. **是否本轮就动 schema 层**：删除 `evidencePlan.descriptionKey` 的 UI 用途可以零 schema 改动；但若要让 guide/进度条真正消失，需要接受"evidencePlan 只作为判定门，不再当提示源"的产品语义变化。
4. **GuideBubble 删除 vs 失败驱动重做**：删除是零风险（无 e2e、无测试）；重做要按 docs/01 §5.4 的"连续两次失败 + 微示范 + scaffold 证据"，工作量大于本轮"只出方案"的范围。
5. **"提示记录为证据"是否要在本轮补**：scaffold 字段与存档/报告链路都在，只差生产者；若不补，docs/01 §5.4 与 §6.1 的"提示后仍能迁移"评价口径永远无法运行。
