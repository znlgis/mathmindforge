# Changelog

## Unreleased（全面审查与修复轮，基于 v1.0.0-rc.1）

> 本轮没有新增关卡或玩法；目标是**把"说过的"和"做到的"对齐**，并修掉一批
> 会在真实使用中咬人的缺陷。逐条证据见 [全面审查与优化记录](docs/10-全面审查与优化记录.md)。

### 修复（按影响排序）

- **模板运行时**：run id 在第 11 次运行后重复（`runs.length + 1` 撞上 `slice(-10)`）；`snapshot().toolUsage` 透传内部引用，旧快照会被后续动作改写；`pattern` 的 `actionsFor` 缺产物时抛 TypeError；
- **判定可绕过**：`construct/distribution` 信任产物自报的 `total` 与未登记物品键；`argue` 证书写死选项表而不读 `levelScript`；`experiment/duel` 的 `n` 只挡 `<= 0`，`n=1e9` 会把页面跑死；
- **存档与证据**：证据裁剪到 3000 条时丢弃最旧事件却**从不并入聚合**（历史计数永久丢失）；并发完成时两次写盘无序、写失败会中断关卡反馈；`refreshBadges` 取 2000 条（小于裁剪上限）且引用取到的是窗口里最旧的 20 条；单条证据无 1.5 KB / metrics 8 键约束；
- **报告导入**：`parseReportPack` 缺 HTML/脚本拒绝与 512 KB 体积闸门，`uses` 可产出 NaN，昵称未截断；
- **工具台**：`pattern` 关卡末尾多渲染一行"这个工具暂时还没接上"；推断工具主比例被缩小 100 倍；骨牌 id 用 `Date.now()`，同毫秒连点会连坐删除；`PatternTool` 重玩后残留旧变换；
- **外壳**：关卡卸载不彻底（订阅、debug 桥、画布、定时器泄漏）；`decodeURIComponent` 遇畸形 hash 抛错导致路由冻结；深链首帧用错语言；完成事件早于落盘；`@media print` 的 `header` 选择器把报告页标题一起隐藏；
- **可访问性**：补 skip link、路由切换焦点重置、`aria-current`、图标按钮可访问名、完成面板 dialog 语义、错误态 `role=alert`、触控目标 ≥44px；低对比 token `ink-soft` 从 4.37:1 提到 4.91:1（AA）；
- **安全**：CSP 改为**构建期注入**（dev 保留 HMR 的 ws 连接，生产注入 `connect-src 'none'` 等指令），策略有单测。

### 质量门禁加强

- `content:check`：摘要/详情标题一致、id 唯一、英文字段齐全且零中文/零全角标点、禁词分级（伤害性 vs 建议替换）、变体 id/轴校验、证据检查点唯一、unlock 引用合法、`--require-all` 覆盖 20 关；
- `audit-levels`：新增 A2（动作空间含非选择动作）、A3（解产物互不相同）、A8（`autoplay` 真的走到 passed 且检查点全满足、产生证据草稿），并保留 A1/A1b/A4/A6/人工项；
- `pack:check`：改成只检查真实存在的东西——脚本齐全、vendor/许可、20 关摘要/详情的 id 与英文字段、首关人工复核；原生壳不存在时给提示而不是假装通过；
- `vitest.config.ts`：纳入 `apps/site/src/**/*.test.ts`（此前外壳测试写了也不会执行）。

### 审查后的收尾修复

- **英文反馈收口**：工具面板的错误消息统一走 `t()`（此前 `error = result.message` 直接渲染，绕过翻译）；英文兜底表补齐模板侧的整句与场景短句；新增 `packages/templates/src/i18n-coverage.test.ts`，模板新增中文整句却没给英文会直接红（已用"删一条译文"验证过）；
- **variant 应用缺口**：新增 `shared/variant-script.ts`，network / schedule / frontier / sampling / inference / queue 在校验前统一应用 `variant.patch`（此前只有 base 被校验，属休眠缺陷）；
- **死失败类**：`queue-unserved` 从 `reachableFailureClasses` 移除（排队模型没有接待上限，结构上不可达），源码注明原因，内容 feedback 保留无害；
- **重复实现**：`argue` 的 `actionsFor / transferVariants / transferFailureClass` 改为委托 `logic.ts`，删掉 runtime 里那份坐标不一致的抄本。

### 测试与文档

- 单测 120 → **322**（25 个文件），新增模板边界、存档迁移/sanitize、证据裁剪/聚合、报告导入、platform 降级、i18n key 一致性、content 交叉校验、路由/seed/CSP、模板文案英文覆盖；
- 文档：修正 `docs/02` 的动作表、模板接口（`RuntimeAdapter` 而非 `TemplateLogic`）、双语方案（内联英文字段而非英文补丁目录）、路由表（只有 6 个）、打包体检范围、性能测量现状；README 去掉重复的"下一步"，改为可核对的"尚未完成"清单。

### 已知缺口（未在本轮修复）

- 模板里仍有纯拼接片段文案（如 `" / 守 "`、`'冲突：' + a + '/' + b`）无法查表，需改成"整句模板 + 参数"才能翻译（要动 5 个 runtime）；
- 原生壳、真实用户测试、发布流水线与签名仍未完成；
- 首屏 gzip 由 52.2 KB 升到 **65.5 KB**（仍在 85 KB 预算内），主要来自英文兜底表；下一步可把 en 表拆成懒加载 chunk（需把切语言变成异步）。

## v1.0.0-rc.1

### 内容

- 20/20 关、6 个模板、6 件工具；
- 结构/算法/建模/数据四条主线，K–高中五个学段；
- 每关 ≥2 解、≥3 负例、≥2 变体，全部通过内容体检与反刷题审计。

### 证据与报告

- 四维画像、9 枚徽章、思维日志/轨迹；
- 一页式家长/教师报告，打印/PDF 与 JSON 证据包导出；
- 证据包只读导入，不合并存档；
- 变体通行证展示迁移结果。

### 双语

- UI、关卡标题/正文、徽章/日志/报告可切中英；
- 语言选择持久化；内容缺失英文时回退中文。

### 工程

- pnpm workspace、TypeScript strict、Vue 3 + Phaser 4；
- 120 单测、59 条 e2e、零外网、断网可操作；
- 首屏 52.2 KB gzip，dist 1419.9 KB。

### 未完成

- 原生壳（Tauri/Capacitor）因本机缺 Rust/Android SDK 未构建；
- 真实用户测试与英文人工校读未执行；
- 发布流水线、签名与商店材料未建立。
