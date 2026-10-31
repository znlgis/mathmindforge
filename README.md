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

## 当前状态（M0 已完成）

**首关 `k-structure-pattern-path` 已经可以玩**：观察带子 → 模式卡拼出重复单元 → 构造块补齐三个缺口 → 运行 → 验证结构 → 完成并写入存档。真实点击与 autoplay 走同一条动作路径；没有使用工具时提交会被拒绝。

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5192
pnpm verify       # typecheck / lint / 14 单测 / 内容体检 / 关卡审计 / 打包体检 / build / size
pnpm e2e          # 6 条：进入、autoplay、无工具失败、真实点击通关、断网/零外网、刷新保留
```

实测（2026-10-31）：首屏 41.3 KB gzip，Phaser chunk 220.3 KB gzip，dist 1090.8 KB；`pnpm verify` 与 `pnpm e2e` 全绿。

已实现：workspace 基座、game-kit 契约、内容 schema/首关、pattern 工具与模板、Phaser 画布、Vue ToolDock、IndexedDB 存档与证据、进度管理、调试桥、内容体检、反刷题审计、体积门禁、CI。详细记录见 [M0 实现记录](docs/05-M0实现记录.md)。

**M1 下一步**：补齐其余 5 关（数据/规则/构造/模拟/实验），实现四个模板与工具面板，加入思维轨迹与报告雏形。

---

## 文档

1. [方案总览](docs/00-方案总览.md) —— 定位、六个改造点、v0.5 / v0.9 / v1.0 / v1.1 / v1.2 的范围；
2. [产品与玩法设计](docs/01-产品与玩法设计.md) —— 六件工具、六个模板、证据与报告、编辑器、反刷题审计；
3. [技术架构](docs/02-技术架构.md) —— 包结构、契约、运行时、存档、证据、平台、构建、测试、打包；
4. [关卡设计规格](docs/03-关卡设计规格.md) —— 20 关矩阵、MVP 6 关详规、JSON 示例、作者检查表；
5. [落地路线与验收](docs/04-落地路线与验收.md) —— M0–M5、任务分解、验收门禁、用户测试、风险与待确认决策；
6. [M0 实现记录](docs/05-M0实现记录.md) —— 实际实现了什么、实测数字、与方案的偏差、M1 任务。

## 范围与默认决策

按 2026-10-31 确认的推荐默认执行：5 学段全做（v1.0 20 关）、双语内容 v1.0、三端发布、多档案 schema 先行 UI v1.1、编辑器 v1.1、v1.0 20 关 + 变体。完整 10 项见 [04 文档第 9 节](docs/04-落地路线与验收.md)。
