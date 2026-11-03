import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'games/**/src/**/*.test.ts',
      // 外壳里也有纯逻辑（路由解析、seed、存档接线）。不纳入 include 的测试 =
      // 静默不执行，比没写更糟：CI 会假绿。外壳测试必须是纯逻辑（node 环境，不碰 DOM）。
      'apps/site/src/**/*.test.ts',
    ],
    environment: 'node',
  },
});
