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
  type Chord,
  type Diagnostic,
  type Lyric,
  type Measure,
  type Note,
  type ScoreDoc,
  type SourceSpan,
} from "./doc";
import { emptyDoc, emptySong, IdGen } from "./helpers";

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
  | { kind: "slur-open" } | { kind: "slur-close" }
  | { kind: "tuplet-open"; n: number } | { kind: "tuplet-close" }
  | { kind: "text" }
  | { kind: "header"; key: string; value: string }
  | { kind: "loss"; what: string };

/** 一个 token 在**本行**里的列号与长度（0 基）。 */
export interface JlyPos { col: number; len: number }

const LETTER_BEAMS: Readonly<Record<string, number>> = { q: 1, s: 2, d: 3, h: 4 };
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
  [/^g\[/, "倚音（`g[…]`）"],
  [/^x$/, "打击乐 `x`（与 dolce 的不可见休止语义不同）"],
  [/^(R\d*\{|\}|A\{)/, "反复跳跃 / 小节反复（`R{ } A{ }`）"],
  [/^R\*\d+$/, "多小节休止（`R*8`）"],
  [/^(Fine|Segno|ToCoda|DC|DS|D\.C\.|D\.S\.)$/i, "跳转记号"],
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

/**
 * 一个词（空格分隔）→ token。**顺序无关**：先把词里所有记号认出来，再判断合不合法。
 * `span` 只用于把"本版不收"的落点记进报告册。
 */
export function scanWord(word: string, loss: JlyLosses, span?: SourceSpan): JlyToken | null {
  if (word === "-") return { kind: "sustain" };
  if (word === "~") return { kind: "tie" };
  if (word === "(") return { kind: "slur-open" };
  if (word === ")") return { kind: "slur-close" };
  if (word === "]") return { kind: "tuplet-close" };
  if (/^\|+$/.test(word)) return { kind: "bar" };
  if (/^\d+\[$/.test(word)) return { kind: "tuplet-open", n: Number(word.slice(0, -1)) };
  if (/^[\^_]".*"$/.test(word)) return { kind: "text" };
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

/** 一整行音乐 → token 与各自的位置（按空白切；`%` 起头是注释，README：「忽略：`% 注释`」）。 */
export function scanMusicLine(
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
  const sung: Chord[] = [];
  const verses = new Map<string, { han: boolean; syllables: string[]; span?: SourceSpan }>();

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
  for (const lm of text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    const raw = lm[1]!;
    const sep = lm[2] ?? "";
    if (raw === "" && sep === "") break;
    const indent = raw.length - raw.trimStart().length;
    const spanOf = (col: number, len: number): SourceSpan =>
      ({ line: lineNo, column: indent + col, offset: lineOffset + indent + col, length: len });
    const advance = (): void => { lineNo++; lineOffset += raw.length + sep.length; };

    const line = raw.trim();
    if (!line || line.startsWith("%")) { advance(); continue; }

    // 歌词行：整行当音节串（汉字逐字、拉丁按空白）
    const mLyric = /^([LH]):\s*(.*)$/.exec(line);
    if (mLyric) {
      const han = mLyric[1] === "H";
      let body = mLyric[2] ?? "";
      let verse = "1";
      const mv = /^(\d+)\.\s*(.*)$/.exec(body);
      if (mv) { verse = mv[1]!; body = mv[2] ?? ""; }
      const syllables = han ? [...body.replace(/\s+/g, "")] : body.split(/\s+/).filter(Boolean);
      const key = verse + (han ? "H" : "L");
      const slot = verses.get(key) ?? { han, syllables: [], span: spanOf(indent, line.length) };
      slot.syllables.push(...syllables);
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
      cur = null; sung.length = 0; advance(); continue;
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
      switch (tk.kind) {
        case "loss": case "header": case "text": break;
        case "bar": cur = null; break;
        case "slur-open": case "slur-close": loss.add("圆滑线 `( )`", "(", spanAt(i)); break;
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
          sung.push(ch);
          break;
        }
      }
    }
    advance();
  }

  // 歌词按顺序、逐段挂到已读出的音上（挂不满只挂得上多少算多少，差额报出来）
  for (const [key, slot] of verses) {
    const verse = Number(key.replace(/[HL]$/, ""));
    let i = 0;
    for (const ch of sung) {
      if (i >= slot.syllables.length) break;
      const text = slot.syllables[i++]!;
      if (!text) continue;
      const lyric: Lyric = { number: verse, text };
      if (slot.span) lyric.source = slot.span;
      ch.lyrics = [...(ch.lyrics ?? []), lyric];
    }
    if (slot.syllables.length > sung.length) {
      loss.add(
        `歌词第 ${verse} 段多出 ${slot.syllables.length - sung.length} 个音节`,
        slot.syllables.slice(sung.length, sung.length + 3).join(" "),
        slot.span,
      );
    }
  }

  doc.diagnostics = loss.diagnostics();
  return { doc, losses: loss.list(), unknown: [...new Set(unknown)] };
}

/** 打开文件时判方言用：像不像 jianpu-ly（上游那套页头 / 拍号 / `1=X` 行）。 */
export function looksLikeJly(text: string): boolean {
  return /^\s*title=/m.test(text) || /^\s*\d+\/\d+\s*$/m.test(text) || /^\s*[1-7]=[A-Ga-g][#b]?\s*$/m.test(text);
}
