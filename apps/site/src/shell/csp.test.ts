import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, CSP_POLICY, CSP_TAG } from './csp';

describe('CSP 策略', () => {
  it('覆盖 docs/02 §16.1 要求的指令', () => {
    for (const directive of ["default-src 'self'", "img-src 'self' data:", "object-src 'none'", "base-uri 'self'"]) {
      expect(CSP_POLICY).toContain(directive);
    }
    expect(CSP_POLICY).toContain("connect-src 'none'");
    expect(CSP_POLICY).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('不放行内联脚本（构建产物没有内联脚本）', () => {
    const scriptSrc = CSP_DIRECTIVES.find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('每条指令都带来源，不会写出空指令', () => {
    for (const directive of CSP_DIRECTIVES) {
      expect(directive.split(' ').length).toBeGreaterThan(1);
    }
  });
});

describe('CSP_TAG', () => {
  it('交给 Vite 的是标签描述符，而不是自己拼字符串替换 head', () => {
    // 事故背景：早期实现用正则替换 </head>，index.html 注释里一旦出现该字面量，
    // 注入就会落进注释、吃掉真正的 head 结束标签，生产产物白屏。
    // 用标签描述符让 Vite 的 HTML parser 负责插入，从根上避免这类"文本层面"的注入。
    expect(CSP_TAG.tag).toBe('meta');
    expect(CSP_TAG.injectTo).toBe('head');
    expect(CSP_TAG.attrs['http-equiv']).toBe('Content-Security-Policy');
    expect(CSP_TAG.attrs.content).toBe(CSP_POLICY);
  });
});
