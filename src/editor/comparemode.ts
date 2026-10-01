// 状态栏的「对照」下拉：对照原图的几种方式合成一个选择——
//   排版稿：只看排版稿 / 并排原图 / 原图片段；核对视图：附近浮窗 / 原位叠加 / 仅原图。
//
// 它不另起状态，驱动的是原来那几个控件（`omrctl.ts` 的原图对照钮、并排钮、片段钮与叠加方式下拉，
// 都留在页面里、只是不显示）：它们的显隐照旧表示「这一项现在能不能用」，按下状态表示「开着没有」。
// 下拉的选中项与可选项都从它们读回来，别的入口（快捷键、读设置、识别完自动进核对视图）改了也跟得上。

export interface CompareControls {
  select: HTMLSelectElement;
  /** 整个下拉的外框（没有一项能用时藏起来） */
  field: HTMLElement;
  recognize: HTMLButtonElement;
  side: HTMLButtonElement;
  follow: HTMLButtonElement;
  view: HTMLSelectElement;
}

const OVERLAY = new Set(["floating", "inplace", "original"]);

export function setupCompareSelect(c: CompareControls): void {
  const body = document.getElementById("body");
  const inProof = () => !!body?.classList.contains("recognize");
  const pressed = (b: HTMLButtonElement) => b.getAttribute("aria-pressed") === "true";
  const usable = (b: HTMLButtonElement) => !b.hidden;
  const option = (v: string) => c.select.querySelector<HTMLOptionElement>(`option[value="${v}"]`);

  const current = (): string => {
    if (inProof()) return c.view.value;
    if (pressed(c.side)) return "side";
    if (pressed(c.follow)) return "follow";
    return "none";
  };

  const sync = () => {
    const proof = usable(c.recognize);
    const side = usable(c.side);
    const follow = usable(c.follow);
    for (const v of OVERLAY) {
      const o = option(v);
      if (o) o.disabled = !proof;
    }
    const s = option("side");
    if (s) s.disabled = !side;
    const f = option("follow");
    if (f) f.disabled = !follow;
    const any = proof || side || follow;
    if (c.field.hidden === any) c.field.hidden = !any;
    const v = current();
    if (c.select.value !== v) c.select.value = v;
  };

  c.select.addEventListener("change", () => {
    const v = c.select.value;
    if (OVERLAY.has(v)) {
      if (c.view.value !== v) {
        c.view.value = v;
        c.view.dispatchEvent(new Event("change"));
      }
      if (!inProof()) c.recognize.click();
    } else {
      if (inProof()) c.recognize.click();
      // 并排与片段在排版稿里二选一（并排开着时片段小窗是多余的）
      if (pressed(c.side) !== (v === "side")) c.side.click();
      if (pressed(c.follow) !== (v === "follow")) c.follow.click();
    }
    sync();
  });

  const watch = { attributes: true, attributeFilter: ["hidden", "aria-pressed"] };
  const mo = new MutationObserver(sync);
  for (const el of [c.recognize, c.side, c.follow]) mo.observe(el, watch);
  if (body) mo.observe(body, { attributes: true, attributeFilter: ["class"] });
  c.view.addEventListener("change", sync);
  sync();
}
