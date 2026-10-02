// jianpu-ly 的**词法与装配**（路线 B：独立实现，不塞进 `abcfamily` 家族）。
//
// 目标语法 = 上游 https://github.com/ssb22/jianpu-ly 的 README（v1.890），**不是 jianpu-db 语料的方言**。
// 与 dolce 的 123 方言（`abcfamily/dialect123.ts`）的三处关键差异：
//   ① **词内顺序无关** —— `#1`=`1#`、`'1`=`1'`、**`s1`=`1s`**（上游 README 原话）；
//      123 的扫描器是严格 `[变音][数字][八度][时值]`，照它读不了 jianpu-ly。
//   ② **时值是字母** —— `s`=16分、`q`=8分、无字母=4分、`d`=32分、`h`=64分；123 用 `_` 减时线。
//      另有 `\` / `\\` 替代写法（README：**必须写在音高之后**）。
//   ③ **连音是 `3[ … ]`** —— 方括号成组；123 是 `(3: … )`、ABC 是 `(3`，都不是这个形状
//      （且 `[` 在 ABC 家族里已被和弦 / 行内字段占用）。
//
// 模型口径（照 `j123/parse.ts` 的权威写法）：
//   八度进 `Degree { number, octaveShift }`；减时线条数 = `Chord.beams` 数组长度；
//   增时线既要**加成时值**、又要**挂独立 `Sustain` 对象**；连音写 `Duration.timeMod`。
//
// **位置信息（`SourceSpan`）是必需品**，不是可选项：编辑器的双向定位（代码区光标 ↔ 谱面元素）、
// 诊断的落点（`Diagnostic.source` 必填）、以及"改过才整份重写、没改过存回原文"的保存策略都靠它。
// 每个 token 都带 0 基的行号 / 行内列 / 全文偏移 / 长度，一路落到 `Chord` / `Sustain` / `Measure` / `Lyric`。
//
// 本版**不收**的写法一律走 `JlyLosses` → `doc.diagnostics` 报出（dolce 现成的机制），**不静默丢**。

import {
  SIMPLE_DIVISIONS,
  type Barline,
  type Chord,
  type Diagnostic,
  type Lyric,
  type Measure,
  type Note,
  type ScoreDoc,
  type SourceSpan,
} from "./doc";
import { emptyDoc, emptySong, IdGen } from "./helpers";
import { BARE_DIRECTION } from "./tojly";
import { DYNAMICS } from "../pu/glyph";

// ───────────────────────── 词法 ─────────────────────────

/** 一个音符 token。`beams` 是**减时线条数**（0 = 四分），与 dolce 模型同一口径。 */
export interface JlyNote {
  kind: "note";
  /** 1–7；`0` 是休止 */
  degree: number;
  /** 变音：`#` / `b` / `n` / `##` / `bb` / 空 */
  alter: string;
  /** 八度点数：`'` 加一、`,` 减一 */
  octave: number;
  beams: number;
  dots: number;
}

export type JlyToken =
  | JlyNote
  | { kind: "sustain" }
  | { kind: "bar" }
  | { kind: "tie" }
  | { kind: "slur-open"; melisma: boolean } | { kind: "slur-close"; melisma: boolean }
  | { kind: "tuplet-open"; n: number } | { kind: "tuplet-close" }
  | { kind: "text"; above: boolean; value: string }
  | { kind: "jump"; text: string }
  | { kind: "dynamic"; name: string }
  | { kind: "fermata" }
  | { kind: "grace"; notes: JlyGraceNote[] }
  | { kind: "header"; key: string; value: string }
  | { kind: "loss"; what: string };

/** 一个倚音（`g[#45]` 里的一个音）：时值字母可选（未记按八分画一条减时线），八度与附点照音符那一套。 */
export interface JlyGraceNote {
  degree: number;
  alter: string;
  octave: number;
  dots: number;
  beams: number;
}

/** 一个 token 在**本行**里的列号与长度（0 基）。 */
export interface JlyPos { col: number; len: number }

const LETTER_BEAMS: Readonly<Record<string, number>> = { q: 1, s: 2, d: 3, h: 4 };

/** 力度指令：从 `pu/glyph.ts::DYNAMICS` 的名字表长出来（别另抄一份名字，两处会漂）。 */
const DYNAMIC_COMMAND = new RegExp("^\\\\(?:" + Object.keys(DYNAMICS).join("|") + ")$");

/** 跳转记号写成规范形（`dc` → `D.C.`、`ds` → `D.S.`）：写出端的 `BARE_DIRECTION` 认这几个词。 */
const JUMP_CANON: Readonly<Record<string, string>> = {
  fine: "Fine", dc: "D.C.", "d.c.": "D.C.", ds: "D.S.", "d.s.": "D.S.",
  segno: "Segno", tocoda: "ToCoda",
};
const canonicalJump = (word: string): string => JUMP_CANON[word.toLowerCase()] ?? word;

/** 规范词 → 123/文本谱那套短名（`abcfamily/jumpmarks.ts::BARLINE_ORNAMENT_NAME` 的反向）。
 *  跳转记号在模型里是 `Barline.ornaments` 上的短名，与 123 的 `!fine!` 同一个落点。 */
const JUMP_SHORT: Readonly<Record<string, string>> = {
  Fine: "fine", "D.C.": "dc", "D.S.": "ds", Segno: "hs", ToCoda: "ty",
};
const ACC: Readonly<Record<string, string>> = {
  "#": "sharp", b: "flat", n: "natural", "##": "double-sharp", bb: "double-flat",
};

/** 拿不到位置时的兜底 span（只用于诊断，不参与定位）。 */
const ZERO_SPAN: SourceSpan = { line: 0, column: 0, offset: 0, length: 0 };

/** 报告册：同一类问题只记一次（附原文例子与首个落点）；既能给导出路径当注释，也能变成诊断。 */
export class JlyLosses {
  private readonly seen = new Map<string, { raw: string; span?: SourceSpan }>();
  add(what: string, raw: string, span?: SourceSpan): void {
    if (!this.seen.has(what)) this.seen.set(what, { raw, span });
  }
  list(): string[] { return [...this.seen].map(([what, v]) => `${what}（例：${v.raw}）`); }
  /** → 模型诊断（`Diagnostic.source` 必填，所以每个落点都要有 span）。 */
  diagnostics(): Diagnostic[] {
    return [...this.seen].map(([what, v]) => ({
      severity: "warning" as const,
      code: "jly-unsupported",
      message: what + "：本版不收，已跳过（没有写进模型）",
      source: v.span ?? ZERO_SPAN,
    }));
  }
}

/** 本版不收的写法：先认出来、报出去，别当音符硬读。 */
const NOT_YET: readonly (readonly [RegExp, string])[] = [
  [/^x$/, "打击乐 `x`（与 dolce 的不可见休止语义不同）"],
  [/^(R\d*\{|\}|A\{)/, "反复跳跃 / 小节反复（`R{ } A{ }`）"],
  [/^R\*\d+$/, "多小节休止（`R*8`）"],
  [/^(LP:|:LP|LPH:|:LPH)$/, "原样 LilyPond 代码块（`LP: … :LP`）"],
  [/^(KeepLength|ChordsRoman|NoBarNums|NoIndent|OnePage|RaggedLast|SeparateTimesig|angka|WithStaff|PartMidi|RepeatAccidentals|NormalAccidentals)$/, "布局 / 结构开关"],
  [/^(chords|frets|instrument)=/, "和弦符号 / 指板图 / 乐器"],
  [/^arp(Up|Down)?$/, "琶音"],
  [/^(Fr=|slide|souyin|harmonic|bend)/, "二胡符号"],
  [/^(letter[A-Z0-9]+|glis|Harm:)$/, "排练记号 / 滑音 / 泛音"],
  [/^[<>]$/, "基准八度切换"],
  [/^[89]$/, "八度快捷键（`8`=`1'`）"],
  [/^\\/, "LilyPond 指令"],
];

/** `g[#45]` / `g[d4d5s6]` 里的音。**倚音和弦**（`g[1&3&5]`）本版不收（引擎输入里一个倚音只有一个音高）。 */
function parseGrace(inner: string, loss: JlyLosses, span?: SourceSpan): JlyGraceNote[] | null {
  if (inner.includes("&")) { loss.add("倚音和弦（`g[1&3&5]`）", inner, span); return null; }
  const out: JlyGraceNote[] = [];
  let i = 0;
  while (i < inner.length) {
    let beams = 1;                                  // 未记时值 = 八分（与引擎输入那边的默认一致）
    if (LETTER_BEAMS[inner[i]!] !== undefined) { beams = LETTER_BEAMS[inner[i]!]!; i++; }
    let alter = "";
    const two = inner.slice(i, i + 2);
    if (ACC[two]) { alter = two; i += 2; }
    else if (ACC[inner[i]!]) { alter = inner[i]!; i++; }
    if (!/[0-7]/.test(inner[i] ?? "")) { loss.add("倚音组里读不动的写法", inner, span); return null; }
    const degree = Number(inner[i]!);
    i++;
    let octave = 0;
    let dots = 0;
    while (i < inner.length && (inner[i] === "'" || inner[i] === "," || inner[i] === ".")) {
      if (inner[i] === "'") octave++;
      else if (inner[i] === ",") octave--;
      else dots++;
      i++;
    }
    out.push({ degree, alter, octave, dots, beams });
  }
  return out.length ? out : null;
}

/**
 * 一个词（空格分隔）→ token。**顺序无关**：先把词里所有记号认出来，再判断合不合法。
 * `span` 只用于把"本版不收"的落点记进报告册。
 */
export function scanWord(word: string, loss: JlyLosses, span?: SourceSpan): JlyToken | null {
  if (word === "-") return { kind: "sustain" };
  if (word === "~") return { kind: "tie" };
  // 圆滑线两种写法**语义不同**，不能一律当同一种：`(` 是 jianpu-ly 的圆滑线，落到 LilyPond 上会被
  // 当成"一字多音"（`melismaBusyProperties` 默认含 `slurMelismaBusy`），弧线里的音**不吃音节**；
  // `\(` 是 LilyPond 的乐句线，照样画弧线但不吞音节。所以歌词对位要按它区分（实测，见 `tojly.ts`）。
  if (word === "(") return { kind: "slur-open", melisma: true };
  if (word === ")") return { kind: "slur-close", melisma: true };
  if (word === "\\(") return { kind: "slur-open", melisma: false };
  if (word === "\\)") return { kind: "slur-close", melisma: false };
  if (word === "]") return { kind: "tuplet-close" };
  if (/^\|+$/.test(word)) return { kind: "bar" };
  if (/^\d+\[$/.test(word)) return { kind: "tuplet-open", n: Number(word.slice(0, -1)) };
  if (/^[\^_]".*"$/.test(word)) return { kind: "text", above: word[0] === "^", value: word.slice(2, -1) };
  // 跳转记号与力度：上游写成**裸词**（`Fine` `DC` `Segno` `ToCoda` `DS`）或 LilyPond 指令（`\mf`）。
  // 不认它们就只剩"报出来"，而写出端是会写这两种的 —— 读写两头对不上，往返就丢。
  if (BARE_DIRECTION.test(word)) return { kind: "jump", text: canonicalJump(word) };
  if (DYNAMIC_COMMAND.test(word)) return { kind: "dynamic", name: word.slice(1) };
  if (word === "\\fermata") return { kind: "fermata" };
  if (/^g\[.*\]$/.test(word)) {
    const notes = parseGrace(word.slice(2, -1), loss, span);
    return notes ? { kind: "grace", notes } : { kind: "loss", what: "倚音" };
  }
  for (const [re, what] of NOT_YET) {
    if (re.test(word)) { loss.add(what, word, span); return { kind: "loss", what }; }
  }
  let i = 0;
  let alter = "";
  let degree: number | null = null;
  let octave = 0;
  let beams = 0;
  let dots = 0;
  let backslashes = 0;
  while (i < word.length) {
    const c = word[i]!;
    if (c === "#" || c === "b" || c === "n") {
      const two = word.slice(i, i + 2);
      if (!alter && ACC[two]) { alter = two; i += 2; continue; }
      if (!alter && ACC[c]) { alter = c; i += 1; continue; }
      return null;
    }
    if (c === "'") { octave++; i++; continue; }
    if (c === ",") { octave--; i++; continue; }
    if (c === ".") { dots++; i++; continue; }
    if (c === "\\") { backslashes++; i++; continue; }
    if (/[0-7]/.test(c)) {
      if (degree !== null) return null;
      degree = Number(c); i++; continue;
    }
    if (LETTER_BEAMS[c] !== undefined) { beams = LETTER_BEAMS[c]!; i++; continue; }
    return null;
  }
  if (degree === null) {
    if (backslashes) { loss.add("反斜杠时值（`1\\`）", word, span); return { kind: "loss", what: "反斜杠时值" }; }
    return null;
  }
  if (backslashes) beams = backslashes === 1 ? 1 : 2;   // README：`1\` 八分、`1\\` 十六分
  return { kind: "note", degree, alter, octave, beams, dots };
}

/** 这一行是不是**曲行**（有音符/小节线那些）。`L:`/`H:` 词行、页头、拍号/调号/速度、`NextScore` 都不是。
 *  分类与 `parseJly` 的派发次序同一套（改一处要改两处）。 */
export function isJlyMusicLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("%")) return false;
  if (/^[LH]:/.test(t)) return false;
  if (/^[A-Za-z][A-Za-z0-9]*=/.test(t)) return false;        // 页头 / `chords=` / `frets=` …
  if (/^\d+\/\d+(,\d+)?$/.test(t)) return false;             // 拍号
  if (/^[1-7]=[A-Ga-g][#b]?$/.test(t)) return false;         // 调号
  if (/^\d+(\.\d+)?=\d+$/.test(t)) return false;             // 速度
  if (t === "NextScore" || t === "NextPart") return false;
  return scanMusicLine(t, new JlyLosses()).tokens.length > 0;
}

/**
 * 把曲行按**每 N 小节一行**重新断行，别的一个字不动（词行、页头、注释都留在原处）。
 *
 * 为什么要重排：上游不看行（行只是排版偏好，`%` 里那点提示随行也无所谓），可 **dolce 自己按文件的行排版**
 * ——整首挤成一行时音符与歌词叠成一团（用户截图）。
 *
 * ⚠ **只搬字符、不整份重出**：写出端还不认识 `R{ } A{ }`、倚音、`chords=` 这些，整份重出会把它们抹掉。
 * 所以这里按 token 切片搬运，行内空白规范成一个空格（对上游无意义），其余原样。
 */
export function rewrapJlyText(text: string, measuresPerLine = 4): string {
  const rows = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)]
    .map((m) => ({ raw: m[1]!, sep: m[2] ?? "" }))
    .filter((r, i, all) => !(i === all.length - 1 && r.raw === "" && r.sep === ""));
  const isMusic = rows.map((r) => isJlyMusicLine(r.raw));
  if (!isMusic.some(Boolean)) return text;

  // 曲行里的 token，按文件顺序集中起来；行内注释挪到这一组最后一行的行尾（仍是注释）
  const tokens: string[] = [];
  const comments: string[] = [];
  rows.forEach((r, i) => {
    if (!isMusic[i]) return;
    const at = r.raw.indexOf("%");
    const body = at >= 0 ? r.raw.slice(0, at) : r.raw;
    if (at >= 0) comments.push(r.raw.slice(at).trim());
    for (const word of body.split(/\s+/).filter(Boolean)) tokens.push(word);
  });

  // 切小节：`|` 收小节（小节里已经有 token 才算收尾线，行首的 `|` 是左线）
  const lines: string[] = [];
  let cur: string[] = [];
  let inMeasure: string[] = [];
  let count = 0;
  const flushLine = (): void => { if (inMeasure.length) { cur.push(...inMeasure); inMeasure = []; } if (cur.length) { lines.push(cur.join(" ")); cur = []; } };
  for (const tk of tokens) {
    if (/^\|+$/.test(tk) && inMeasure.length) {
      inMeasure.push(tk);
      cur.push(...inMeasure);
      inMeasure = [];
      if (++count >= measuresPerLine) { lines.push(cur.join(" ")); cur = []; count = 0; }
      continue;
    }
    inMeasure.push(tk);
  }
  flushLine();
  if (comments.length && lines.length) lines[lines.length - 1] += "  " + comments.join(" ");

  const out: string[] = [];
  let slot = 0;
  rows.forEach((r, i) => {
    if (!isMusic[i]) { out.push(r.raw); return; }
    // 新的曲行全部落在**第一条**曲行的位置上，后面的曲行不再占行；
    // ⚠ 不能把「第一条到最后一条」整段替换掉：歌词行可能夹在两条曲行之间（上游允许 `L:` 写在任何地方），
    //   整段替换会把夹在中间的词行整条抹掉（第一版就是这样）。
    if (slot === 0) out.push(...lines);
    slot++;
  });
  return out.join("\n") + (text.endsWith("\n") ? "\n" : "");
}

/** 一整行音乐 → token 与各自的位置（按空白切；`%` 起头是注释，README：「忽略：`% 注释`」）。 */export function scanMusicLine(
  line: string,
  loss: JlyLosses,
  spanAt?: (col: number, len: number) => SourceSpan,
): { tokens: JlyToken[]; pos: JlyPos[]; unknown: string[] } {
  const tokens: JlyToken[] = [];
  const pos: JlyPos[] = [];
  const unknown: string[] = [];
  const body = line.replace(/%.*$/, "");
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const word = m[0];
    const t = scanWord(word, loss, spanAt?.(m.index, word.length));
    if (t) { tokens.push(t); pos.push({ col: m.index, len: word.length }); } else unknown.push(word);
  }
  return { tokens, pos, unknown };
}

/** 歌词里的一个音节。`null`（列表里）表示**占位**——这个音上没词，别把后面的字往前挪。 */
interface JlySyllable { text: string; /** 词内断音节（上游写 `syl-`，模型里是 `syllabic: "begin"`） */ begin?: boolean }

/**
 * 一行歌词正文 → 音节列表。三种"占位"记号都收成 `null`（都是上游自己的写法）：
 *   `""`   —— 上游 MusicXML 导入端给"这个音没词"写的就是空串；
 *   孤立的 `_`（拉丁行）—— 上游给 melisma 的续音写它；
 *   `\skip 1` —— LilyPond 原生的跳过。
 * **汉字行**里的 `_` 不是跳过，是连写（`一_三` = 一个字两个汉字，仍只占一格）；
 * 行尾的 `-` 是词内断音节（上游把 `syl- la- bles` 译成 ` -- `），跟 123 读法一致收成 `syllabic: "begin"`。
 * 位置感由调用方按"哪些和弦算歌词位置"决定（见 `parseJly` 里 `slots`）。
 */
function syllablesOf(body: string, han: boolean): (JlySyllable | null)[] {
  const out: (JlySyllable | null)[] = [];
  /** LilyPond 的字符串音节：`"do"` 就是一个字（`""` 是空 = 占位）。写出端**一律**这么写拉丁歌词，
   *  因为不加引号的 `4` / `s0` 会被 LilyPond 当成时值（实测直接报错）。 */
  const unquote = (w: string): string | null => {
    if (w.length < 2 || !w.startsWith('"') || !w.endsWith('"')) return w;
    const inner = w.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return inner === "" ? null : inner;
  };
  const push = (raw: string): void => {
    const text = unquote(raw);
    if (text === null) { if (raw === "") return; out.push(null); return; }
    if (text === "") return;
    if (text.endsWith("-")) out.push({ text: text.slice(0, -1), begin: true });
    else out.push({ text });
  };
  if (han) {
    // 汉字行：空白分音节，`_` 是**连写**（`一_三` 仍是一个音节），引号包住的整串也算一个音节。
    for (const w of body.split(/\s+/).filter(Boolean)) {
      if (w.length >= 2 && w.startsWith('"') && w.endsWith('"')) { push(w); continue; }
      const text = w.split("_").join("");
      if (text) push(text);
    }
    return out;
  }
  const words = body.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w === "_") { out.push(null); continue; }
    if (/^\\skip\d*$/.test(w)) {                     // `\skip 1` / `\skip1`
      out.push(null);
      if (w === "\\skip" && /^\d+$/.test(words[i + 1] ?? "")) i++;
      continue;
    }
    push(w);
  }
  return out;
}

// ───────────────────────── 装配：token → ScoreDoc ─────────────────────────

export interface JlyParse {
  doc: ScoreDoc;
  losses: string[];
  unknown: string[];
}

/** 大调主音名 → `fifths`（`tojly.ts` 那张表的反向）。 */
const FIFTHS: Readonly<Record<string, number>> = {
  Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
};

const CREDIT_KEYS = new Set(["composer", "poet", "lyricist", "arranger", "copyright", "opus"]);
const dotFactor = (dots: number): number => (dots === 0 ? 1 : 2 - Math.pow(2, -dots));
/** 倚音的减时线条数 → 符号时值：0 条四分、1 条八分（未记的默认）、2 条十六、3 条三十二、4 条六十四。 */
const GRACE_TYPES = ["quarter", "eighth", "16th", "32nd", "64th"] as const;
const graceTypeOf = (beams: number): NonNullable<Chord["duration"]["type"]> =>
  GRACE_TYPES[Math.max(0, Math.min(4, Math.round(beams)))]!;
/** `n[ … ]` 里 n 个音占几个（README 的表：3→2、5/6/7→4，其余取小于 n 的最大 2 的幂）。 */
const tupletNormal = (n: number): number => { let p = 1; while (p * 2 < n) p *= 2; return p; };

/**
 * jianpu-ly 文本 → `ScoreDoc`（带位置信息与诊断）。
 *
 * 覆盖：页头（`title=` / 署名 / `1=Bb` / `4/4` / `4=85`）、音符（顺序无关、字母时值、附点、八度、变音）、
 * 增时线 `-`（加时值 + 挂 `Sustain`）、休止 `0`、小节线、延音线 `~`、连音 `3[ … ]`、
 * 歌词 `L:` / `H:`（逐段挂到前面已读出的音上）、多曲 `NextScore`、多声部 `NextPart`。
 */
export function parseJly(text: string): JlyParse {
  const loss = new JlyLosses();
  const unknown: string[] = [];
  const doc = emptyDoc("jly");
  const ids = new IdGen();

  let song = emptySong();
  doc.songs.push(song);
  let part = { id: "P1", measures: [] as Measure[] };
  song.parts.push(part);

  let cur: Measure | null = null;
  let openTuplet: number | null = null;
  let pendingTie = false;
  /** 没写段号的歌词行按出现顺序编号（跨 `L:`/`H:` 共用，上游也只是一条条往下叠）。 */
  let autoVerse = 0;
  // 歌词位置：**发音**的和弦。休止不占（LilyPond 的 `\lyricsto` 跳过休止，实测连带梁休止也跳），
  // 圆滑线 `(` … `)` 里的音也不占（那是"一字多音"：`slurMelismaBusy`，实测 `1 ( 2 ) 3 4`
  // 配 `L: A B C D` 时 B 会跳到第 3 个音上）。乐句线 `\(` `\)` 不吞音节，所以不算在里面。
  const slots: Chord[] = [];
  let melismaOpen = 0;                   // 已经从**前面**的音开始的圆滑线（本音不吃音节）
  let pendingMelisma = 0;                // 本音自己开的圆滑线：从**下一个**音起才吞
  const verses = new Map<string, { han: boolean; syllables: (JlySyllable | null)[]; span?: SourceSpan }>();

  /** 开一小节；`source` 落在这一小节的第一个 token 上（编辑器按它定位小节）。 */
  const openMeasure = (source?: SourceSpan): Measure => {
    const m: Measure = { number: String(part.measures.length + 1), elements: [] };
    if (source) m.source = source;
    part.measures.push(m);
    return m;
  };

  let lineNo = 0;                        // 0 基行号（`SourceSpan` 口径）
  let lineOffset = 0;                    // 本行起点的全文偏移
  // ⚠ 必须按**实际分隔符**推进偏移：CRLF 是两个字符，按 `+1` 累加会让每行少 1，
  //   偏移一路漂走（实测 6606 个 span 里错了 6242 个，切片指向别的行）。
  //   先把行拆出来（而不是边扫边 `advance`），是为了歌词的**多行写法**能往后吃掉几行。
  const rows = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)]
    .map((m) => ({ raw: m[1]!, sep: m[2] ?? "" }))
    .filter((r, i, all) => !(i === all.length - 1 && r.raw === "" && r.sep === ""));
  for (let li = 0; li < rows.length; li++) {
    const { raw, sep } = rows[li]!;
    const indent = raw.length - raw.trimStart().length;
    const spanOf = (col: number, len: number): SourceSpan =>
      ({ line: lineNo, column: indent + col, offset: lineOffset + indent + col, length: len });
    const advance = (): void => { lineNo++; lineOffset += raw.length + sep.length; };

    const line = raw.trim();
    if (!line || line.startsWith("%")) { advance(); continue; }

    // 歌词行。音节串可以只写一行，也可以 `L:` 之后换行、分几行写、以**空行**结束
    // （上游 README：「在:之后换行输入，并以2个空行结束」；它自己也是先把这几行合成一行再解析）。
    const mLyric = /^([LH]):\s*(.*)$/.exec(line);
    if (mLyric) {
      const han = mLyric[1] === "H";
      const head = spanOf(indent, line.length);
      let body = mLyric[2] ?? "";
      if (!body) {
        const parts: string[] = [];
        while (li + 1 < rows.length) {
          const nxt = rows[li + 1]!;
          const t = nxt.raw.trim();
          if (!t || t.startsWith("%")) break;              // 空行结束（`%` 注释也当结束）
          parts.push(t);
          li++;
          lineNo++;
          lineOffset += nxt.raw.length + nxt.sep.length;   // 吃掉的行也要推进偏移，否则后面的 span 全漂
        }
        body = parts.join(" ");
      }
      let verse = "";
      const mv = /^(\d+)\.\s*(.*)$/.exec(body);
      if (mv) { verse = mv[1]!; body = mv[2] ?? ""; autoVerse = Math.max(autoVerse, Number(verse)); }
      else {
        // 没写段号：**每一条歌词行各自是一段**（上游把每条 `L:`/`H:` 行变成一个 `\new Lyrics` 叠下去，
        // 就是这么排的）。原来一律塞进第 1 段，于是"两行词"会连成一行、后面的字还挤到后面的音上
        // ——用户截图里 `L: do re …` 和第二条 `L: …` 连成 `…do是是是的的` 就是这个。
        verse = String(++autoVerse);
      }
      const key = verse + (han ? "H" : "L");
      const syls = syllablesOf(body, han);
      // 上游的 `L:` 行**不拆汉字**（只有 `H:` 行会逐字自动分开），所以一串汉字会被当成一个音节，
      // 排出来是"好几个字挤在一个音下面"。这不改读法（要跟真工具一致），但要说清楚怎么写。
      if (!han && syls.some((s) => s && [...s.text].filter((c) => /[\u3400-\u9fff]/.test(c)).length > 1)) {
        loss.add("拉丁歌词行（`L:`）里的连续汉字：上游把整串当一个音节，要逐字分开请写成 `H:`", body, head);
      }
      const slot = verses.get(key) ?? { han, syllables: [], span: head };
      slot.syllables.push(...syls);
      verses.set(key, slot);
      advance();
      continue;
    }

    // 页头字段
    const mHead = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line);
    if (mHead) {
      const key = mHead[1]!.toLowerCase();
      const value = mHead[2]!.trim();
      if (key === "title" || key === "movement-title") song.work.title = value;
      else if (key === "subtitle") song.work.subtitles.push(value);
      else if (CREDIT_KEYS.has(key)) song.credits = [...(song.credits ?? []), { type: key, text: value }];
      else loss.add("页头字段 `" + key + "=`", line, spanOf(0, line.length));
      advance();
      continue;
    }
    const mTime = /^(\d+)\/(\d+)(,\d+)?$/.exec(line);
    if (mTime) {
      song.time = { beats: Number(mTime[1]), beatType: Number(mTime[2]) };
      if (mTime[3]) loss.add("弱起拍号（`4/4,8`）", line, spanOf(0, line.length));
      advance();
      continue;
    }
    const mKey = /^([1-7])=([A-Ga-g][#b]?)$/.exec(line);
    if (mKey) {
      const tonic = mKey[2]!;
      const fifths = FIFTHS[tonic] ?? FIFTHS[tonic[0]!.toUpperCase() + tonic.slice(1)];
      if (fifths === undefined) loss.add("调号 `" + line + "`", line, spanOf(0, line.length));
      else song.key = { fifths, spelling: tonic };
      advance();
      continue;
    }
    const mTempo = /^\d+(?:\.\d+)?=(\d+)$/.exec(line);
    if (mTempo) { song.tempos = [Number(mTempo[1])]; advance(); continue; }

    if (line === "NextScore") {
      song = emptySong(); doc.songs.push(song);
      part = { id: "P1", measures: [] }; song.parts.push(part);
      cur = null; slots.length = 0; melismaOpen = 0; pendingMelisma = 0; advance(); continue;
    }
    if (line === "NextPart") {
      part = { id: "P" + (song.parts.length + 1), measures: [] }; song.parts.push(part);
      cur = null; advance(); continue;
    }

    // 音乐行
    const { tokens, pos, unknown: unk } = scanMusicLine(line, loss, spanOf);
    unknown.push(...unk);
    const spanAt = (i: number): SourceSpan => spanOf(pos[i]?.col ?? 0, pos[i]?.len ?? 0);
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i]!;
      /** 记号落在"前一个音"上（上游的 `\mf` / `\fermata` 都是"适用于之前的音符"）。 */
      const lastChord = (): Chord | null => {
        const here = cur?.elements[cur.elements.length - 1];
        if (here && here.kind === "chord") return here;
        const prev = part.measures[part.measures.length - 1];
        const last = prev?.elements[prev.elements.length - 1];
        return last && last.kind === "chord" ? last : null;
      };
      /** 跳转记号在 123 里是**小节线上的记号**（`Barline.ornaments`，短名 `hs`/`ty`/`ds`/`dc`/`fine`）。
       *  照它的口径存，渲染、跨格式与写出端才都对得上（实测：`!fine!` 导出成裸词 `Fine` 走的就是这条链）。 */
      const addJump = (short: string): void => {
        const host = cur ?? part.measures[part.measures.length - 1];
        if (!host) { loss.add("跳转记号（还没有小节）", short, spanAt(i)); return; }
        const lines = host.barlines ?? (host.barlines = []);
        const right = lines.find((b) => b.location === "right");
        if (right) right.ornaments = [...(right.ornaments ?? []), { name: short, level: 0 }];
        else lines.push({ location: "right", source: spanAt(i), ornaments: [{ name: short, level: 0 }] });
      };
      switch (tk.kind) {
        case "loss": case "header": break;
        case "text": {
          // 与 123 同一个落点：`"^渐慢"` 在那边存成 `Chord.sectionWord`（谱上文字）
          const host = lastChord();
          if (host) host.sectionWord = host.sectionWord ? host.sectionWord + " " + tk.value : tk.value;
          else loss.add("谱上文字（前面没有音）", tk.value, spanAt(i));
          break;
        }
        case "dynamic": {
          // 与 123 同一个落点：`!mf!` 在那边存成 `Chord.notations.articulations` 里的一项
          const host = lastChord();
          if (host) {
            const not = { ...(host.notations ?? {}) };
            not.articulations = [...(not.articulations ?? []), tk.name];
            host.notations = not;
          } else loss.add("力度记号（前面没有音）", tk.name, spanAt(i));
          break;
        }
        case "fermata": {
          const host = lastChord();
          if (host) host.notations = { ...(host.notations ?? {}), fermata: true };
          else loss.add("延长记号 `\\fermata`（前面没有音）", "\\fermata", spanAt(i));
          break;
        }
        case "jump": addJump(JUMP_SHORT[tk.text] ?? "fine"); break;
        case "grace": {
          // 倚音在模型里是**独立元素**（`Chord.grace`），时值 0；投影时会被收进后一个音的 `graceNotes`。
          // 口径与 123 一致（`{…}` 也这么存）。
          if (!cur) cur = openMeasure(spanAt(i));
          for (const g of tk.notes) {
            const note: Note = { degree: { number: g.degree, octaveShift: g.octave } };
            if (g.alter && ACC[g.alter]) {
              note.accidental = ACC[g.alter] as Note["accidental"];
              note.degree!.accidental = note.accidental;
            }
            cur.elements.push({
              kind: "chord", id: ids.next(), notes: [note],
              duration: { divisions: 0, dots: g.dots, type: graceTypeOf(g.beams) },
              grace: {}, voice: 1, staff: 1,
              source: spanAt(i),
            });
          }
          break;
        }
        case "bar": {
          // ⚠ 小节线要**记进模型**，不能只把当前小节收掉就算了：投影成排版输入时，
          //   小节结构（以及曲行怎么断）全是从 `Measure.barlines` 长出来的。原来这里只写 `cur = null`，
          //   于是整首歌在谱面上是**一根没有小节线的长行**——音符与歌词挤成一团（用户截图就是这个）。
          //   口径与 123 一致：小节里已经有音就是**收尾线**，还没有音就是行首的**左线**。
          const bl: Barline = { location: "right", style: "regular", source: spanAt(i) };
          if (cur && cur.elements.length) {
            (cur.barlines ??= []).push(bl);
            cur = null;
          } else {
            if (!cur) cur = openMeasure(spanAt(i));
            (cur.barlines ??= []).push({ ...bl, location: "left" });
          }
          break;
        }
        case "slur-open":
          // 弧算在**哪个音**头上要看它写在哪儿：jianpu-ly 原样透传，于是
          //   `1 ( 2 3 ) 4` → `c4 ( d4 e4 )`：LilyPond 把 `(` 当**前一个音**的后置事件，弧从 `1` 起，
          //   弧内（`2` `3`，到 `)` 那个音为止）不吃音节 —— 实测 A→1、B→4；
          //   而弧写在最前面（`( 1 2 ) 3 4`）时它算在**下一个音**头上 —— 实测 A→1、B→3、C→4。
          //   两种都要跟：前一个 token 是音就立刻生效，否则等这个音读完再生效（组首自己是吃音节的）。
          if (tk.melisma) {
            if (tokens[i - 1]?.kind === "note") melismaOpen++;
            else pendingMelisma++;
          }
          loss.add(tk.melisma ? "圆滑线 `( )`" : "乐句线 `\\( \\)`", tk.melisma ? "(" : "\\(", spanAt(i));
          break;
        case "slur-close":
          if (tk.melisma) melismaOpen = Math.max(0, melismaOpen - 1);
          break;
        case "tuplet-open": openTuplet = tk.n; break;
        case "tuplet-close": openTuplet = null; break;
        case "tie": pendingTie = true; break;
        case "sustain": {
          const host = cur?.elements[cur.elements.length - 1];
          if (host && host.kind === "chord") {
            host.duration = { ...host.duration, divisions: host.duration.divisions + SIMPLE_DIVISIONS };
            host.sustains = [...(host.sustains ?? []), { id: ids.next(), source: spanAt(i) }];
          } else unknown.push("-");
          break;
        }
        case "note": {
          if (!cur) cur = openMeasure(spanAt(i));
          const divisions = Math.round(SIMPLE_DIVISIONS * Math.pow(2, -tk.beams) * dotFactor(tk.dots));
          const ch: Chord = {
            kind: "chord", id: ids.next(), notes: [],
            duration: { divisions, dots: tk.dots },
            voice: 1, staff: 1,
            source: spanAt(i),
          };
          if (openTuplet !== null) ch.duration.timeMod = { actual: openTuplet, normal: tupletNormal(openTuplet) };
          if (tk.beams > 0) ch.beams = Array.from({ length: tk.beams }, () => "continue" as const);
          if (tk.degree === 0) {
            ch.rest = {};
          } else {
            const note: Note = { degree: { number: tk.degree, octaveShift: tk.octave } };
            if (tk.alter && ACC[tk.alter]) {
              note.accidental = ACC[tk.alter] as Note["accidental"];
              note.degree!.accidental = note.accidental;
            }
            if (pendingTie) {
              const prev = cur.elements[cur.elements.length - 1];
              const pn = prev?.kind === "chord" ? prev.notes[0] : undefined;
              if (pn) pn.tie = { ...(pn.tie ?? {}), start: true };
              note.tie = { ...(note.tie ?? {}), stop: true };
              pendingTie = false;
            }
            ch.notes.push(note);
          }
          cur.elements.push(ch);
          // 本音是不是一个歌词位置：启音（倚音）不算、休止不算、已经在圆滑线里（一字多音）的也不算。
          if (tk.degree !== 0 && !ch.grace && melismaOpen === 0) slots.push(ch);
          melismaOpen += pendingMelisma;      // 本音开的弧线，从下一个音起才吞音节
          pendingMelisma = 0;
          break;
        }
      }
    }
    advance();
  }

  // 歌词按顺序、逐段挂到已读出的音上。**逐位置推进**：这一格没字（占位）也要往下走一格，
  // 否则后面的字会整体前移（上游 README 的"对位"就是这么算的）。挂不满的差额报出来。
  for (const [key, slot] of verses) {
    const verse = Number(key.replace(/[HL]$/, ""));
    let i = 0;
    for (const ch of slots) {
      if (i >= slot.syllables.length) break;
      const syl = slot.syllables[i++]!;
      if (!syl) continue;
      const lyric: Lyric = { number: verse, text: syl.text };
      if (syl.begin) lyric.syllabic = "begin";
      if (slot.span) lyric.source = slot.span;
      ch.lyrics = [...(ch.lyrics ?? []), lyric];
    }
    if (slot.syllables.length > slots.length) {
      loss.add(
        `歌词第 ${verse} 段多出 ${slot.syllables.length - slots.length} 个音节`,
        slot.syllables.slice(slots.length).map((s) => s?.text ?? '""').slice(0, 3).join(" "),
        slot.span,
      );
    }
  }

  doc.diagnostics = loss.diagnostics();
  return { doc, losses: loss.list(), unknown: [...new Set(unknown)] };
}

// 上游**没有**任何决定性标记可以拿来判"这段文本是不是 jianpu-ly"：没有版本行（不像 ABC 的 `%abc-2.1`
// 或本项目的 `%123-1.0`）、没有签名、也没有必需项 —— 它 README 第一句就是"普通文本文件**以空格分隔**的"，
// `title=` / `4/4` / `1=Bb` 都只是 token，能不能独占一行是**排版偏好**，不是语法。
// 所以这里**不做**内容嗅探（曾经写过 `looksLikeJly`，那只是特征猜测，已删）：
// 判据只有一个 —— 扩展名 `.jly`（那是它自己 `--export-jly` 写出来的后缀，见 README 命令行选项）。
