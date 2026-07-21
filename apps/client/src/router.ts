/**
 * Tiny screen router. Each screen is a function that builds its DOM into the
 * app root and may return a cleanup callback (to cancel timers / animation
 * frames). Navigating clears the previous screen and runs its cleanup first.
 *
 * No framework — just DOM. This keeps the whole app code-only and dependency-
 * light, which matters for the eventual Steam/mobile wrapping.
 */
export interface AppContext {
  root: HTMLElement;
  navigate: (screen: Screen) => void;
}

export type Screen = (ctx: AppContext) => void | (() => void);

export function createApp(root: HTMLElement): AppContext {
  let cleanup: void | (() => void);
  const ctx: AppContext = {
    root,
    navigate(screen) {
      if (cleanup) cleanup();
      root.replaceChildren();
      cleanup = screen(ctx);
    },
  };
  return ctx;
}

/** Small DOM helper: create an element with class/text/children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: {
    class?: string;
    text?: string;
    html?: string;
    onclick?: (e: MouseEvent) => void;
  } = {},
  children: (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;
  if (opts.onclick) node.onclick = opts.onclick;
  for (const child of children) if (child) node.appendChild(child);
  return node;
}
