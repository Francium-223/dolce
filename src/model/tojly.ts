// jianpu-ly 写出端：把当前谱**导出成 jianpu-ly 文本**，交给上游 `jianpu-ly` 预处理器生成 LilyPond。
//
// 上游: https://github.com/ssb22/jianpu-ly （Silas S. Brown，Apache-2.0）。
// **目标语法只有一个：上游的那一套**（以它 `--markdown --chinese` 生成的 README 为准，v1.890）：
//   音符 `1`–`7`、八度 `'`/`,`（`1' 1'' 1, 1,,`）、变音 `#1 b2 n3`、
//   时值 `s`=16分 `q`=8分 无字母=4分 `d`=32分 `h`=64分、附点 `.`、
//   **半音符及以上写增时线** `1 -`（附点二分 `1 - -`、全音符 `1 - - -`）、休止 `0`、
//   连音 `3[ q1 q1 q1 ]`、前倚音 `g[#45] 1`、圆滑线 `( )`、延音线 `~`、
//   文字 `^"上方"`、LilyPond 指令 `\fermata`/`\bar "||"`/`\pageBreak` 原样透传、
//   拍号 `4/4`、调号 `1=Bb`（大调）、歌词 `L:`（拉丁音节）/`H:`（汉字）、注释 `%`。
//
// ⚠ **不要混淆方言**：jianpu-db（语料站）的曲谱文件只是 jianpu-ly 的**一种方言** ——
//   它多出 `%<文件名>`、`status=`、`source=`、`%--`、`subtitle=`、以及**收尾的 `%END`**。
//   那些**不是**上游语法，这里一律**不写**（曾经照语料样本抄过 `%END`，是错的）。
//   判断依据永远是上游 README，而不是某份语料样本。
//
// **输入形状**：只经简谱引擎的输入接口（`layout/input.ts` 的 `JScore`），由 `model/jianpuinput.ts`
// 从 `ScoreDoc` 投影出来——与 `tojpw.ts` 同一条原则：写出端不认 `ScoreDoc` 的类，口径与谱面一致。
//
// **单向导出**：不承诺能把 jianpu-ly 文本再读回编辑器（回读要另加方言与高亮，见 `docs/模块/导出.md`）。
// 装不下的东西走 `warnings` 报出来（多声部、和弦符号、演奏法、反复跳跃…），**不静默丢**。
//
// ⚠ 关于语言：`warnings` 是**写进导出文件里的 `%` 注释**，不是界面文字，所以不走 `t()`
//   （`CLAUDE.md` 那条约束的是界面；123 格式本身也写中文，如 `标题：奇异恩典`）。
//   真要让界面提示，调用方可以自己 `t()`——`capability.ts` 的 losses 就是那种结构化形态。

import type { JChord, JMeasure, JNote, JScore } from "../layout/input";
import type { ScoreDoc } from "./doc";
import { jianpuInputOfDoc, jianpuInputOfJpw } from "./jianpuinput";

/** 导出结果：文本 + 装不下的东西（调用方拿去提示）。 */
export interface JlyExport {
  text: string;
  warnings: string[];
}

// ───────────────────────── 基础映射 ─────────────────────────

/** 减时线条数 → 时值字母（0 条即四分音符，不写字母）。 */
const BEAM_LETTER: readonly string[] = ["", "q", "s", "d", "h"];

/** 调号 `fifths` → 大调主音名（jianpu-ly 的 `1=<名>`）。 */
const MAJOR_BY_FIFTHS: Readonly<Record<number, string>> = {
  [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
};

/** 变音记号：引擎输入用**一个空格**表示"没有记号"（`jianpuinput.ts` 里是 `?? " "`），
 *  不能原样拼进 token —— 那会写出 `q 1`、`q 1` 之间多个空格，上游直接把字母和数字读成两个词。 */
const alterOf = (jpAlter: string): string => (jpAlter || "").trim();

const octaveMarks = (jpOctave: number): string =>
  jpOctave > 0 ? "'".repeat(jpOctave) : ",".repeat(-jpOctave);

/** 音高：变音 + 数字 + 八度。 */
const pitchOf = (n: JNote): string => alterOf(n.jpAlter) + n.number + octaveMarks(n.jpOctave);

/** 时值字母 + 音高 + 附点（README 的写法：`s1.`）。 */
const noteOf = (n: JNote, letter: string, dots: string): string => letter + pitchOf(n) + dots;

/** 休止或和弦。和弦按 README 的 `,135'` 写法：`,` 起头。 */
function chordBody(c: JChord, letter: string, dots: string): string {
  if (c.rest || c.notes.length === 0) return letter + "0" + dots;
  if (c.notes.length === 1) return noteOf(c.notes[0]!, letter, dots);
  const inner = c.notes.map((n) => alterOf(n.jpAlter) + n.number + octaveMarks(n.jpOctave)).join("");
  return "," + inner + dots;
}

/** 增时线：`beats` 里的 1 表示没有，多出来的每一拍一个 `-`（**前面留空格**，上游 #134 就是修这个）。 */
function sustainOf(c: JChord): string {
  const n = Math.max(0, (c.beats || 1) - 1);
  return n ? " " + Array(n).fill("-").join(" ") : "";
}

function ornamentsBefore(c: JChord): string {
  let out = "";
  if (c.notes.some((n) => n.tupletBegin)) out += "3[ ";      // ✗ 连音记号挂在 JNote 上（引擎输入如此）
  if (c.graceNotes.length) {
    // ⚠ 倚音组内**不能有空格**：上游是 `g[#45] 1`（连写）。我第一版写成 `g[#4 b5]`，
    //    真 jianpu-ly 直接报 `Unrecognised command g[#4`。这条是拿真工具跑出来的，不是猜的。
    out += "g[" + c.graceNotes.map((g) => alterOf(g.jpAlter) + g.number + octaveMarks(g.jpOctave)).join("") + "] ";
  }
  if (c.slurStart) out += "( ";
  return out;
}

/** 跳转记号用 jianpu-ly 的**裸词**（`Fine`/`DC`/`Segno`/`ToCoda`/`DS`），其余当谱上文字。 */
const BARE_DIRECTION = /^(Fine|D\.?C\.?|Segno|ToCoda|D\.?S\.?)$/i;

function ornamentsAfter(c: JChord): string {
  let out = "";
  for (let i = 0; i < (c.slurEnds || 0); i++) out += " )";
  if (c.notes.some((n) => n.tupletEnd)) out += " ]";
  if (c.fermata) out += " \\fermata";
  for (const d of c.directions) {
    const text = d.text.trim();
    if (!text) continue;
    out += BARE_DIRECTION.test(text) ? " " + text : ' ^"' + text.replace(/"/g, "'") + '"';
  }
  return out;
}

// ───────────────────────── 谱头 / 歌词 ─────────────────────────

const HEADER_TYPES = new Set(["subtitle", "composer", "poet", "arranger", "copyright", "opus"]);

function headerLines(score: JScore, first: JMeasure | null): string[] {
  const out: string[] = [];
  if (score.title) out.push("title=" + score.title.replace(/\n/g, " "));
  const seen = new Set<string>();
  for (const cr of score.credit) {
    const type = (cr.type || "").toLowerCase();
    if (!HEADER_TYPES.has(type) || !cr.text || seen.has(type)) continue;
    seen.add(type);
    out.push(type + "=" + cr.text.replace(/\n/g, " "));
  }
  const key = first ? MAJOR_BY_FIFTHS[first.key.fifths] : undefined;
  if (key) out.push("1=" + key);
  if (first) out.push(first.time.beats + "/" + first.time.beatType);
  return out;
}

/** 逐段收集歌词。引擎输入的 `JLyric` **不带 `syllabic`**（那个字段只在模型层），所以拉丁歌词
 *  只能按空格分音节写；`L:` 的连字符（jianpu-ly 的 `syl- la- bles`）留待后续，先报出来。 */
function lyricLines(measures: readonly JMeasure[], warnings: Set<string>): string[] {
  const verses = new Map<number, { latin: string[]; han: string[] }>();
  const order: number[] = [];
  for (const m of measures) {
    for (const e of m.entries) {
      if (e.kind !== "chord") continue;
      const seen = new Set<number>();          // 一个和弦里只取一次（歌词挂在首音上）
      for (const n of (e as JChord).notes) {
        for (const ly of n.lyrics) {
          if (!ly.text || seen.has(ly.number)) continue;
          seen.add(ly.number);
          if (!verses.has(ly.number)) { verses.set(ly.number, { latin: [], han: [] }); order.push(ly.number); }
          const han = isHan(ly.text);
          if (!han) warnings.add("拉丁歌词的连字符（`syl- la- bles`）尚未导出，按空格分音节写出");
          (han ? verses.get(ly.number)!.han : verses.get(ly.number)!.latin).push(ly.text);
        }
      }
    }
  }
  const out: string[] = [];
  for (const v of order) {
    const slot = verses.get(v)!;
    if (slot.latin.length) out.push("L: " + slot.latin.join(" "));
    if (slot.han.length) out.push("H: " + slot.han.join(""));
  }
  return out;
}

const isHan = (text: string): boolean => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);

// ───────────────────────── 主流程 ─────────────────────────

/** 纯函数：简谱输入形状 → jianpu-ly 文本。`warnings` 由调用方传入并去重。 */
export function emitJlyOfScore(score: JScore, warnings: Set<string> = new Set()): string {
  const measures = score.parts[0]?.measures ?? [];
  const lines: string[] = headerLines(score, measures[0] ?? null);

  // 行的累加器是**函数级**的：一行可以跨多个小节（源谱一行四小节是常事），
  // 只有遇到源谱的换行（`JBreak`）才收一行。第一版把它放在小节循环里，
  // 于是"一行四小节"变成了"一小节一行"；去掉每小节 flush 之后更糟——整小节内容被丢掉，
  // 真 jianpu-ly 直接报 `No jianpu in score`。两处都是端到端跑出来的。
  let tokens: string[] = [];
  const flush = (): void => { if (tokens.length) { lines.push(tokens.join(" ")); tokens = []; } };

  for (const m of measures) {
    // 拍号/调号变更各占一行（jianpu-ly 里它们本来就是行内 token）——
    // ⚠ 只有**真的**变更才 flush，别写成 `if (m.index > 0) { flush(); … }`：
    //   那等于每小节都换行，源谱"一行四小节"就被拆散了（第三处、也是最后一处同类错误）。
    if (m.timeChange) { flush(); lines.push(m.time.beats + "/" + m.time.beatType); }
    if (m.keyChange) {
      const tonic = MAJOR_BY_FIFTHS[m.key.fifths];
      if (tonic) { flush(); lines.push("1=" + tonic); }
    }
    if (m.repeatForward) { flush(); tokens.push('\\bar ".|:"'); }
    for (const e of m.entries) {
      if (e.kind === "chord") {
        const c = e as JChord;
        if (c.beams >= BEAM_LETTER.length) warnings.add("有超过 4 条减时线（64 分）的时值，已按 64 分写出");
        if (c.harmony) warnings.add("和弦符号（`chords=` 行）尚未导出");
        if (c.articulations.length) warnings.add("演奏法记号尚未导出：" + c.articulations.join(" "));
        const dots = ".".repeat(c.dot || 0);
        tokens.push(ornamentsBefore(c) + chordBody(c, BEAM_LETTER[c.beams] ?? "", dots) + sustainOf(c) + ornamentsAfter(c));
        if (c.notes.some((n) => n.tieStart)) tokens.push("~");       // 延音线写在两音之间
      } else if (e.kind === "break") {
        flush();                                                     // 源谱的换行就是 jianpu-ly 的行
        if ((e as { newPage?: boolean }).newPage) lines.push("\\pageBreak");
      }
    }
    if (m.endingNum && m.endingNum.size) warnings.add("反复跳跃（`R{ } A{ }`）尚未导出，已退化为普通小节线");
    tokens.push(m.repeatBackward ? '\\bar ":|."' : "|");
  }
  flush();                                                           // 收尾那一行

  const lyrics = lyricLines(measures, warnings);
  if (lyrics.length) lines.push(...lyrics);
  // 装不下的东西**写进文件本身**当注释（上游 README：「忽略：`% 注释`」）：提示随文件走，
  // 既不静默丢，也不用为它新开一条界面提示通道。空集合时一行都不加。
  const notes = [...warnings].map((w) => "% " + w);
  // ⚠ **不要写 `%END`**：那是 **jianpu-db 语料**的收尾约定，不是上游 jianpu-ly 的语法
  //   （jianpu-db 的曲谱只是 jianpu-ly 的**一种方言**）。导出目标永远是上游语法，
  //   语料那套（`%<文件名>` / `status=` / `source=` / `%--` / `subtitle=` / `%END`）一律不写。
  return [...notes, ...lines].filter((l) => l.trim() !== "").join("\n") + "\n";
}

/** `ScoreDoc` → jianpu-ly 文本。投影不出来时抛错（与其它写出端一致，调用方翻成界面文案）。
 *
 *  **两种输入形状都收**（与 `tojpw.ts` 同一套口径）：`caps.layout === "scoredoc"` 的那几种
 *  （文本谱 / 123 / ABC / MusicXML）走 `jianpuInputOfDoc`，`.jpwabc` 走 `jianpuInputOfJpw`。
 *  第一版只用了前者，于是 `.jpwabc` 文档会抛 `noLines` ✗（是端到端点出来的）。 */
export function emitJly(doc: ScoreDoc): JlyExport {
  const warnings = new Set<string>();
  const score = jianpuInputOfDoc(doc) ?? jianpuInputOfJpw(doc);
  if (!score) throw new Error("noLines");
  if (score.parts.length > 1) {
    warnings.add("多声部：jianpu-ly 导出只写第一声部（共 " + score.parts.length + " 个）");
  }
  // ⚠ 同一 part 里的多声部**不能靠投影结果判**：`jianpuInputOfDoc` 在读每个小节时就
  //   `voice <= 1` 过滤掉了（`jianpuinput.ts` 的「读完一小节」那步），投影出来恒为单声部。
  //   所以回到 `ScoreDoc` 上数，否则第 2 及以后的声部会被**静默丢掉**。
  const extraVoice = doc.songs.some((s) =>
    s.parts.some((p) => p.measures.some((m) => m.elements.some((e) => e.voice > 1))));
  if (extraVoice) {
    warnings.add("多声部：投影只取第 1 声部，第 2 及以后的声部不会出现在导出的文本里");
  }
  return { text: emitJlyOfScore(score, warnings), warnings: [...warnings] };
}
