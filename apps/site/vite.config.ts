import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const phaserTrim = fileURLToPath(
  new URL('../../packages/canvas-kit/vendor/phaser-trim.esm.js', import.meta.url),
);

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
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
