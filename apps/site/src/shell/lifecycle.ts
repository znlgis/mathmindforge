export function safeRemove(node: HTMLElement | null): void {
  if (node) node.innerHTML = '';
}
