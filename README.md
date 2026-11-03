# 数思工坊 · Math Mind Forge

> **A Thinking Quest from Patterns to Boundaries**
>
> 不是刷题，是锻造思维工具。

《数思工坊》是一款面向 5–18 岁的**数学思维工具使用场**：玩家在可操作、可失败、可修正的情境里，调用模式卡、规则卡、构造块、参数旋钮、数据采集器、反例探测器六件工具，构造出满足约束的结构、规则、模型或论证，才能推进。通关不靠"答对题"，靠工具产物、约束满足与证据链。

- 中文名：**数思工坊**
- 英文名：**Math Mind Forge**
- 副标题：**从模式到边界的思维闯关** / **A Thinking Quest from Patterns to Boundaries**
- 技术栈：沿用 BambooBuddy（`D:/self/code/BambooBuddy`）已验证的 pnpm workspace + Vue 3.5 + Vite 8 + TypeScript 5.9 + Phaser 4.2（裁剪版）+ Vitest + Playwright + Tauri 2 / Capacitor 8 组合，并按"Canvas + ToolDock 双视图、动作驱动纯运行时"重新设计。

---

## 当前状态（M2b 进行中：argue + 结构不变量）

**14 关可玩、6 个模板、6 件工具；证据 → 画像 → 徽章 → 日志/轨迹 → 报告已闭环**：

- `k-structure-pattern-path` 模式修补匠（pattern）
- `k-data-tally` 分类小站（experiment / tally）
- `g13-algorithm-route` 规则工程师·路线（rule，无头自动通关；真实点击排期 M2b）
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

真实点击与 autoplay 走同一条动作路径；没有使用工具时提交会被拒绝。

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5192
pnpm verify       # typecheck / lint / 120 单测 / 内容体检 / 关卡审计 / 打包体检 / build / size
pnpm e2e          # 42 条：14 关 autoplay、14 关无工具失败、7 关真实点击、日志/徽章/报告、断网/零外网、刷新保留
```

实测（2026-11-03）：首屏 51.2 KB gzip，Phaser chunk 220.3 KB gzip，dist 1345.8 KB；`pnpm verify` 与 `pnpm e2e`（42 条）全绿。

已实现：workspace 基座、game-kit 契约、14 关内容、6 个模板、6 件工具 UI + 论证板、Phaser 画布、无画布 ToolDock、IndexedDB 存档与批量证据、四维画像、9 枚徽章、思维日志/轨迹、长按解锁的家长/教师报告（打印 + JSON 导出/只读导入）、变体通行证、双语 UI、内容与证据/报告、内容体检、反刷题审计、体积门禁、CI。详细记录见 [M0/M1/M2a/M2b 实现记录](docs/05-M0实现记录.md)。

**M2b 下一步**：其余 6 关（需 queue/network/schedule/sampling/inference 新模式）、原生壳（需 Rust 与 Android SDK）、真实用户测试。

---

## 文档

1. [方案总览](docs/00-方案总览.md) —— 定位、六个改造点、v0.5 / v0.9 / v1.0 / v1.1 / v1.2 的范围；
2. [产品与玩法设计](docs/01-产品与玩法设计.md) —— 六件工具、六个模板、证据与报告、编辑器、反刷题审计；
3. [技术架构](docs/02-技术架构.md) —— 包结构、契约、运行时、存档、证据、平台、构建、测试、打包；
4. [关卡设计规格](docs/03-关卡设计规格.md) —— 20 关矩阵、MVP 6 关详规、JSON 示例、作者检查表；
5. [落地路线与验收](docs/04-落地路线与验收.md) —— M0–M5、任务分解、验收门禁、用户测试、风险与待确认决策；
6. [M0/M1/M2a/M2b 实现记录](docs/05-M0实现记录.md) —— 各阶段实际实现、实测数字、偏差与下一步；
7. [M1 实施规格](docs/06-M1实施规格.md) —— 四模板/六关的并行施工合同与内容数字；
8. [M2a 实施规格](docs/07-M2a实施规格.md) —— 证据/画像/徽章/日志/报告接口与叙事 UI 合同。

## 范围与默认决策

按 2026-10-31 确认的推荐默认执行：5 学段全做（v1.0 20 关）、双语内容 v1.0、三端发布、多档案 schema 先行 UI v1.1、编辑器 v1.1、v1.0 20 关 + 变体。完整 10 项见 [04 文档第 9 节](docs/04-落地路线与验收.md)。
