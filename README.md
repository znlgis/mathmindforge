# 数思工坊 · Math Mind Forge

> **A Thinking Quest from Patterns to Boundaries**
>
> 不是刷题，是锻造思维工具。

《数思工坊》是一款面向 5–18 岁的**数学思维闯关场**：打开一关就是一道可直接作答的题——在画布上补格子、画路线，或在图上连边、排课表、填数字、选依据——填完自动判题，答对进下一关，答错直接说明错在哪。通关不靠"背答案"，靠想清楚规则、约束、模型或论证。

- 中文名：**数思工坊**
- 英文名：**Math Mind Forge**
- 副标题：**从模式到边界的思维闯关** / **A Thinking Quest from Patterns to Boundaries**
- 技术栈：沿用 BambooBuddy（`D:/self/code/BambooBuddy`）已验证的 pnpm workspace + Vue 3.5 + Vite 8 + TypeScript 5.9 + Phaser 4.2（裁剪版）+ Vitest + Playwright + Tauri 2 / Capacitor 8 组合，并按"Canvas + ToolDock 双视图、动作驱动纯运行时"重新设计。

---

## 当前状态（v1.0.0-rc.1：20/20 关可玩）

**20 关可玩、6 个模板；关卡内没有工具卡与模式设置，题目直接可答；证据 → 画像 → 徽章 → 日志/轨迹 → 报告已闭环**：

- `k-structure-pattern-path` 模式修补匠（pattern）
- `k-data-tally` 分类小站（experiment / tally）
- `g13-algorithm-route` 规则工程师·路线（rule）
- `g46-algorithm-payment` 最少枚数支付（construct / payment + counter）
- `g79-modeling-dispatch` 城市调度员（simulate + knob/probe）
- `g1012-modeling-winrate` 胜率实验室（experiment / duel + knob/probe）
- `g1012-structure-invariant` 结构不变量（argue + domino/probe）
- `k-algorithm-train` 规则小火车（rule）
- `g13-data-weather` 天气记录站（experiment / tally）
- `g46-data-invariant` 不变量侦探（argue，7×7）
- `k-modeling-share` 公平分点心（construct / distribution）
- `g13-modeling-pack` 公平分装（construct / distribution）
- `g13-structure-symmetry` 对称补墙（pattern / reflect）
- `g46-structure-tiling` 铺砌边界（argue，7×7）
- `g46-modeling-queue` 排队规划师（simulate / queue）
- `g79-data-sampling` 抽样调查员（experiment / sampling）
- `g79-structure-network` 路网规划师（construct / network）
- `g1012-data-inference` 证据裁判（experiment / inference）
- `g79-algorithm-schedule` 课表编排师（construct / schedule）
- `g1012-algorithm-frontier` 贪心边界（construct / frontier）

真实点击与 autoplay 走同一条动作路径；**没有「完成」按钮**：答案一填完就自动判题，答对直接进下一关，答错在关卡顶部给出具体原因（见 [自动判定与自动过关](docs/13-自动判定与自动过关.md)）。

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5192
pnpm verify       # typecheck / lint / 393 单测 / 内容体检 / 关卡审计（含 A11 自动判题可达）/ 打包体检 / build / size
pnpm e2e          # 76 条：20 关 autoplay、20 关真实点击（自动判题自动过关）、无工具卡、错误原因直出、交互预算、UI 冒烟、日志/徽章/报告、断网/零外网、刷新保留
```

实测（2026-11-07，去卡片化轮后）：首屏 69.7 KB gzip，Phaser chunk 220.3 KB gzip，dist 1490.5 KB；`pnpm verify` 与 `pnpm e2e`（76 条）全绿。

已实现：workspace 基座、game-kit 契约、20 关内容、6 个模板、凭答案面板直接作答的关卡 UI + 论证板、Phaser 画布、IndexedDB 存档与批量证据、四维画像、9 枚徽章、思维日志/轨迹、长按解锁的家长/教师报告（打印 + JSON 导出/只读导入）、变体通行证、双语 UI 与内容英文字段、证据/徽章/报告本地化、内容体检（含英文零中文与禁词分级）、反刷题审计（A1/A1b/A2–A6/A8/A11 + autoplay 走通）、体积门禁、CI。详细记录见 [M0/M1/M2a/M2b 实现记录](docs/05-M0实现记录.md)。

**尚未完成**（发布链路阻塞项，见 [发布检查清单](docs/09-发布检查清单.md)）：

1. **原生壳**：仓库只有 Web 产物，`apps/desktop`（Tauri）与 `apps/mobile`（Capacitor）尚未创建——本机缺 Rust 与 Android SDK；
2. **真实用户测试**：协议与观察表已写，但还没有真实用户数据；
3. **英文缺口**：界面与关卡内容有英文，但模板里的失败反馈仍是中文句子直接当 key，英文界面会回退中文（`content:check` 目前对此记警告）；
4. **发布流水线**：`release.yml` 的 tag 发布路径尚未实跑；签名与商店材料未建立。

---

## 文档

1. [方案总览](docs/00-方案总览.md) —— 定位、六个改造点、v0.5 / v0.9 / v1.0 / v1.1 / v1.2 的范围；
2. [产品与玩法设计](docs/01-产品与玩法设计.md) —— 六件工具、六个模板、证据与报告、编辑器、反刷题审计；
3. [技术架构](docs/02-技术架构.md) —— 包结构、契约、运行时、存档、证据、平台、构建、测试、打包；
4. [关卡设计规格](docs/03-关卡设计规格.md) —— 20 关矩阵、MVP 6 关详规、JSON 示例、作者检查表；
5. [落地路线与验收](docs/04-落地路线与验收.md) —— M0–M5、任务分解、验收门禁、用户测试、风险与待确认决策；
6. [M0/M1/M2a/M2b 实现记录](docs/05-M0实现记录.md) —— 各阶段实际实现、实测数字、偏差与下一步；
7. [M1 实施规格](docs/06-M1实施规格.md) —— 四模板/六关的并行施工合同与内容数字；
8. [M2a 实施规格](docs/07-M2a实施规格.md) —— 证据/画像/徽章/日志/报告接口与叙事 UI 合同；
9. [用户测试协议](docs/08-用户测试协议.md) —— 知情同意、观察表、成功标准与隐私；
10. [发布检查清单](docs/09-发布检查清单.md) —— 内容/工程/双语/原生壳/发布操作与阻断规则；
11. [全面审查与优化记录](docs/10-全面审查与优化记录.md) —— 2026-11-03 的缺陷清单、修复方式、门禁加强与已知缺口；
12. [可玩性改造方案](docs/11-可玩性改造方案.md) —— 右侧滚动条、反馈位置、画布与工具区的可玩性问题；
13. [流程与交互简化方案](docs/12-流程与交互简化方案.md) —— 三轮交互简化（删引导、去仪式按钮、画布直接作答）的诊断、方案与实测对照；
14. [自动判定与自动过关](docs/13-自动判定与自动过关.md) —— 第四轮：answerComplete 契约、自动判题、答对自动进下一关、错误原因直出、门禁与已知限制；
15. [去卡片化与直接作答](docs/14-去卡片化与直接作答.md) —— 第五轮：删工具卡与模式设置、pattern 规律自动反推、rule 画布唯一输入、argue 只留论证板、门禁与已知限制。

## CI / 发布

- `ci.yml`：verify（含 `content:check --require-all`）、e2e、preview（生产产物 `e2e:dist`），Playwright 缓存与失败截图/轨迹；
- `release.yml`：push `v*` tag 时创建 GitHub Release，附 Web 静态 zip；`workflow_dispatch` 只出产物；tag 发布路径尚未实跑；
- 原生 EXE/APK 任务未纳入：仓库尚无 Tauri/Capacitor 工程，构建环境也缺 Rust/Android SDK。

## 范围与默认决策

按 2026-10-31 确认的推荐默认执行：5 学段全做（v1.0 20 关）、双语内容 v1.0、三端发布、多档案 schema 先行 UI v1.1、编辑器 v1.1、v1.0 20 关 + 变体。完整 10 项见 [04 文档第 9 节](docs/04-落地路线与验收.md)。
