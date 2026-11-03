/**
 * 生产产物的内容安全策略（docs/02 §16.1）。
 *
 * 只在构建时注入 dist/index.html：dev 的 HMR 要连 ws://127.0.0.1:5192，
 * connect-src 'none' 会把热更新打断；而生产产物零联网，禁掉 connect 才是对的。
 *
 * - style-src 允许 unsafe-inline：Vue 的 :style 与打包后的样式块需要；
 * - img-src 允许 data:/blob:：图标与画布资源可能是 data URI，且仍不引入外网；
 * - file: 给"直接打开 dist/index.html"的离线分发留后路（file:// 下 'self' 是不透明源）；
 * - 刻意不放 script-src unsafe-inline：产物没有内联脚本，加了等于白送 XSS 入口。
 */
export const CSP_DIRECTIVES = [
  `default-src 'self' file:`,
  `script-src 'self' file:`,
  `style-src 'self' 'unsafe-inline' file:`,
  `img-src 'self' data: blob: file:`,
  `font-src 'self' file:`,
  `connect-src 'none'`,
  `media-src 'self' file:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'none'`,
] as const;

export const CSP_POLICY = CSP_DIRECTIVES.join('; ');

/**
 * 交给 Vite 的 `transformIndexHtml` 用 **标签描述符** 注入，而不是自己拼字符串替换 `</head>`。
 *
 * 原因（踩过的坑）：`index.html` 的注释里只要出现 `</head>` 这个字面量，正则替换就会
 * 命中注释内部，把注入内容塞进注释、同时吃掉真正的 `</head>`，产物看起来"注入了"，
 * 实际整段被注释掉——dev 的 e2e 全绿，生产产物却是白屏。Vite 用 HTML parser 处理
 * `{ tag, attrs, injectTo }`，天然不会踩注释。
 */
export const CSP_TAG = {
  tag: 'meta',
  attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_POLICY },
  injectTo: 'head' as const,
};
