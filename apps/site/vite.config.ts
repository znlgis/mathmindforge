import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
// 显式带 .ts：Vite 8 的 native config loader 不支持无扩展名相对导入（dev 启动时会警告）。
import { CSP_TAG } from './src/shell/csp.ts';

const phaserTrim = fileURLToPath(
  new URL('../../packages/canvas-kit/vendor/phaser-trim.esm.js', import.meta.url),
);

/**
 * 只在构建产物注入 CSP（策略在 src/shell/csp.ts，有单测兜住）。
 * 用标签描述符而不是字符串替换：见 csp.ts 里 `CSP_TAG` 的注释。
 */
function cspPlugin(): Plugin {
  return {
    name: 'mmf-csp',
    apply: 'build',
    transformIndexHtml: () => [CSP_TAG],
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), cspPlugin()],
  resolve: { alias: [{ find: /^phaser$/, replacement: phaserTrim }] },
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
  preview: { host: '127.0.0.1', port: 5193, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-phaser',
              test: /node_modules[\\/]phaser[\\/]|canvas-kit[\\/]vendor[\\/]phaser-trim/,
            },
          ],
        },
        chunkFileNames(chunk) {
          const id = chunk.facadeModuleId ?? '';
          const level = /[\\/]games[\\/]forge[\\/]src[\\/]levels[\\/]([^\\/]+)\.ts$/.exec(id);
          if (level) return 'assets/level-' + level[1] + '-[hash].js';
          const detail = /[\\/]content[\\/]src[\\/]details[\\/]([^\\/]+)\.level\.json$/.exec(id);
          if (detail) return 'assets/content-' + detail[1] + '-[hash].js';
          if (chunk.name.includes('phaser')) return 'assets/vendor-phaser-[hash].js';
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
