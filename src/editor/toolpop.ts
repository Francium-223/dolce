// 工具栏、顶栏的弹出层：点开关钮在它下方展开，点外面、按 Esc、点了里面的按钮就收起。
//
// 面板用 `position: fixed` 定位——工具栏是横向可滚的（`overflow-x: auto`），绝对定位的下拉会被它裁掉。
// 面板里的元素照旧带自己的 id 与显隐逻辑（识别那几项按上下文 `hidden`），这里只管开合；
// `autoHide` 时里面一项可见的都没有，开关钮也藏起来。

export interface PopoverOptions {
  /** 面板里没有可见的 `[data-context-control]` 时把开关钮藏起来。 */
  autoHide?: boolean;
}

export function setupPopover(toggle: HTMLButtonElement, panel: HTMLElement, opts: PopoverOptions = {}): void {
  const isOpen = () => panel.classList.contains("open");
  const place = () => {
    const r = toggle.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    panel.style.top = `${r.bottom + 4}px`;
  };
  const close = () => {
    if (!isOpen()) return;
    panel.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    panel.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    place();
  };
  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (isOpen()) close();
    else open();
  });
  // 点了里面的按钮（动作已经交给它自己的监听）就收起；下拉框要留着让人选
  panel.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("button")) close();
  });
  panel.addEventListener("change", close);
  document.addEventListener("pointerdown", (ev) => {
    const t = ev.target as Node;
    if (isOpen() && !panel.contains(t) && !toggle.contains(t)) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });
  window.addEventListener("resize", close);
  if (opts.autoHide) {
    const sync = () => {
      const any = !!panel.querySelector("[data-context-control]:not([hidden])");
      toggle.hidden = !any;
      if (!any) close();
    };
    new MutationObserver(sync).observe(panel, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    sync();
  }
}
