# 基线：每关最少交互（来自 e2e 真实点击序列，含循环展开）

| 关卡 | 模板 | 当前序列（展开循环） | 点击 | 数字/下拉 | 阶段 |
|---|---|---|---|---|---|
| k-structure-pattern-path | pattern+construct | 观察×2 → token×3 → 用这条规律 → 展开第二张卡 → (选槽+放块)×3 → 试一下 → 完成 | 15 | 0 | 4 |
| g13-structure-symmetry | pattern+construct | 观察×2 → token×3 → 下拉变换 → 用这条规律 → 展开卡 → (选槽+放块)×3 → 试一下 → 完成 | 16 | 1 | 4 |
| k-algorithm-train | rule | 指令块×5 → 提交程序 → 试一下 → 完成 | 8 | 0 | 2 |
| g13-algorithm-route | rule | 指令块×N → 提交 → 试一下 → 完成 | ~8 | 0 | 2 |
| k-modeling-share | construct/distribution | (容器×类别 +)×12 → 完成 | 13 | 0 | 2 |
| g13-modeling-pack | construct/distribution | (容器×类别 +)×N → 完成 | ~13 | 0 | 2 |
| g79-structure-network | construct/network | 勾边×4 → 完成 | 5 | 0 | 3 |
| g79-algorithm-schedule | construct/schedule | 下拉×4 → 完成 | 5 | 4 | 3 |
| g46-algorithm-payment | construct/payment+counter | 加币×2 → 展开反例卡 → 填目标 → 选面额×3 → 测试 → 选前提 → 提交反例 → 完成 | 10 | 1 数字 + 2 下拉 | 4 |
| g1012-algorithm-frontier | construct/frontier | 下拉×4 → 完成 | 5 | 4 | 3 |
| k-data-tally | experiment/tally | 采样×4 → +1×20 → 选最多 → 选类别 → 提交结论 → 完成 | 28 | 0 | 3 |
| g13-data-weather | experiment/tally | 采样×2 → +1×N → 选最多 → 类别 → 提交结论 → 完成 | ~28 | 0 | 3 |
| g79-data-sampling | experiment/sampling | 采样×2 → 下结论 → 完成 | 4 | 0 | 2 |
| g1012-data-inference | experiment/inference | 看两组 → 选结论 → 完成 | 3 | 0 | 2 |
| g1012-modeling-winrate | experiment/duel+knob | 调 3 旋钮 → 确认 → 采样 → 写结论 → 完成 | ~10 | 3 滑块 + 1 数字 | 3 |
| g46-modeling-queue | simulate/queue | 调参 → 运行 → 对比 → 完成 | ~8 | 滑块 | 3 |
| g79-modeling-dispatch | simulate/queue | 调参 → 运行 → 对比 → 完成 | ~8 | 滑块 | 3 |
| g1012-structure-invariant | argue | 铺 2 格 → 展开 probe → 采样 → 选主张 → 选依据 → 挂证据 → 选范围 → 提交论证 → 完成 | 10 | 3 下拉 | 4 |
| g46-data-invariant | argue | 同构 | ~10 | 3 下拉 | 4 |
| g46-structure-tiling | argue | 同构 | ~10 | 3 下拉 | 4 |

> 说明：点击数按 e2e 序列里"循环体次数 × 循环次数"展开；g13-data-weather 未写真实点击用例，按 k-data-tally 同构估算。
