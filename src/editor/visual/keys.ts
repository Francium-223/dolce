// 可视化编辑的**动作表**：快捷键、名字、说明只写这一份。
//
// 键盘分派（`controller.ts`）、帮助页的快捷键表（`help.ts`）、右键菜单与记号面板都从这里取，
// 加一个动作只改这张表加一个处理函数，几处不会脱节。
//
// **`/` 不绑定**：留给歌词对位（歌词录入模式要用它，见 `docs/待办.md`「可视化编辑的后续」）。

import { isTauriRuntime } from "../fileio";

/** 编辑模式 = 方块光标罩住元素；插入模式 = 竖线光标落在两个元素之间。
 *  **不单独存**：由代码区选区推出（非空 = 编辑，空 = 插入），两侧因此不会不同步。 */
export type VisualMode = "edit" | "insert";

export interface KeyBinding {
  /** `KeyboardEvent.key`（字符键按产生的字符认，`#` 就是 `#`） */
  key: string;
  /** 按物理键认（`Digit3`）：带 Alt 的组合一律这么认——Mac 上 Option+3 产生的字符是 `£`、欧洲键盘 Ctrl+Alt 是 AltGr */
  code?: string;
  shift?: boolean;
  /** Ctrl（Windows/Linux）或 ⌘（macOS） */
  mod?: boolean;
  /** Alt / Option。缺省不看 Alt（老绑定照旧） */
  alt?: boolean;
}

export type ActionGroup = "模式" | "移动与选择" | "音符" | "时值" | "记号" | "换行" | "编辑" | "小节" | "声部";

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
  /** 网页版另用的键（浏览器自己占着桌面版那组：Ctrl+G 查找下一个、Ctrl+L 地址栏、Ctrl/⌘+1–8 切标签……）；缺省两边一样 */
  web?: { keys: KeyBinding[]; keyText: string };
}

/** 网页版（不在 Tauri 外壳里）：取 `web` 那组键 */
const isWeb = (): boolean => !isTauriRuntime();

/** 这个动作在当前运行环境下的键 */
export function keysOf(a: VisualAction): KeyBinding[] {
  return isWeb() && a.web ? a.web.keys : a.keys;
}

/** 这个动作在当前运行环境下怎么写（菜单、面板提示用；帮助表两组都列） */
export function keyTextOf(a: VisualAction): string {
  return isWeb() && a.web ? a.web.keyText : a.keyText;
}

export const VISUAL_ACTIONS: readonly VisualAction[] = [
  { id: "mode.insert", label: "插入模式", group: "模式", keys: [{ key: "Insert" }, { key: "i" }], keyText: "Insert / i",
    modes: ["edit"], help: "方块光标变成竖线，落在选中元素的后面" },
  { id: "mode.edit", label: "编辑模式", group: "模式", keys: [{ key: "Escape" }], keyText: "Esc",
    modes: ["insert"], help: "竖线光标变成方块，罩住光标前面那个元素" },
  { id: "nav.prev", label: "前一个", group: "移动与选择", keys: [{ key: "ArrowLeft" }], keyText: "←",
    help: "编辑模式选中前一个元素；插入模式把光标往前挪一格" },
  { id: "nav.next", label: "后一个", group: "移动与选择", keys: [{ key: "ArrowRight" }], keyText: "→",
    help: "编辑模式选中后一个元素；插入模式把光标往后挪一格" },
  { id: "nav.extendPrev", label: "向前扩选", group: "移动与选择", keys: [{ key: "ArrowLeft", shift: true }], keyText: "Shift+←",
    help: "选区往前多罩一个元素" },
  { id: "nav.extendNext", label: "向后扩选", group: "移动与选择", keys: [{ key: "ArrowRight", shift: true }], keyText: "Shift+→",
    help: "选区往后多罩一个元素" },
  { id: "nav.measPrev", label: "上一小节", group: "移动与选择", keys: [{ key: "ArrowLeft", mod: true }], keyText: "Ctrl/⌘+←",
    help: "跳到本小节开头；已在开头就跳到上一小节开头（编辑模式选中那里的第一个元素，插入模式光标落在它前面）" },
  { id: "nav.measNext", label: "下一小节", group: "移动与选择", keys: [{ key: "ArrowRight", mod: true }], keyText: "Ctrl/⌘+→",
    help: "跳到下一小节开头" },
  { id: "nav.extendMeasNext", label: "向后扩选一小节", group: "移动与选择", keys: [{ key: "ArrowRight", mod: true, shift: true }], keyText: "Ctrl/⌘+Shift+→",
    help: "选区往后扩到下一小节末尾" },
  { id: "nav.extendMeasPrev", label: "向前扩选一小节", group: "移动与选择", keys: [{ key: "ArrowLeft", mod: true, shift: true }], keyText: "Ctrl/⌘+Shift+←",
    help: "选区往前扩到上一小节开头" },
  { id: "nav.gotoMeasure", label: "跳到小节…", group: "移动与选择", keys: [{ key: "g", mod: true }], keyText: "Ctrl/⌘+G",
    web: { keys: [{ key: "g", code: "KeyG", alt: true }], keyText: "Alt+G" },
    help: "输入小节号跳过去（多声部时在当前声部里数；小节号同右上角读数）" },
  { id: "sel.all", label: "全选", group: "移动与选择", keys: [{ key: "a", mod: true }], keyText: "Ctrl/⌘+A",
    help: "谱面有焦点时选中全曲（代码区有焦点时照旧全选文本）" },
  { id: "nav.home", label: "行首", group: "移动与选择", keys: [{ key: "Home" }], keyText: "Home",
    help: "跳到本行（到上一个换行符为止）的第一个元素" },
  { id: "nav.end", label: "行尾", group: "移动与选择", keys: [{ key: "End" }], keyText: "End",
    help: "跳到本行的最后一个元素" },
  { id: "note.digit", label: "唱名 / 休止", group: "音符",
    keys: ["0", "1", "2", "3", "4", "5", "6", "7"].map((key) => ({ key })), keyText: "1–7 · 0",
    help: "编辑模式改选中音符的唱名（八度、时值不变）；插入模式按当前时值插入一个音符" },
  { id: "note.letter", label: "音名", group: "音符",
    keys: ["a", "b", "c", "d", "e", "f", "g"].map((key) => ({ key })), keyText: "A–G",
    help: "按调号换成唱名（G 调里 G 是 1、F 是升 4 照调号不另写）。编辑模式改选中的音，八度取离原来那个音最近的；插入模式插一个音，八度取离前一个音最近的" },
  { id: "step.up", label: "音级升", group: "音符", keys: [{ key: "ArrowUp", alt: false }], keyText: "↑",
    help: "按调内音阶往上走一级（7 往上成高音 1），临时升降号去掉；选了一段整段一起走。插入模式改光标前刚插的那个音" },
  { id: "step.down", label: "音级降", group: "音符", keys: [{ key: "ArrowDown", alt: false }], keyText: "↓",
    help: "按调内音阶往下走一级（1 往下成低音 7）" },
  { id: "semi.up", label: "升半音", group: "音符", keys: [{ key: "ArrowUp", alt: true }], keyText: "Alt+↑",
    help: "升高半音：落在调内音上写本音，否则升号调写升号、降号调写降号（C 调往上写升号）" },
  { id: "semi.down", label: "降半音", group: "音符", keys: [{ key: "ArrowDown", alt: true }], keyText: "Alt+↓",
    help: "降低半音（C 调往下写降号）" },
  { id: "oct.up", label: "升高八度", group: "音符", keys: [{ key: "'" }, { key: "ArrowUp", mod: true }], keyText: "' / Ctrl/⌘+↑",
    help: "加一个高音点（或去掉一个低音点），选了一段就整段一起移；插入模式改光标前刚插的那个音" },
  { id: "oct.down", label: "降低八度", group: "音符", keys: [{ key: "," }, { key: "ArrowDown", mod: true }], keyText: ", / Ctrl/⌘+↓",
    help: "加一个低音点（或去掉一个高音点）" },
  { id: "acc.sharp", label: "升号", group: "音符", keys: [{ key: "#" }], keyText: "#",
    modes: ["edit"], help: "加升号，再按一次取消" },
  { id: "acc.flat", label: "降号", group: "音符", keys: [{ key: "b", shift: true }], keyText: "Shift+B",
    modes: ["edit"], help: "加降号，再按一次取消" },
  { id: "acc.natural", label: "还原号", group: "音符", keys: [{ key: "n" }], keyText: "n",
    modes: ["edit"], help: "加还原号，再按一次取消" },
  { id: "dur.halve", label: "时值减半", group: "时值", keys: [{ key: "_" }], keyText: "_",
    help: "编辑模式：有增时线先去掉一半，否则加一条减时线；插入模式：改「当前时值」" },
  { id: "dur.double", label: "时值加倍", group: "时值", keys: [{ key: "=" }], keyText: "=",
    help: "编辑模式：有减时线先去一条，否则拍数翻倍（加增时线）；插入模式：改「当前时值」" },
  { id: "dur.dot", label: "附点", group: "时值", keys: [{ key: "." }], keyText: ".",
    modes: ["edit"], help: "加上或去掉附点" },
  { id: "sus.add", label: "增时线", group: "时值", keys: [{ key: "-" }], keyText: "-",
    help: "编辑模式在选中音符后面加一条增时线；插入模式在光标处插入一条" },
  { id: "bar.insert", label: "小节线", group: "编辑", keys: [{ key: "|" }], keyText: "|",
    help: "在选中元素后面（插入模式：光标处）插入一根小节线" },
  { id: "brk.line", label: "换行", group: "换行", keys: [{ key: "Enter" }], keyText: "Enter",
    help: "在选中元素后面（插入模式：光标处）换行；这一行曲下的歌词跟着按对位格拆成两半" },
  { id: "brk.page", label: "换页", group: "换行", keys: [{ key: "Enter", shift: true }], keyText: "Shift+Enter",
    help: "同上，换页" },
  { id: "del.forward", label: "删除", group: "编辑", keys: [{ key: "Delete" }], keyText: "Delete",
    help: "编辑模式删掉选中的元素（音符连同它的增时线、和弦名、装饰；换行符删掉后两行并一行，歌词接起来）；插入模式删光标后面那个" },
  { id: "del.back", label: "退格", group: "编辑", keys: [{ key: "Backspace" }], keyText: "Backspace",
    help: "编辑模式同 Delete；插入模式删光标前面那个" },
  { id: "slur.toggle", label: "圆滑线", group: "记号", keys: [{ key: "s" }, { key: "(" }], keyText: "s / (",
    modes: ["edit"], help: "选区首尾两个音之间加上圆滑线；已有同样起止的就去掉" },
  { id: "tie.toggle", label: "延音线", group: "记号", keys: [{ key: "t" }], keyText: "t",
    modes: ["edit"], help: "选中的音与后面同音高的音之间加上或去掉延音线" },
  { id: "tuplet.toggle", label: "连音", group: "时值", keys: [{ key: "3", code: "Digit3", mod: true }], keyText: "Ctrl/⌘+3",
    web: { keys: [{ key: "3", code: "Digit3", alt: true, shift: true }], keyText: "Alt+Shift+3" },
    modes: ["edit"], help: "选中的几个音做成连音（选 3 个是三连音，按选中的个数），已经是一组就拆回去。123 写 (3: … )、ABC 写 (3、MusicXML 改时值比例" },
  { id: "deco.fermata", label: "延长号", group: "记号", keys: [{ key: "f", shift: true }], keyText: "Shift+F",
    modes: ["edit"], help: "选中的音加上或去掉延长号" },
  { id: "deco.accent", label: "重音", group: "记号", keys: [{ key: ">" }], keyText: ">",
    modes: ["edit"], help: "选中的音加上或去掉重音记号" },
  { id: "mark.next", label: "下一个记号", group: "记号", keys: [{ key: "Tab" }], keyText: "Tab",
    modes: ["edit"], help: "在选中音符挂的记号（和弦名、延长号等装饰、注记、圆滑线）之间轮换选中" },
  { id: "mark.prev", label: "上一个记号", group: "记号", keys: [{ key: "Tab", shift: true }], keyText: "Shift+Tab",
    modes: ["edit"], help: "反方向轮换" },
  { id: "chord.add", label: "加和弦音", group: "音符",
    keys: ["1", "2", "3", "4", "5", "6", "7"].map((d) => ({ key: d, code: `Digit${d}`, alt: true })), keyText: "Alt+1–7",
    modes: ["edit"], help: "往选中的音上叠一个音（唱名，放在最高音之上最近处），成为和弦。MusicXML 可用；Alt+点击和弦里的某个符头单独选中它、按 Delete 只删它" },
  { id: "voice.set", label: "声部", group: "声部",
    keys: ["1", "2", "3", "4"].map((d) => ({ key: d, code: `Digit${d}`, alt: true, mod: true })), keyText: "Ctrl+Alt+1–4",
    help: "插入模式下新插的音落在第几声部（同一谱表上的第二、三、四条旋律，符干各朝一边）。MusicXML 可用" },
  { id: "meas.append", label: "追加小节", group: "小节", keys: [{ key: "b", mod: true }], keyText: "Ctrl/⌘+B",
    help: "在曲末追加一个空小节（整小节休止），所有声部一起加" },
  { id: "meas.insert", label: "前插小节", group: "小节", keys: [{ key: "b", mod: true, shift: true }], keyText: "Ctrl/⌘+Shift+B",
    help: "在选中（光标所在）那一小节前面插一个空小节" },
  { id: "meas.delete", label: "删除小节", group: "小节", keys: [{ key: "Delete", mod: true }, { key: "Backspace", mod: true }], keyText: "Ctrl/⌘+Delete",
    help: "删掉选中的小节（选了几小节就删几小节）；MusicXML 所有声部一起删" },
  { id: "meas.key", label: "调号…", group: "小节", keys: [], keyText: "", help: "从这一小节起换调号：输入 1=G、G、bB、F# 之类" },
  { id: "meas.time", label: "拍号…", group: "小节", keys: [], keyText: "", help: "从这一小节起换拍号：输入 3/4、6/8 之类" },
  { id: "meas.tempo", label: "速度…", group: "小节", keys: [], keyText: "", help: "这一小节开头标速度：输入每分钟拍数（♩= 几），0 或留空去掉" },
  { id: "bar.single", label: "普通小节线", group: "小节", keys: [], keyText: "", help: "选中小节线（或所在小节的尾线）改回普通单线" },
  { id: "bar.double", label: "双小节线", group: "小节", keys: [], keyText: "", help: "所在小节的尾线改成双线" },
  { id: "bar.final", label: "终止线", group: "小节", keys: [], keyText: "", help: "所在小节的尾线改成终止线" },
  { id: "bar.repeatStart", label: "反复开始", group: "小节", keys: [], keyText: "", help: "所在小节的头线改成反复开始 |:" },
  { id: "bar.repeatEnd", label: "反复结束", group: "小节", keys: [], keyText: "", help: "所在小节的尾线改成反复结束 :|" },
  { id: "volta.1", label: "第一房", group: "小节", keys: [], keyText: "", help: "选中的小节标成第一房（再点一次去掉）" },
  { id: "volta.2", label: "第二房", group: "小节", keys: [], keyText: "", help: "选中的小节标成第二房（再点一次去掉）" },
  { id: "jump.segno", label: "𝄋 记号", group: "小节", keys: [], keyText: "", help: "这一小节开头标 segno（D.S. 跳回这里）" },
  { id: "jump.coda", label: "⊕ 尾声", group: "小节", keys: [], keyText: "", help: "这一小节开头标 coda" },
  { id: "jump.dc", label: "D.C.", group: "小节", keys: [], keyText: "", help: "这一小节末尾标 D.C.（从头反复）" },
  { id: "jump.ds", label: "D.S.", group: "小节", keys: [], keyText: "", help: "这一小节末尾标 D.S.（从 𝄋 处反复）" },
  { id: "jump.fine", label: "Fine", group: "小节", keys: [], keyText: "", help: "这一小节末尾标 Fine（反复后到此结束）" },
  { id: "view.formatMarks", label: "显示格式标记", group: "编辑", keys: [{ key: "m", mod: true, shift: true }], keyText: "Ctrl/⌘+Shift+M",
    help: "谱面上显示或隐藏换行符 ↵ 与换页符 ⤓（点一下即选中）" },
  { id: "edit.copy", label: "复制", group: "编辑", keys: [{ key: "c", mod: true }], keyText: "Ctrl/⌘+C",
    help: "复制选中的音（连同增时线、小节线）。谱面有焦点时才接管，代码区里照旧复制文本" },
  { id: "edit.cut", label: "剪切", group: "编辑", keys: [{ key: "x", mod: true }], keyText: "Ctrl/⌘+X",
    help: "复制后删掉" },
  { id: "edit.paste", label: "粘贴", group: "编辑", keys: [{ key: "v", mod: true }], keyText: "Ctrl/⌘+V",
    help: "插入模式贴在光标处，编辑模式贴在选区后面（不覆盖），贴完选中贴进来的那段。同一种格式原样贴；贴到别的格式只带音、增时线、小节线，按唱名走（换了调的照唱名）" },
  { id: "edit.repeat", label: "重复", group: "编辑", keys: [{ key: "r" }], keyText: "R",
    modes: ["edit"], help: "把选中的那段原样再贴一遍在后面，并选中新贴的——接着按 R 一直往后重复（不动剪贴板）" },
  { id: "lyric.entry", label: "歌词录入", group: "编辑", keys: [{ key: "l", mod: true }], keyText: "Ctrl/⌘+L",
    web: { keys: [{ key: "l", code: "KeyL", alt: true }], keyText: "Alt+L" },
    help: "在选中的音下面开一个框逐字填词：空格 / Tab 下一个音，- 连字符（接下一个音），_ 一字多音（跳过下一个音），/ 这个音不填，Shift+空格 上一个音，Enter 下一段，Esc 结束。一次打几个汉字自动一字一音往后分" },
  { id: "chord.entry", label: "和弦名录入", group: "编辑", keys: [{ key: "k", mod: true }], keyText: "Ctrl/⌘+K",
    web: { keys: [{ key: "k", code: "KeyK", alt: true }], keyText: "Alt+K" },
    help: "在选中的音上面开一个框填和弦名（C、Am7、G/B…）：空格填好跳到下一个音，Shift+空格 上一个，Enter 填好结束，Esc 放弃；清空 = 去掉和弦名" },
  { id: "text.entry", label: "文字", group: "编辑", keys: [{ key: "t", mod: true }], keyText: "Ctrl/⌘+T",
    web: { keys: [{ key: "t", code: "KeyT", alt: true }], keyText: "Alt+T" },
    help: "在选中的音上方加一段文字（渐慢、副歌、反复两遍……），已有的改它；清空 = 去掉" },
  { id: "dyn.entry", label: "力度", group: "编辑", keys: [{ key: "e", mod: true }], keyText: "Ctrl/⌘+E",
    web: { keys: [{ key: "e", code: "KeyE", alt: true }], keyText: "Alt+E" },
    help: "给选中的音标力度（p、mp、mf、f、ff、sfz……）：空格填好跳到下一个音，Enter 结束；清空 = 去掉" },
  { id: "edit.transpose", label: "移调…", group: "编辑", keys: [], keyText: "",
    help: "全曲换调（简谱唱名不变、只改调号；ABC、MusicXML 的音一起移），或选中的音移几个半音" },
  { id: "edit.undo", label: "撤销", group: "编辑", keys: [{ key: "z", mod: true }], keyText: "Ctrl/⌘+Z",
    help: "与代码区共用同一份撤销记录" },
  { id: "edit.redo", label: "重做", group: "编辑", keys: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }], keyText: "Ctrl/⌘+Shift+Z",
    help: "同上" },
];

/** 按下的键对应哪个动作（没有返回 null）。 */
export function actionOfKey(ev: KeyboardEvent): VisualAction | null {
  return keyHit(ev)?.action ?? null;
}

/** 按下的键对应哪个动作、以及它代表的字符（按物理键认的绑定给 `KeyBinding.key`，不是 Option 打出来的 `£`）。 */
export function keyHit(ev: KeyboardEvent): { action: VisualAction; key: string } | null {
  const mod = ev.ctrlKey || ev.metaKey;
  // 字母键带 Shift 时 `key` 是大写，统一按小写比
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  // 先认按物理键的（Alt 组合）：Windows 上 Alt+1 的 `key` 仍是「1」，先走字符那一轮就被当成改唱名
  for (const a of VISUAL_ACTIONS) {
    for (const k of keysOf(a)) {
      if (!k.code || ev.code !== k.code || !!k.mod !== mod || !!k.alt !== ev.altKey || !!k.shift !== ev.shiftKey) continue;
      return { action: a, key: k.key };
    }
  }
  for (const a of VISUAL_ACTIONS) {
    for (const k of keysOf(a)) {
      if (k.code) continue;
      if (k.alt !== undefined && k.alt !== ev.altKey) continue;
      // 没写 alt 的字母键、方向键等不认 Alt 组合（Alt+C 不是改音名 C）；符号键放过——有的键盘布局要 AltGr / Option 才打得出
      if (k.alt === undefined && ev.altKey && (k.key.length > 1 || /[a-z]/i.test(k.key))) continue;
      if (k.key.toLowerCase() !== key.toLowerCase()) continue;
      if (!!k.mod !== mod) continue;
      // 符号键（`#`、`(`、`|`）本身就要按 Shift 才打得出，不看 Shift
      const shiftMatters = k.key.length > 1 || /[a-z]/i.test(k.key);
      if (shiftMatters && !!k.shift !== ev.shiftKey) continue;
      return { action: a, key: ev.key };
    }
  }
  return null;
}
