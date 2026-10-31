import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/vendor/**',
      '.scratch/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts', '*.config.js', '*.config.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    files: ['packages/toolkit/src/**/*.ts', 'packages/templates/src/**/*.logic.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: '纯逻辑层禁止 Math.random，请注入种子。' },
        { object: 'Date', property: 'now', message: '纯逻辑层禁止 Date.now，请注入 now。' },
      ],
      'no-restricted-imports': ['error', { paths: [
        { name: 'phaser', message: '纯逻辑层禁止 Phaser。' },
        { name: 'vue', message: '纯逻辑层禁止 Vue。' },
      ]}],
    },
  },
  {
    files: ['packages/{toolkit,templates,games}/**/*.ts', 'apps/site/src/**/*.{ts,vue}'],
    rules: {
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'indexedDB'],
    },
  },
  {
    files: ['apps/site/src/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [
        { name: '@mmf/content/full', message: '外壳不许直接引入完整内容：用 loadLevel()。' },
        { name: 'phaser', message: '外壳不许直接 import Phaser：它只属于关卡 chunk。' },
      ]}],
    },
  },
);
