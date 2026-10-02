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
// 本版**不收**的写法一律走 `losses` 报出（dolce 有现成的"装不下的内容"机制），**不静默丢**。

import { SIMPLE_DIVISIONS, type Chord, type ElementId, type Measure, type Note, type ScoreDoc } from "./doc";
import { emptyDoc, emptySong, IdGen } from "./helpers";

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

const LETTER_BEAMS: Readonly<Record<string, number>> = { q: 1, s: 2, d: 3, h: 4 };
const ACC: Readonly<Record<string, string>> = { "#": "sharp", b: "flat", n: "natural", "##": "double-sharp", bb: "double-flat" };

/** 报告册：同一类问题只记一次，附一个原文例子便于定位。 */
export class JlyLosses {
  private readonly seen = new Map<string, string>();
  add(what: string, raw: string): void { if (!this.seen.has(what)) this.seen.set(what, raw); }
  list(): string[] { return [...this.seen].map(([what, raw]) => `${what}（例：${raw}）`); }
}

/** 本版不收的写法：先认出来、报出去，别当音符硬读。 */
const NOT_YET: readonly (readonly [RegExp, string])[] = [
  [/^g\[/, "倚音（`g[…]`）"],
  [/^x$/, "打击乐 `x`（与 dolce 的不可见休止语义不同）"],
  [/^(R\d*\{|\}|A\{)/, "反复跳跃 / 小节反复（`R{ } A{ }`）"],
  [/^R\*\d+$/, "多小节休止（`R*8`）"],
  [/^(Fine|Segno|ToCoda|DC|DS|D\.C\.|D\.S\.)$/i, "跳转记号"],
  [/^(LP:|:LP|LPH:|:LPH)$/, "原样 LilyPond 代码块（`LP: … :LP`）"],
  [/^(KeepLength|ChordsRoman|NoBarNums|NoIndent|OnePage|RaggedLast|SeparateTimesig|angka|WithStaff|PartMidi|RepeatAccidentals|NormalAccidentals)$/, "布局/结构开关"],
  [/^(chords|frets|instrument)=/, "和弦符号 / 指板图 / 乐器"],
  [/^arp(Up|Down)?$/, "琶音"],
  [/^(Fr=|slide|souyin|harmonic|bend)/, "二胡符号"],
  [/^(letter[A-Z0-9]+|glis|Harm:)$/, "排练记号 / 滑音 / 泛音"],
  [/^[<>]$/, "基准八度切换"],
  [/^[89]$/, "八度快捷键（`8`=`1'`）"],
  [/^\\/, "LilyPond 指令"],
];

/** 一个词（空格分隔）→ token。顺序无关：先认出词里所有记号，再判断合不合法。 */
export function scanWord(word: string, loss: JlyLosses): JlyToken | null {
  if (word === "-") return { kind: "sustain" };
  if (word === "~") return { kind: "tie" };
  if (word === "(") return { kind: "slur-open" };
  if (word === ")") return { kind: "slur-close" };
  if (word === "]") return { kind: "tuplet-close" };
  if (/^\|+$/.test(word)) return { kind: "bar" };
  if (/^\d+\[$/.test(word)) return { kind: "tuplet-open", n: Number(word.slice(0, -1)) };
  if (/^[\^_]".*"$/.test(word)) return { kind: "text" };
  for (const [re, what] of NOT_YET) {
    if (re.test(word)) { loss.add(what, word); return { kind: "loss", what }; }
  }
  // 音符：变音 / 数字 / 八度 / 字母时值 / 附点 / 反斜杠，**顺序任意**
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
    if (backslashes) { loss.add("反斜杠时值（`1\\`）", word); return { kind: "loss", what: "反斜杠时值" }; }
    return null;
  }
  if (backslashes) beams = backslashes === 1 ? 1 : 2;
  return { kind: "note", degree, alter, octave, beams, dots };
}

/** 一整行音乐 → token（按空白切；`%` 起头是注释，README：「忽略：`% 注释`」）。 */
export function scanMusicLine(line: string, loss: JlyLosses): { tokens: JlyToken[]; unknown: string[] } {
  const tokens: JlyToken[] = [];
  const unknown: string[] = [];
  for (const word of line.replace(/%.*$/, "").split(/\s+/)) {
    if (!word) continue;
    const t = scanWord(word, loss);
    if (t) tokens.push(t); else unknown.push(word);
  }
  return { tokens, unknown };
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
const dotFactor = (dots: number): number => (dots === 0 ? 1 : 2 - Math.pow(2, -dots));   // 附点倍数
/** `n[ … ]` 里 n 个音占几个（README 的表：3→2、5/6/7→4，其余取小于 n 的最大 2 的幂）。 */
const tupletNormal = (n: number): number => { let p = 1; while (p * 2 < n) p *= 2; return p; };

/**
 * jianpu-ly 文本 → `ScoreDoc`。
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
  /** 已读出的音（按顺序），歌词按顺序往上挂 */
  const sung: Chord[] = [];
  const verses = new Map<string, { han: boolean; syllables: string[] }>();

  const openMeasure = (): Measure => {
    const m: Measure = { number: String(part.measures.length + 1), elements: [] };
    part.measures.push(m);
    return m;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%")) continue;

    const mLyric = /^([LH]):\s*(.*)$/.exec(line);
    if (mLyric) {
      const han = mLyric[1] === "H";
      let body = mLyric[2] ?? "";
      let verse = "1";
      const mv = /^(\d+)\.\s*(.*)$/.exec(body);
      if (mv) { verse = mv[1]!; body = mv[2] ?? ""; }
      const syllables = han ? [...body.replace(/\s+/g, "")] : body.split(/\s+/).filter(Boolean);
      const key = verse + (han ? "H" : "L");
      const slot = verses.get(key) ?? { han, syllables: [] };
      slot.syllables.push(...syllables);
      verses.set(key, slot);
      continue;
    }

    const mHead = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line);
    if (mHead) {
      const key = mHead[1]!.toLowerCase();
      const value = mHead[2]!.trim();
      if (key === "title" || key === "movement-title") song.work.title = value;
      else if (key === "subtitle") song.work.subtitles.push(value);
      else if (CREDIT_KEYS.has(key)) song.credits = [...(song.credits ?? []), { type: key, text: value }];
      else loss.add("页头字段 `" + key + "=`", line);
      continue;
    }
    const mTime = /^(\d+)\/(\d+)(,\d+)?$/.exec(line);
    if (mTime) {
      song.time = { beats: Number(mTime[1]), beatType: Number(mTime[2]) };
      if (mTime[3]) loss.add("弱起拍号（`4/4,8`）", line);
      continue;
    }
    const mKey = /^([1-7])=([A-Ga-g][#b]?)$/.exec(line);
    if (mKey) {
      const tonic = mKey[2]!;
      const fifths = FIFTHS[tonic] ?? FIFTHS[tonic[0]!.toUpperCase() + tonic.slice(1)];
      if (fifths === undefined) loss.add("调号 `" + line + "`", line);
      else song.key = { fifths, spelling: tonic };
      continue;
    }
    const mTempo = /^\d+(?:\.\d+)?=(\d+)$/.exec(line);
    if (mTempo) { song.tempos = [Number(mTempo[1])]; continue; }

    if (line === "NextScore") { song = emptySong(); doc.songs.push(song); part = { id: "P1", measures: [] }; song.parts.push(part); cur = null; sung.length = 0; continue; }
    if (line === "NextPart") { part = { id: "P" + (song.parts.length + 1), measures: [] }; song.parts.push(part); cur = null; continue; }

    const { tokens, unknown: unk } = scanMusicLine(line, loss);
    unknown.push(...unk);
    for (const tk of tokens) {
      switch (tk.kind) {
        case "loss": case "header": case "text": break;
        case "bar": cur = null; break;
        case "slur-open": case "slur-close": loss.add("圆滑线 `( )`", "("); break;
        case "tuplet-open": openTuplet = tk.n; break;
        case "tuplet-close": openTuplet = null; break;
        case "tie": pendingTie = true; break;
        case "sustain": {
          const host = cur?.elements[cur.elements.length - 1];
          if (host && host.kind === "chord") {
            host.duration = { ...host.duration, divisions: host.duration.divisions + SIMPLE_DIVISIONS };
            host.sustains = [...(host.sustains ?? []), { id: ids.next() }];
          } else unknown.push("-");
          break;
        }
        case "note": {
          if (!cur) cur = openMeasure();
          const divisions = Math.round(SIMPLE_DIVISIONS * Math.pow(2, -tk.beams) * dotFactor(tk.dots));
          const ch: Chord = {
            kind: "chord", id: ids.next(), notes: [],
            duration: { divisions, dots: tk.dots },
            voice: 1, staff: 1,
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
            sung.push(ch);
          }
          cur.elements.push(ch);
          break;
        }
      }
    }
  }

  // 歌词按顺序、逐段挂到已读出的音上（数量不齐只挂得上多少算多少，差额报出来）
  for (const [key, slot] of verses) {
    const verse = Number(key.replace(/[HL]$/, ""));
    let i = 0;
    for (const s of sung) {
      if (i >= slot.syllables.length) break;
      const text = slot.syllables[i++]!;
      if (!text) continue;
      s.lyrics = [...(s.lyrics ?? []), { number: verse, text }];
    }
    if (slot.syllables.length > sung.length) {
      loss.add(`歌词第 ${verse} 段多出 ${slot.syllables.length - sung.length} 个音节`, slot.syllables.slice(sung.length, sung.length + 3).join(" "));
    }
  }

  return { doc, losses: loss.list(), unknown: [...new Set(unknown)] };
}

/** 供调用方判断"这份文本像不像 jianpu-ly"（打开文件时的方言判定用）。 */
export function looksLikeJly(text: string): boolean {
  return /^\s*title=/m.test(text) || /^\s*\d+\/\d+\s*$/m.test(text) || /^\s*[1-7]=[A-Ga-g][#b]?\s*$/m.test(text);
}

export type { ElementId };
