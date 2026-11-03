# reviewer-pattern-rule 审查报告（pattern + rule 模板，4 关）

> 结论先行：**pattern 与 rule 两条线的"仪式"都不在玩法里，而在证据门与重复按钮里。**
> 4 关的答案都能靠首屏观察直接得出（3 关 A、1 关 A+一处 B 洞见），但玩家被迫按
> "观察凑数 → 声明规律 → 摆块 → 试一下 → 完成"或"拼程序 → 提交程序 → 试一下 → 完成"走完，
> 多出 2~11 次点击、1~3 个阶段；其中"观察 ≥2 格"**零信息增量**，"运行"与"完成"**同一份判定**。
> 最大胆的简化：pattern 关删掉"规律声明 + 观察 + 运行"三段，缺口点击即填、一键完成（15→5 击）；
> g13 补墙甚至不需要声明规律（"重复"和"镜像"两种读法本来都判定通过）。

## 0. 覆盖范围

- 模板：`pattern`、`rule`（含两模板共用的 `shared/runtime.ts` 与 `verifiers.ts`）
- 关卡：`k-structure-pattern-path`（pattern+construct）、`g13-structure-symmetry`（pattern+construct）、
  `k-algorithm-train`（rule）、`g13-algorithm-route`（rule）
- 读过的文件（全部只读）：
  - 模板：`packages/templates/src/pattern/{runtime,scene,logic,schema,index}.ts`、
    `packages/templates/src/rule/{runtime,scene,engine,logic,schema}.ts`、
    `packages/templates/src/{shared/runtime.ts,verifiers.ts,layout.ts,i18n-coverage.test.ts}`
  - 工具：`packages/toolkit/src/pattern/index.ts`、
    `packages/toolkit-ui/src/{PatternTool,ConstructTool,RuleTool,ToolDock}.vue`
  - 内容：4 个 `packages/content/src/details/*.level.json`、`packages/content/src/schema.ts`、`ids.ts`
  - 外壳：`apps/site/src/views/WorkshopView.vue`、`apps/site/src/components/GuideBubble.vue`
  - 门禁：`scripts/content-check.ts`、`scripts/audit-levels.ts`、`games/forge/src/forge.test.ts`、
    `packages/templates/src/{pattern/logic.test.ts,rule/logic.test.ts}`
  - 实测口径：`e2e/level.spec.ts`、`e2e/m1.spec.ts`、`e2e/shared.ts`（真实点击序列）
  - 规格：`docs/01`§3.1/§3.2/§5.1/§5.4/§5.5、`docs/03`§4.1/§5.1/§5.3、`docs/10`、`docs/11`
- 没有运行任何 dev/build/e2e/vitest；行为证据全部来自源码与既有 e2e/单测。

## 1. 逐关审查

### k-structure-pattern-path（模板 pattern，工具 pattern + construct）

**观察可得性：A（观察可得）**
- 带子 12 格，可见 9 格 = `A B B A B B ? ? ? A B B`（`packages/content/src/details/k-structure-pattern-path.level.json:78-91`），
  第 7/8/9 格（1-based）是三个空心虚线格（`packages/templates/src/pattern/scene.ts:379-391` 用虚线框画空格）。
- 首屏就能看出 `ABB` 重复 4 遍，缺口答案 `A B B` 肉眼可推。三种合法说法（ABB/原样、BBA/错一位、BBA/镜像）
  **填出的答案完全相同**，所以"声明哪条规律"对判定没有分叉。
- 结论：不该有引导流程，应直接暴露答题面。

**当前最少交互序列（e2e 实测，`e2e/level.spec.ts:36-65`）**

| # | 动作 | 控件 |
|---|---|---|
| 1-2 | 观察第 1、2 格 | 数字按钮 `pattern-inspect-0/1`（或画布点格） |
| 3-5 | 拼 `A` `B` `B` | 字母按钮 `pattern-token-A/B` ×3 |
| 6 | "用这条规律" | 按钮 `pattern-commit`（内部再发 setCycle+commit 两个动作，`PatternTool.vue:80-101`） |
| 7 | 展开第二张工具卡 | 手风琴卡头 `tool-card-toggle-construct`（`ToolDock.vue:54,103-107`） |
| 8-13 | 三格各"选槽 + 放块" = 2 击/格 | 槽按钮 `construct-slot-6/7/8` + 色板 `construct-place-A/B`（`ConstructTool.vue:41-43,58-72`） |
| 14 | "试一下" | 宿主按钮 `level-run` |
| 15 | "完成" | 宿主按钮 `level-submit` |

→ **15 击 / 4 个证据阶段**（observe → hypothesis → repair → run，`k-...level.json:108-133`）。
若玩家跟着引导气泡走，再加最多 4 击"知道了"（`WorkshopView.vue:435-441`）= 19 击。

**摩擦点**
1. **观察没有任何产出**：`pattern/inspect` 只做"加环 + 计数"（`pattern/runtime.ts:189-201`、
   `pattern/scene.ts:433-441`），面板上只显示"已经观察 N 格"（`PatternTool.vue:125`）；
   而面板文案承诺的"看看它是第几位、第几个单元"（`PatternTool.vue:137`，原始设计在 `docs/01:47`）
   **全仓没有实现**。→ observe 检查点（`pattern/runtime.ts:197` 硬编码 ≥2 格）是纯仪式。
2. **12 个数字按钮重复画布**：`cells:[0..11]` 让 `PatternTool.vue:139-149` 渲染 12 个 32×36 的数字按钮，
   与画布点击面等价（`pattern/scene.ts:182-190`），且小于 `docs/01`§9 的 44px 触控基线。
3. **"试一下"和"完成"是同一份判定**：`pattern/runtime.ts:316` 与 `:353` 都调 `validateArtifact(script, baseVariant, artifact)`；
   submit 分支还自己 `addRun()`（`:364`），所以"完成"同样会画走路小人（`pattern/scene.ts:275`）。
   run 唯一独占的效果是解锁 `checkpoints.run`（`:320`），而 submit 先查缺证据（`:336-350`）——
   **真实错误会被"缺步骤"横幅吞掉**：放错块但没点"试一下"，看到的是"先完成工具步骤：运行一次"
   （`WorkshopView.vue:110-112`），而不是"补的块和你说的规律不一致"。
4. **transform 下拉给出必错选项**：`PatternTool.vue:25-29` 把 5 种变换全部铺进下拉，本关只允许
   `none/mirror/shift`（`k-...level.json:100-104`）；选 `rotate/reflect` 后在 commit 处必失败
   （`pattern/runtime.ts:252-259`）。根因是 pattern 工具配置 schema 里根本没有 allowedTransforms
   （`packages/content/src/schema.ts:19-23`），UI 无从过滤。
5. **答案输入两步 + 工具卡割裂**：构造工具是第 2 张卡（默认只展开第 1 张，`ToolDock.vue:54`），
   每格要"先点槽、再点色板"（`ConstructTool.vue:96-112,118-130`）；而画布已有最近格命中
   （`pattern/scene.ts:162-180`）却不能用来填答案。
6. **evidencePlan 的 require 是装饰**：关卡写 `"construct/commit >= 1"`（`k-...level.json:123`），
   但 `construct/commit` 这个动作在 `ActionPayloadMap` 里根本不存在（`packages/game-kit/src/runtime.ts:87-128`）；
   真实门槛是硬编码 `placements.size >= brokenIndices.length`（`pattern/runtime.ts:289`）。
   `content:check` 只校验 require 非空（`scripts/content-check.ts:210-215`），漂移无人发现。

**建议序列**
1) 画布点缺口 6 → 循环到 A（1 击，指针命中已有）
2) 点缺口 7 → 到 B（1-2 击）
3) 点缺口 8 → 到 B（1-2 击）
4) 候选规律条一键确认（本关合法说法填出的答案一致，可默认选中 → 0-1 击）
5) "完成"（1 击）
→ **5-6 击 / 1-2 个阶段**（去掉 observe、去掉 run，see §3 落地清单）。

**前后对比**：点击 **15 → 5~6**；阶段 **4 → 1~2**；输入控件 12 数字按钮+2 字母+1 下拉+2 槽按钮+2 色板+手风琴
**→ 1 条候选规律 + 2 个图标色板**（约 6 → 3）。

**不可破坏项 / 风险**
- `audit-levels` A3：本关只有**一种**修复答案（`A B B`），两条黄金解靠"规律说法不同"才互不相同
  （`k-...level.json:134-190`）→ **不能完全删掉规律产物**，否则有效解只剩 1 条，A3 直接红
  （`scripts/audit-levels.ts:63-74`）。建议保留"一键候选规律"作为第二产物。
- `audit-levels` A1：无工具提交必须给出 missingEvidence（`:57-61`）→ 至少保留 1 个提交前检查点（repair/规律）。
- `e2e/level.spec.ts:40-48` 依赖 `pattern-inspect-0`、`pattern-token-*`、`pattern-commit` 三个 testid；
  `e2e/level.spec.ts:77-78` 还断言"已经观察 1 格"。删按钮必须同步改这两个用例。
- `forge.test.ts:108-117` 硬断言 `runEnabled === hasCanvas` → 想隐藏"试一下"必须同时改这条断言。

### g13-structure-symmetry（模板 pattern，工具 pattern + construct）

**观察可得性：A（观察可得），且比 K 关更彻底**
- 6 格墙：可见 `A B C` + 三个缺口（`g13-structure-symmetry.level.json:79-88`）。
- 关键事实：**"补成镜像"（CBA）和"继续重复"（ABC）都判定通过**——因为允许
  `allowedPeriods:[3,6]` + `allowedTransforms:['none','reflect']`（`:90-99`），
  `ABCABC/周期6/原样` 这条规则经过 `validatePattern` 的可见格检查与 repair 比对同样 pass
  （`packages/toolkit/src/pattern/index.ts:87-137`）。但关卡 prompt 写的是"判断它是重复还是镜像"（`:9`），
  实际"重复"也被接受，题干与判定不一致。
- 已用算术复现（照抄 `packages/toolkit/src/pattern/index.ts:50-137` 的 tokenAt/validatePattern）枚举本关全部合法规则：
  通过组合只有 6 条，但**填法只有两种** —— `ABC`（重复读法）与 `CBA`（镜像读法）。
  所以本关天然有 2 条不同答案，可以只靠"填格"满足 A3 多解门。
- 结论：孩子只要把右半墙补齐即算答对，"先声明规则"是纯仪式。

**当前最少交互序列（`e2e/m1.spec.ts:126-147`）**：2 按观察 + 3 按字母 + 1 次下拉反射 + 1 次提交规律
+ 1 次展开构造卡 + 3×(选槽+放块) + 试一下 + 完成 = **16 击 / 4 阶段**。

**摩擦点**
1. 与 K 关完全同构：观察零产出（`pattern/runtime.ts:189-201`）、run/submit 同判定（`:316`/`:353`）、
   下拉含非法项（`PatternTool.vue:25-29` vs `g13 JSON:94-98`）、答案两步（`ConstructTool.vue:58-72`）。
2. **题干与判定不一致**：prompt 要求"判断重复还是镜像"（`g13 JSON:9`），但两种都对；
   `pattern-mismatch` 的提示文案"按镜像规则，第 4 格应该和第 3 格一样"（`g13 JSON:329-333`）
   只在玩家已选镜像时才对。
3. **evidencePlan 直接写中文**（`g13 JSON:105,113,118,124`），而 K 关用的是 i18n key
   （`k JSON:113,116,122,128`）。GuideBubble 与进度条把它们当 key 查表（`WorkshopView.vue:80-84,126`），
   英文界面会原样漏出中文（`packages/i18n/src/index.ts:48-51`）；`content:check` 不检查这个字段
   （`scripts/content-check.ts:210-215`）。
4. **换表征/平移变体是空转**：`v-relabel` 改 `scenario.symbols`、`v-shift` 改 `startIndex`
   （`g13 JSON:289-311`），但 `toWorld` 只取 `length/visible/allowedPeriods/allowedTransforms`
   （`packages/templates/src/pattern/logic.ts:139-146`），两个字段对判定**零影响**；
   且 pattern 模板根本没有迁移门（`packages/templates/src/verifiers.ts:34-43` 无 `transferVariants`），
   `docs/01:58` 与 `docs/03:119` 承诺的"换表征再验一次"从未存在，`pattern-transfer-failed` 反馈
   （`g13 JSON:334-338`）永不可达。

**建议序列**：点缺口 3 → C（2-3 击循环）、缺口 4 → B（1-2 击）、缺口 5 → A（1 击）
→ "完成"（1 击）= **6-7 击 / 1 阶段**；规律声明可整体删除（两种读法都算对，产物只需 repair-set）。

**前后对比**：点击 **16 → 6~7**；阶段 **4 → 1**；输入控件 12 数字+3 字母+1 下拉+2 槽+3 色板+手风琴 **→ 画布 6 格可点 + 1 个完成按钮**。

**不可破坏项 / 风险**
- 删掉 `pattern-rule` 产物后，本关解决方案若只按 repair 区分：**恰好仍有 2 条不同答案**
  （`A B C` 与 `C B A`），A3 仍满足（`scripts/audit-levels.ts:63-74`）——这是唯一一关可以"只填不声明"的。
  但 `requiredToolArtifacts`（`g13 JSON:71-74`）与 pattern 工具的 `requiredArtifacts` 要一起改，
  且 `content:check:135-141` 要求 requiredToolArtifacts ⊆ 工具产物。
- `e2e/m1.spec.ts:130-142` 的整段点击序列要重写。
- 若保留规律声明，必须顺手把"重复也被接受"这个语义在题干里说清楚，否则是判定欺骗。

### k-algorithm-train（模板 rule，工具 rule）

**观察可得性：A（观察可得）**
- 5×5 空地图、无墙、星星在正前方第 3 格、终点第 5 格（`k-algorithm-train.level.json:30-53`）。
  "前进前进收集前进前进"肉眼可推，孩子不需要任何提示。
- 唯一需要点破的是"重复×2 可以把 5 块压成 3 块"——但**这不是通关必要条件**（
  `s-unrolled` 与 `s-repeat` 都通过，`:68-129`），属于简洁印章的加分项（`rule/logic.ts:260`）。

**当前最少交互序列（`e2e/m1.spec.ts:111-124`）**

| # | 动作 | 控件 |
|---|---|---|
| 1-5 | 追加 前进/前进/收集/前进/前进 | 6 个固定积木按钮里的 3 个（`RuleTool.vue:87-94`） |
| 6 | "提交程序"（立即执行一遍并出"试跑：一共 N 步"） | `rule-commit`（`RuleTool.vue:155-157`） |
| 7 | "试一下" | 宿主 `level-run` |
| 8 | "完成" | 宿主 `level-submit` |

→ **8 击 / 2 个证据阶段**（build → run，`k-algorithm-train.level.json:54-67`）。

**摩擦点**
1. **"提交程序"本身已经执行了一遍**：`rule/commit` 在 adapter 里直接 `executeProgram` 并写 `lastTrace`
   （`packages/templates/src/rule/runtime.ts:110-128`），面板随即显示"试跑：一共 N 步"
   （`RuleTool.vue:96-106`）；画布更是在**任何编辑之后就已经实时重算轨迹**
   （`rule/scene.ts:98-111` 每帧用当前 program 跑 `executeProgram`，`:304-341` 画步数/星星/撞墙）。
   → "提交程序"和"试一下"都是在跑同一份东西。
2. **"试一下"是假反馈**：run 只校验母本（`shared/runtime.ts:244-259`），而"完成"还要过迁移门
   （`:205-231`）→ 玩家可能看到"试一下"通过、点"完成"才失败；而**转过地图从未上屏**
   （rule 场景只画母本，`rule/scene.ts:50-74`；变体通行证只在完成面板出现，`WorkshopView.vue:719-731`），
   玩家无法自查，只能盲猜。
3. **迁移门对旋转恒真**：`RULE_TRANSFER_VARIANTS` 只有 90/180 旋转（`rule/logic.ts:46-49`），
   旋转是刚体变换，程序按相对方向执行 → 母本通过必然旋转通过；仓库自己在测试注释里承认
   "rotate 是刚体变换，程序不可能'只在母本成立'"（`rule/logic.test.ts:211-213`，并改用平移补丁才造出失败）。
   → `rule-not-general` 在本关不可达，`transfer` 印章白送，"同一段程序在转过的轨道上也要成立"
   （`k-algorithm-train.level.json:9`）是空承诺。
4. **积木按钮是硬编码的假编辑器**：6 个按钮里 `重复前进×2`、`遇墙右转` 的内容写死
   （`RuleTool.vue:70-85,87-94`），无法改次数、无法嵌套、无法插入到中间（只能 append，
   `:130` `at: program.value.length`）；删/移一块要"先选中再点按钮"（`:133-153`）。
   本关 2/6 个按钮（重复、遇墙）对 A 类玩家是纯干扰项。
5. **"完成"被"缺步骤"吞掉**：没提交程序直接点完成，横幅是"先完成工具步骤：拼出程序并提交"
   （`shared/runtime.ts:131-144,186-199` + `WorkshopView.vue:110-112`），而画布此时已经在报
   "第 N 步撞到墙"（`rule/scene.ts:319-321`）——真实错误反而被仪式门挡住。

**建议序列**
1) 5 次积木追加（保留"程序"这个抽象，这是本关的认知目标）
2) 1 次"完成"（内部先执行、再判迁移门；不再需要"提交程序"与"试一下"）
→ **6 击 / 1 阶段**。

**前后对比**：点击 **8 → 6**；阶段 **2 → 1**；终止按钮 3（提交程序/试一下/完成）**→ 1**；
若进一步改成"画布点相邻格 = 前进、点车头 = 转身"，最短 4 击（2 前进 + 收集自动 + 2 前进）+ 完成 = 5 击
（需要给 `rule/scene.ts` 加指针输入，当前是零输入，`:32-35` 注释明确"所有动作都从 ToolDock 派发"）。

**不可破坏项 / 风险**
- `audit-levels` A2 要求 `actionsFor` 里至少一个非选择动作（`:76-82`）：合并 commit/run 后
  `rule/place` 仍是主动作，安全。
- `audit-levels` A8 要求 autoplay 走到 `passed` 且 `evidencePlan` 全满足（`:128-143`）：
  `actionsFor` 现在固定发 place→commit→run→submit（`rule/logic.ts:276-286`），要同步改。
- `rule/logic.test.ts:197-198` 断言 `checkpoints.build`/`checkpoints.run` 为 true；
  `rule/runtime.ts:151-156` 的 checkpoint 表要一起改。

### g13-algorithm-route（模板 rule，工具 rule）

**观察可得性：A（答案可观察）/ B（"用重复压缩"这个洞见需一次点破）**
- 5×5 地图，8 面墙围出一条"回"字形走廊，3 颗星 + 终点（`g13-algorithm-route.level.json:30-94`）；
  路线本身肉眼可走。**最短程序并不唯一**：17 块展开版与 12 块重复版都通过（`:109-281`）。
- "重复×2 把 12 块压到 6 段"属于会被 `simple` 印章奖励的洞见（`rule/logic.ts:260`），
  不作通关条件 → 更适合放进**失败反馈**（例如"程序太长：同方向连续 3 次前进可以折叠"），而不是开场步骤清单。

**当前最少交互序列（12 块解）**：12 次积木追加 + 提交程序 + 试一下 + 完成 = **15 击 / 2 阶段**；
用 17 块展开解 = 20 击。修改中途要删/移一块额外 2 击（`RuleTool.vue:137-153`）。

**摩擦点**
1. 与小火车的 1/2/3/4/5 完全同构（提交程序已执行、试一下与完成重复、迁移门空转、横幅吞错）。
2. **"重复"要靠点按钮，不能靠画**：`重复前进×2` 是预制的（`RuleTool.vue:92`），
   玩家想表达"再拐一次"就要自己数和拼；12 块里 6 个 `repeat` 容器 + 6 个单块，
   而 UI 一次只能 append 一个顶层块（`:130`），嵌套块无法手工构造（`makeRepeat` 的子块写死为 forward，`:70-77`）。
3. **地图上没有指针输入**（`rule/scene.ts:32-35`）：路线明明画在画布上，答案却要在右侧按钮里拼。

**建议序列**
- 保守（保留程序抽象）：12 次追加 + 1 次"完成" = **13 击 / 1 阶段**。
- 激进（在网格上点目标格画路线，程序自动派生）：走廊 5 段直线 × 1 击 = **5 击 + 完成 = 6 击 / 1 阶段**
  （(0,0)→(2,0)→(4,0)→(4,2)→(4,4)→(0,4)，星星经过即自动收集）。代价是"重复压缩"与 `simple` 印章
  被自动化，认知目标从"拼程序"降级为"走路线"。

**前后对比**：保守 **15 → 13**；激进 **15 → 6**（阶段 2 → 1，答案控件 6 个积木按钮 → 画布格）。

**不可破坏项 / 风险**：与小火车的门禁相同；此外 `g13-algorithm-route` 是 `rule-designer` 贴纸的解锁关
（`docs/07`§... 见 `packages/evidence` 徽章规则），完成条件不能被放松成"点了就算"。

## 2. 模板级问题（跨关卡共性，按影响排序）

1. **run 与 submit 是同一份判定，但 run 是硬检查点**（P0）
   - pattern：`pattern/runtime.ts:316`（run）与 `:353`（submit）都调 `validateArtifact`；
     submit 也 `addRun`（`:364`）；run 的结果与 submit 完全一致，只多一个 `checkpoints.run = true`（`:320`）。
   - rule：`shared/runtime.ts:244-259`（run）与 `:186-242`（submit）共用 `adapter.validate`；
     差异只有 submit 多一道迁移门（`:205-231`），而迁移门对旋转恒真（见下条）。
   - 后果：每关固定多 1 击 + 1 阶段，且"缺运行"横幅会盖住真实错误（`WorkshopView.vue:110-112`）。
   - 建议：**删掉 run 按钮与 run 检查点，submit 内部执行校验**；`RunRecord` 由 submit 写一次即可
     （`shared/runtime.ts:233` 已经写了）。`runEnabled` 可以保留给真正需要"先跑后判"的模板。
2. **迁移门在这 4 关都没有教学价值**（P0）
   - pattern：**没有迁移门**（`verifiers.ts:34-43`），`v-relabel`/`v-shift` 因 `toWorld` 忽略
     `symbols/startIndex`（`pattern/logic.ts:139-146`）而零效果；`pattern-transfer-failed` 不可达。
   - rule：只有刚体旋转（`rule/logic.ts:46-49`）→ 恒真；`rule-not-general` 不可达（仓库自认：
     `rule/logic.test.ts:211-213`）。
   - 后果：`transfer` 印章白送 / 承诺的反例不存在；而"变体通行证"只在完成面板出现
     （`WorkshopView.vue:719-731`），玩家全程看不到第二张地图。
   - 建议：要么把 rule 变体换成**非刚体**（平移起点/镜像/换宽度），要么在提交前把变体地图并排画出来；
     pattern 要么补真正的换表征变体，要么把 `docs/01:58`/`docs/03:119` 的承诺与死反馈一起删掉。
3. **GuideBubble 念的是内部步骤名**（P1）
   - 文本 = `evidencePlan[].descriptionKey`（`WorkshopView.vue:80-84,126`），4 关里 3 关写的是
     "先点几格看看它怎么重复"/"拼出程序并提交"，正是该删的仪式清单；
     2 关直接把中文写进 descriptionKey（`g13 JSON:105`、`k-algorithm-train JSON:59,65`），英文界面漏中文。
   - 建议：气泡只在**第一次失败之后**出现，且文案来自 `feedback.hintKey`（已有），不再复述步骤名。
4. **答案输入与展示面割裂**：pattern 的画布能点（`pattern/scene.ts:162-190`）却不能填；
   rule 的画布连指针都没接（`rule/scene.ts:32-35`）；两边的答案都在右侧手风琴面板里，且 pattern 的
   填块工具在第 2 张卡（`ToolDock.vue:54`）。建议：**把答案输入搬到画布上**，面板只保留"规律/撤销"。
5. **工具配置与关卡约束脱钩**：pattern 的 `allowedTransforms` 只活在 levelScript 里
   （`k JSON:100-104`），工具配置 schema 没有这个字段（`content/src/schema.ts:19-23`），
   所以下拉里必然出现非法项（`PatternTool.vue:25-29`）。建议给 pattern config 增加
   `transforms?: PatternTransform[]` 与 `ruleCandidates?: {...}[]`，缺省时回退全量（向后兼容）。
6. **evidencePlan.require 与实现漂移**：`"construct/commit >= 1"` 这种不存在动作写在内容里
   （`k JSON:123`、`g13 JSON:118`），真实门槛硬编码在 `pattern/runtime.ts:197,265,289,320`；
   `content:check` 只检查非空（`:210-215`）。建议把 `require` 收窄成枚举（如
   `tool:pattern:inspect`）或在文档里标注"仅描述"。

7. **（方案兼容性陷阱）repair-only 产物会得到"既无失败类、也无缺证据"的空判定**：`pattern/runtime.ts:351-359`
   在 `artifactOf()` 为 null 时返回 `{passed:false, stamps:[], missingEvidence: []}`，
   而宿主只在 `verdict.failure` 或 `missingEvidence[0]` 存在时才显示横幅（`WorkshopView.vue:98-113`），
   于是"点完成→什么都没发生"。若要落地 §3 第 6 行「g13 只填不声明」，必须同步让
   `artifactOf()` 接受仅 `repair` 的产物，或给这个分支补 `failure.class`。这是本轮唯一的**死点击**风险。

## 3. 可直接落地的改动清单

| # | 改动 | 文件 | 影响关卡 | 风险 |
|---|---|---|---|---|
| 1 | 画布缺口可点击循环填 token（复用 `indexAt` 命中，`pattern/scene.ts:162-180`，dispatch `construct/place`）；token 表从 `ctx.detail.tools` 的 pattern config 读 | `pattern/scene.ts`、`toolkit-ui/ConstructTool.vue`（或新 `PatternAnswerStrip.vue`） | 2 个 pattern 关 | 中：e2e 序列全改 |
| 2 | 删 observe 检查点与 12 个数字按钮，删除"观察带子"整块 UI | `pattern/runtime.ts:197`、`PatternTool.vue:135-151`、2 个 level JSON `evidencePlan` | 2 个 pattern 关 | 低：只剩 repair/规律检查点，A1 仍满足 |
| 3 | 删 run 按钮与 run 检查点（`runEnabled:false` 或删 `evidencePlan.run`），submit 内执行判定 | `pattern/runtime.ts:312-333`、2 个 level JSON、`shared/runtime.ts`（rule 侧）、`forge.test.ts:108-117` | 4 关 | 中：需改 `forge.test.ts` 的 `runEnabled===hasCanvas` 断言 |
| 4 | transform 下拉 → 2~3 个图标按钮，候选来自新增 config 字段 | `PatternTool.vue:25-29,191-204`、`content/src/schema.ts:19-23`、2 个 level JSON 的 pattern config | 2 个 pattern 关 | 低：schema 加可选字段，向后兼容 |
| 5 | 规律声明改"候选单元条一键确认"（含变换），保留作第二产物 | `PatternTool.vue:153-189`、新增 `pattern/pickRule` 动作（`game-kit/src/runtime.ts:87-128`、`pattern/runtime.ts`） | 2 个 pattern 关 | 中：新动作要进 `actionsFor`（A2/A8）|
| 6 | g13 允许"只填不声明"：`requiredToolArtifacts` 去掉 `pattern-rule`，solutions 改成两种 repair（`ABC` / `CBA`，已用算术复现验证两条都 pass） | `g13-structure-symmetry.level.json`、`pattern/runtime.ts:77-83,351-359` | 1 关 | 中：必须先修 §2-7 的空判定，否则点"完成"没有任何反馈 |
| 7 | rule 合并"提交程序/试一下/完成"为单一"完成" | `RuleTool.vue:226-263`、`shared/runtime.ts:186-259`、`rule/runtime.ts:151-156`、2 个 level JSON | 2 关 | 中：`rule/logic.test.ts:195-201` 断言要改 |
| 8 | rule 画布点相邻格追加前进 / 点车头转身（可选、激进） | `rule/scene.ts` 新增 pointer 处理、`RuleTool.vue` 保留按钮作为无障碍替代 | 2 关 | 高：交互全新，需 e2e 重写 |
| 9 | 迁移门改非刚体变体（平移/镜像）或删掉"变体通行证"承诺 | `rule/logic.ts:46-49`、`g13-algorithm-route.level.json:415-430`、`pattern/logic.ts:139-146` | 4 关 | 高：动判定层，需重跑 audit:levels |
| 10 | GuideBubble 改成"失败后才出现"，文案用 `feedback.hintKey` | `WorkshopView.vue:117-126,540-550` | 全部 | 低 |
| 11 | 2 关的 `evidencePlan.descriptionKey` 从中文换成 i18n key | `g13-structure-symmetry.level.json:101-126`、`k-algorithm-train.level.json:54-67`、`packages/i18n/src/{messages,en}.ts` | 2 关 | 低：但 `content:check` 不拦，需人工保证 |

## 4. 需要 Lead/用户决策的问题

1. **pattern 是否允许"只填答案、不声明规律"？** g13 可以（两种修复都合法，A3 仍满足）；
   K 关不行（只有一种修复，A3 会红），必须保留"一键候选规律"或改内容加歧义解。要不要为 K 关破例？
2. **run 按钮是否全局合并进 submit？** 好处是每关省 1 击 1 阶段、失败横幅不再被"缺步骤"吞；
   代价是要改 `forge.test.ts:108-117` 的断言，并放弃 `docs/01`§5.1「缺运行→按钮呼吸」的设计。
3. **rule 是否改成"点格画路线 + 自动编译程序"？** g13 能从 15 击降到 6 击且更直观，
   但"重复压缩"与 `simple` 印章被自动化，认知目标从"拼程序"变成"规划路线"——这是产品取向问题。
4. **迁移门要不要修成真的有判别力？** 现状 rule 的旋转恒真、pattern 根本没有迁移门，
   `transfer` 印章白送、`docs/01:58`/`docs/03:119` 的承诺为空。要么补非刚体变体（动判定层，
   要重跑 audit:levels 与内容负例），要么把承诺和死反馈一起删掉。选哪个？
5. **GuideBubble 是否整轮去掉？** 建议保留组件但只在失败后触发；如果要彻底删，
   要同步删 `evidencePlan[].descriptionKey` 的使用方与 4 关的引导文案。

---

### 附：4 关"仪式 vs 增量"一览

| 关卡 | 阶段 | 其中对判定/理解有增量的 | 纯仪式 |
|---|---|---|---|
| k-structure-pattern-path | observe / hypothesis / repair / run | hypothesis（选说法）、repair（答案） | observe（无读数）、run（与 submit 同判定） |
| g13-structure-symmetry | 同上 | repair（答案） | observe、run，且 hypothesis 与题干不一致 |
| k-algorithm-train | build / run | build（程序） | run（画布已实时显示轨迹） |
| g13-algorithm-route | build / run | build（程序） | run、迁移门（恒真） |