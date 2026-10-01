// 可视化编辑的**动作表**：快捷键、名字、说明只写这一份。
//
// 键盘分派（`controller.ts`）、帮助页的快捷键表（`help.ts`）、右键菜单与记号面板都从这里取，
// 加一个动作只改这张表加一个处理函数，几处不会脱节。
//
// **`/` 不绑定**：留给歌词对位（歌词录入模式要用它，见 `docs/待办.md`「可视化编辑的后续」）。

import { t, type MsgKey } from "../../i18n";

/** 编辑模式 = 方块光标罩住元素；插入模式 = 竖线光标落在两个元素之间。
 *  **不单独存**：由代码区选区推出（非空 = 编辑，空 = 插入），两侧因此不会不同步。 */
export type VisualMode = "edit" | "insert";

export interface KeyBinding {
  /** `KeyboardEvent.key`（字符键按产生的字符认，`#` 就是 `#`） */
  key: string;
  shift?: boolean;
  /** Ctrl（Windows/Linux）或 ⌘（macOS） */
  mod?: boolean;
}

export type ActionGroup = "mode" | "nav" | "note" | "dur" | "mark" | "brk" | "edit";

/** 分组显示名（界面语言）。 */
export const groupLabel = (g: ActionGroup): string => t(`va.group.${g}`);

export interface VisualAction {
  id: string;
  label: string;
  group: ActionGroup;
  keys: KeyBinding[];
  /** 帮助与菜单里怎么写这组键 */
  keyText: string;
  /** 哪种模式下可用；缺省两种都行 */
  modes?: VisualMode[];
  /** 一句话说明（帮助页用） */
  help: string;
}

/** 名字与说明按界面语言取（键 `va.<id>.label` / `va.<id>.help`，见 i18n/zh.ts）。 */
function act(a: Omit<VisualAction, "label" | "help">): VisualAction {
  return {
    ...a,
    get label() { return t(`va.${a.id}.label` as MsgKey); },
    get help() { return t(`va.${a.id}.help` as MsgKey); },
  };
}

const RAW_ACTIONS: readonly Omit<VisualAction, "label" | "help">[] = [
  { id: "mode.insert", group: "mode", keys: [{ key: "Insert" }, { key: "i" }], keyText: "Insert / i",
    modes: ["edit"] },
  { id: "mode.edit", group: "mode", keys: [{ key: "Escape" }], keyText: "Esc",
    modes: ["insert"] },
  { id: "nav.prev", group: "nav", keys: [{ key: "ArrowLeft" }], keyText: "←" },
  { id: "nav.next", group: "nav", keys: [{ key: "ArrowRight" }], keyText: "→" },
  { id: "nav.extendPrev", group: "nav", keys: [{ key: "ArrowLeft", shift: true }], keyText: "Shift+←" },
  { id: "nav.extendNext", group: "nav", keys: [{ key: "ArrowRight", shift: true }], keyText: "Shift+→" },
  { id: "nav.home", group: "nav", keys: [{ key: "Home" }], keyText: "Home" },
  { id: "nav.end", group: "nav", keys: [{ key: "End" }], keyText: "End" },
  { id: "note.digit", group: "note",
    keys: ["0", "1", "2", "3", "4", "5", "6", "7"].map((key) => ({ key })), keyText: "1–7 · 0" },
  { id: "oct.up", group: "note", keys: [{ key: "ArrowUp" }, { key: "'" }], keyText: "↑ / '",
    modes: ["edit"] },
  { id: "oct.down", group: "note", keys: [{ key: "ArrowDown" }, { key: "," }], keyText: "↓ / ,",
    modes: ["edit"] },
  { id: "acc.sharp", group: "note", keys: [{ key: "#" }], keyText: "#",
    modes: ["edit"] },
  { id: "acc.flat", group: "note", keys: [{ key: "b" }], keyText: "b",
    modes: ["edit"] },
  { id: "acc.natural", group: "note", keys: [{ key: "n" }], keyText: "n",
    modes: ["edit"] },
  { id: "dur.halve", group: "dur", keys: [{ key: "_" }], keyText: "_" },
  { id: "dur.double", group: "dur", keys: [{ key: "=" }], keyText: "=" },
  { id: "dur.dot", group: "dur", keys: [{ key: "." }], keyText: ".",
    modes: ["edit"] },
  { id: "sus.add", group: "dur", keys: [{ key: "-" }], keyText: "-" },
  { id: "bar.insert", group: "edit", keys: [{ key: "|" }], keyText: "|" },
  { id: "brk.line", group: "brk", keys: [{ key: "Enter" }], keyText: "Enter" },
  { id: "brk.page", group: "brk", keys: [{ key: "Enter", shift: true }], keyText: "Shift+Enter" },
  { id: "del.forward", group: "edit", keys: [{ key: "Delete" }], keyText: "Delete" },
  { id: "del.back", group: "edit", keys: [{ key: "Backspace" }], keyText: "Backspace" },
  { id: "slur.toggle", group: "mark", keys: [{ key: "s" }, { key: "(" }], keyText: "s / (",
    modes: ["edit"] },
  { id: "tie.toggle", group: "mark", keys: [{ key: "t" }], keyText: "t",
    modes: ["edit"] },
  { id: "deco.fermata", group: "mark", keys: [{ key: "f" }], keyText: "f",
    modes: ["edit"] },
  { id: "deco.accent", group: "mark", keys: [{ key: ">" }], keyText: ">",
    modes: ["edit"] },
  { id: "mark.next", group: "mark", keys: [{ key: "Tab" }], keyText: "Tab",
    modes: ["edit"] },
  { id: "mark.prev", group: "mark", keys: [{ key: "Tab", shift: true }], keyText: "Shift+Tab",
    modes: ["edit"] },
  { id: "view.formatMarks", group: "edit", keys: [{ key: "m", mod: true, shift: true }], keyText: "Ctrl/⌘+Shift+M" },
  { id: "edit.undo", group: "edit", keys: [{ key: "z", mod: true }], keyText: "Ctrl/⌘+Z" },
  { id: "edit.redo", group: "edit", keys: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }], keyText: "Ctrl/⌘+Shift+Z" },
];

export const VISUAL_ACTIONS: readonly VisualAction[] = RAW_ACTIONS.map(act);

/** 按下的键对应哪个动作（没有返回 null）。 */
export function actionOfKey(ev: KeyboardEvent): VisualAction | null {
  const mod = ev.ctrlKey || ev.metaKey;
  // 字母键带 Shift 时 `key` 是大写，统一按小写比
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  for (const a of VISUAL_ACTIONS) {
    for (const k of a.keys) {
      if (k.key.toLowerCase() !== key.toLowerCase()) continue;
      if (!!k.mod !== mod) continue;
      // 符号键（`#`、`(`、`|`）本身就要按 Shift 才打得出，不看 Shift
      const shiftMatters = k.key.length > 1 || /[a-z]/i.test(k.key);
      if (shiftMatters && !!k.shift !== ev.shiftKey) continue;
      return a;
    }
  }
  return null;
}
