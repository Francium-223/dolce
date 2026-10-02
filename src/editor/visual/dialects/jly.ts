// jianpu-ly 的可视化编辑方言（`editor/visual/dialect.ts::EditDialect`）。
//
// 与 `dialects/j123.ts` 的差别，逐条对着上游 README（v1.890）写：
//   · **词内顺序无关**（`#1`=`1#`、`'1`=`1'`、`s1`=`1s`）——所以读的时候按字符归类，不按固定位置。
//   · **时值是字母**：`q`=8分、`s`=16分、`d`=32分、`h`=64分、无字母=4分（123 用 `_` 减时线）。
//     规范写法（写回时用）：**字母在音高之前**（`s1.`），与 README 的 `s1. q1. 1.` 同形。
//   · **连音是 `3[ … ]`**（123 是 `(3: … )`）——方括号成组，收尾是 `]`。
//   · **装饰写 `\名字` 且在音符之后**（LilyPond 原样透传）；力度（`\mf`）同理。
//   · **行结构不是语义**（README：普通文本文件以空格分隔）→ **换行就写真换行**，
//     绝不写 123 那个 `$`（jianpu-ly 不认它，写进去就是往谱里塞垃圾 ✗）。
//   · 增时线是**独立 token** `-`（与 123 同）✓。

import { BARE_CHORD_RE } from "../../../abcfamily/dialect123";
import type { Accidental } from "../../../model/doc";
import { dotsRange, type EditDialect, type NoteDuration, type NoteToken } from "../dialect";

const ACC_OF: Record<string, Accidental> = {
  "#": "sharp", b: "flat", n: "natural", "##": "double-sharp", bb: "double-flat",
};
const ACC_TEXT: Partial<Record<Accidental, string>> = {
  sharp: "#", flat: "b", natural: "n", "double-sharp": "##", "double-flat": "bb",
};

/** 减时线条数 ↔ 字母（README：`s` 十六分、`q` 八分、`d` 三十二分、`h` 六十四分；0 = 四分）。 */
const LETTER_BY_BEAMS: readonly string[] = ["", "q", "s", "d", "h"];
const BEAMS_BY_LETTER: Readonly<Record<string, number>> = { q: 1, s: 2, d: 3, h: 4 };

/** 一个词里的音符：变音 / 数字 / 八度 / 字母时值 / 附点，**顺序任意**（重复或认不出的字符 → null）。 */
function scan(src: string): { acc: Accidental | null; degree: number; octave: number; beams: number; dots: number } | null {
  let acc: Accidental | null = null;
  let degree: number | null = null;
  let octave = 0;
  let beams = 0;
  let dots = 0;
  for (let i = 0; i < src.length;) {
    const two = src.slice(i, i + 2);
    const ch = src[i]!;
    if (!acc && ACC_OF[two]) { acc = ACC_OF[two]!; i += 2; continue; }
    if (ACC_OF[ch] && !acc) { acc = ACC_OF[ch]!; i += 1; continue; }
    if (ch === "'") { octave++; i++; continue; }
    if (ch === ",") { octave--; i++; continue; }
    if (ch === ".") { dots++; i++; continue; }
    if (BEAMS_BY_LETTER[ch] !== undefined && beams === 0) { beams = BEAMS_BY_LETTER[ch]!; i++; continue; }
    if (/[0-7]/.test(ch) && degree === null) { degree = Number(ch); i++; continue; }
    return null;
  }
  if (degree === null) return null;
  return { acc, degree, octave, beams, dots };
}

export const DIALECT_JLY: EditDialect = {
  parseNote(src) {
    const t = scan(src);
    if (!t) return null;
    return {
      acc: t.degree === 0 ? null : t.acc,
      degree: t.degree,
      octave: t.octave,
      halvings: t.beams,
      dots: t.dots,
      pre: "",
      post: "",
      inlineSustains: 0,
    };
  },
  /** 规范写法：`字母 + 变音 + 数字 + 八度 + 附点`（与 README 的 `s1.` 同形）。 */
  printNote(t: NoteToken) {
    const acc = t.acc && t.degree !== 0 ? ACC_TEXT[t.acc] ?? "" : "";
    const oct = t.octave > 0 ? "'".repeat(t.octave) : ",".repeat(-t.octave);
    const letter = LETTER_BY_BEAMS[t.halvings] ?? "";
    return `${t.pre}${letter}${acc}${t.degree}${oct}${".".repeat(t.dots)}${t.post}`;
  },
  noteParts(src) {
    const t = scan(src);
    if (!t) return null;
    // 音头 = 到附点之前（含字母/变音/数字/八度）；附点是末尾那一串 `.`
    const dotsStart = src.length - t.dots;
    const dots = dotsRange(".".repeat(t.dots), Math.max(0, dotsStart));
    return { head: [0, Math.max(0, dotsStart)], dots: dots ?? [dotsStart, src.length] };
  },
  newNote(degree: number, dur: NoteDuration) {
    const letter = LETTER_BY_BEAMS[dur.halvings] ?? "";
    return `${letter}${degree}${".".repeat(dur.dots)}`;
  },
  /** 超过 4 条减时线（64 分）jianpu-ly 的字母就写不出来了 —— 如实拒绝，别硬写。 */
  validate(t) {
    if (t.halvings > 4) return "jianpu-ly 的时值字母只到 64 分（`h`），再短写不出来";
    return null;
  },
  // 装饰与力度走 LilyPond 原样指令，**写在音符之后**（`1 \fermata`）
  deco: { names: { fermata: "fermata", accent: "accent" }, text: (n) => `\\${n}`, place: "after" },
  annotationText: (t) => `^"${t}"`,
  dynamicText: (n) => `\\${n}`,
  // 连音：`3[ q1 q1 q1 ]`（与 123 的 `(3: … )` 不同）
  tuplet: { open: (n) => `${n}[ `, close: " ]", openRe: /\d+\[\s*$/ },
  sustain: "token",
  sep: " ",
  barline: "|",
  // **不是 `$`**：jianpu-ly 的行就是普通的换行，写 `$` 它不认（见文件头）。
  lineBreak: "\n",
  pageBreak: "\n",
  slurOpen: "(",
  slurClose: ")",
  slurInToken: false,
  slurNesting: true,
  lyricsFollowBreaks: true,
};

/** 和弦名：jianpu-ly 的 `chords=` 是单独一行、本版不收，所以**不给** `chordText`（改动请在源码里做）。 */
export const JLY_CHORD_UNSUPPORTED = BARE_CHORD_RE;
