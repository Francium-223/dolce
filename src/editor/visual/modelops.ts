// 可视化编辑的**模型那一路**：`.musicxml` 没有可以局部补丁的原文 token，动作改的是 `ScoreDoc`（`model/edit.ts`），
// 改完经唯一写出端整份重写，只把前后不同的那一段放进代码区（代码区隐藏着，里面就是 XML 原文），撤销重做仍是代码区那份 history。
//
// 与文本那一路（`ops.ts` + `EditDialect`）同一张动作表、同一份选区：选区在 XML 原文上（`SyncIndex.buildXml` 建的索引），
// 动作按选区碰到的条目认音符。改完元素 id 会重编（重写再读回），按「第几声部第几小节哪个声线第几个」认回来落选区。
// 导航、模式切换、全选、撤销这些与改法无关的动作不在这里（返回 null，控制器照旧处理）。

import type { EditorView } from "@codemirror/view";
import type { Chord, ElementId, ScoreDoc } from "../../model/doc";
import {
  addBeat, addChordNote, type BarKind, chordAtPos, chordOnset, deleteChords, deleteMeasures, insertChord, insertInVoice, insertMeasure,
  isEditError, type JumpKind, locate, mergeMeasures, midiOf, type ChordPos, type EditHooks, type InsertAnchor, type ModelEdit, posOf,
  removeChordNote, scaleDuration, setBarKind, setBreakBefore, setDegree, setKeyAt, setTempoAt, setTimeAt, shiftOctave, splitMeasure,
  pasteClip, type ClipItem, setDirectionText, toggleTuplet, setHarmony, setLyric, shiftSemitones, transposeScore, stepDegree, stepSemitone, setStep, degreeOfStep, anchorFifths, toggleAccidental, toggleDeco, toggleDot, toggleEnding, toggleJump, toggleSlur, toggleTie,
} from "../../model/edit";
import { parseKeyInput, parseTempoInput, parseTimeInput } from "./measureinput";
import { dropEmbeddedLayout, forgetNoteLayout } from "../../model/xmlsurface";
import type { SyncEntry, SyncIndex } from "../sync";
import type { NoteDuration } from "./dialect";
import type { VisualAction } from "./keys";
import { t as tr } from "../../i18n";

/** 模型那一路向控制器要的东西。 */
export interface ModelActionCtx {
  readonly view: EditorView;
  readonly sync: SyncIndex;
  /** 按代码区当前原文**新读一份**模型（改的是它：它的原节点只为这次重写而活，改表层不碍着谱面那份） */
  freshModel(): ScoreDoc | null;
  /** 模型 → 原文（唯一写出端） */
  writeModel(doc: ScoreDoc): string;
  /** 索引用的那份模型（重排后按它认回选区） */
  syncDoc(): ScoreDoc | null;
  reloadNow(): void;
  setStatus(text: string): void;
  select(from: number, to: number): void;
  /** 按原文顺序、方向键能停的条目 */
  navigable(): SyncEntry[];
  /** 选区碰到的条目 */
  selectedEntries(): SyncEntry[];
  readonly curDur: NoteDuration;
  /** 声部输入：插入模式新插的音落在第几声部（1–4） */
  readonly curVoice: number;
  /** Alt+点击单独选中的和弦里某个音（从低到高第几个）；没有为 null */
  readonly pickedChordNote: { id: ElementId; index: number } | null;
  /** 按键发声 */
  play(midi: number): void;
  /** 弹一个输入框问一句（调号、拍号、速度），放弃为 null */
  prompt(hint: string, initial: string): Promise<string | null>;
}

const HOOKS: EditHooks = { forgetStem: forgetNoteLayout, forgetLayout: dropEmbeddedLayout };

/** 两份原文前后相同的部分去掉，剩下中间不同的那一段。 */
function diffRegion(a: string, b: string): { from: number; to: number; insert: string } {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return { from: p, to: a.length - q, insert: b.slice(p, b.length - q) };
}

type Target = { select: ChordPos[] } | { caretAfter: ChordPos } | { caretBefore: ChordPos } | null;

/**
 * 改一次模型并落地。`fn` 在新读出的模型上就地改，返回要选中的（和弦对象）；这里先把它们换成位置，
 * 再写出、放进代码区、重排，最后在重排后的索引里按位置认回来落选区。`sound` 时响一下选中的第一个音。
 */
function commit(ctx: ModelActionCtx, fn: (doc: ScoreDoc) => ModelEdit, sound = false): boolean {
  const doc = ctx.freshModel();
  if (!doc) {
    ctx.setStatus(tr("ve.xmlUnreadable"));
    return true;
  }
  const out = fn(doc);
  if (isEditError(out)) {
    ctx.setStatus(out.error);
    return true;
  }
  const pos = (c: Chord): ChordPos | null => posOf(doc, c);
  const target: Target = "select" in out
    ? { select: out.select.map(pos).filter((p): p is ChordPos => p !== null) }
    : "caretAfter" in out
      ? (pos(out.caretAfter) ? { caretAfter: pos(out.caretAfter)! } : null)
      : (pos(out.caretBefore) ? { caretBefore: pos(out.caretBefore)! } : null);
  const xml = ctx.writeModel(doc);
  const old = ctx.view.state.doc.toString();
  if (xml !== old) {
    ctx.view.dispatch({ changes: [diffRegion(old, xml)], userEvent: "input.visual", scrollIntoView: false });
    ctx.reloadNow();
  }
  reselect(ctx, target);
  if (sound) {
    const first = ctx.selectedEntries().find((e) => e.kind === "note") ??
      [...ctx.navigable()].reverse().find((e) => e.kind === "note" && e.to <= ctx.view.state.selection.main.head);
    const d = ctx.syncDoc();
    const midi = first && d ? midiOf(d, first.id) : null;
    if (midi !== null) ctx.play(midi);
  }
  ctx.setStatus("");
  return true;
}

function reselect(ctx: ModelActionCtx, t: Target): void {
  const doc = ctx.syncDoc();
  if (!doc || !t) return;
  const spanOf = (p: ChordPos): { from: number; to: number } | null => {
    const ch = chordAtPos(doc, p);
    return ch ? ctx.sync.spanOfNote(ch.id) : null;
  };
  if ("select" in t) {
    const spans = t.select.map(spanOf).filter((s): s is { from: number; to: number } => s !== null);
    if (spans.length) ctx.select(Math.min(...spans.map((s) => s.from)), Math.max(...spans.map((s) => s.to)));
  } else if ("caretAfter" in t) {
    const s = spanOf(t.caretAfter);
    if (s) ctx.select(s.to, s.to);
  } else {
    const s = spanOf(t.caretBefore);
    if (s) ctx.select(s.from, s.from);
  }
}

/** 选区里的音符 id（编辑模式）。 */
function selectedNotes(ctx: ModelActionCtx): ElementId[] {
  return ctx.selectedEntries().filter((e) => e.kind === "note").map((e) => e.id);
}

/** 插入模式光标前面那个条目（没有为 null）。 */
function entryBeforeCaret(ctx: ModelActionCtx): SyncEntry | null {
  const head = ctx.view.state.selection.main.head;
  return [...ctx.navigable()].reverse().find((e) => e.to <= head) ?? null;
}

function entryAfterCaret(ctx: ModelActionCtx): SyncEntry | null {
  const head = ctx.view.state.selection.main.head;
  return ctx.navigable().find((e) => e.from >= head) ?? null;
}

/** 选区（或光标前那个元素）落在哪几小节：`from`..`to` 是小节下标。小节线条目算它前面那一小节。 */
function selectedMeasures(ctx: ModelActionCtx, doc: ScoreDoc): { si: number; from: number; to: number } | null {
  const sel = ctx.view.state.selection.main;
  const es = sel.empty ? [entryBeforeCaret(ctx) ?? entryAfterCaret(ctx)].filter((e): e is SyncEntry => !!e) : ctx.selectedEntries();
  const locs = es.map((e) => locate(doc, e.id)).filter((l): l is NonNullable<typeof l> => l !== null);
  if (!locs.length) return null;
  // 插入模式光标落在小节线后面：那是下一小节的开头
  const after = sel.empty && es[0] && (es[0].kind === "barline" || es[0].kind === "break") && es[0].to <= sel.head ? 1 : 0;
  const mis = locs.map((l) => l.mi + after);
  return { si: locs[0]!.si, from: Math.min(...mis), to: Math.max(...mis) };
}

/** 插入位置：光标前是音符就接在它后面；是小节线 / 换行就是下一小节开头；什么都没有就是第一小节开头。 */
function insertAnchor(ctx: ModelActionCtx, doc: ScoreDoc): InsertAnchor | null {
  const sel = ctx.view.state.selection.main;
  const prev = sel.empty ? entryBeforeCaret(ctx) : ctx.selectedEntries().pop() ?? null;
  if (prev?.kind === "note") return { after: prev.id };
  if (prev && (prev.kind === "barline" || prev.kind === "break")) {
    const l = locate(doc, prev.id);
    // 小节开头：插进当前输入的声线（小节线条目借的是小节里最后那个元素的身份，它的声线不算数）
    return l ? { measureStart: { si: l.si, pi: l.pi, mi: l.mi + 1, voice: ctx.curVoice } } : null;
  }
  const next = entryAfterCaret(ctx);
  const l = next ? locate(doc, next.id) : null;
  return l ? { measureStart: { si: l.si, pi: l.pi, mi: l.mi, voice: next?.kind === "note" ? l.chord.voice : ctx.curVoice } } : null;
}

/** 插入模式插一个音（`degreeAt` 按插入位置给唱名：音名要看那里的调号）。别的声线（声部输入）插在光标所在时刻。 */
function insertNote(ctx: ModelActionCtx, degreeAt: (doc: ScoreDoc, at: InsertAnchor) => number): boolean {
  return commit(ctx, (doc) => {
    const at = insertAnchor(ctx, doc);
    if (!at) return { error: tr("ve.cantInsert") };
    const d = degreeAt(doc, at);
    const ref = "after" in at ? locate(doc, at.after) : null;
    if (ref && ref.chord.voice !== ctx.curVoice) {
      const onset = (chordOnset(doc, ref.chord.id) ?? 0) + ref.chord.duration.divisions;
      return insertInVoice(doc, { si: ref.si, pi: ref.pi, mi: ref.mi, onset, staff: ref.chord.staff }, ctx.curVoice, d, ctx.curDur, HOOKS);
    }
    if ("measureStart" in at && at.measureStart.voice !== ctx.curVoice) {
      const m = at.measureStart;
      return insertInVoice(doc, { si: m.si, pi: m.pi, mi: m.mi, onset: 0, staff: 1 }, ctx.curVoice, d, ctx.curDur, HOOKS);
    }
    return insertChord(doc, at, d, ctx.curDur, HOOKS);
  }, true);
}

/** 粘贴（`clipboard.ts`）：插入模式贴在光标处、光标落在贴进来的最后一个音后面；编辑模式贴在选区后面、选中贴进来的那段。 */
export function pasteModel(ctx: ModelActionCtx, items: readonly ClipItem[]): boolean {
  const insert = ctx.view.state.selection.main.empty;
  return commit(ctx, (doc) => {
    const at = insertAnchor(ctx, doc);
    const r = at ? pasteClip(doc, at, items, HOOKS) : { error: tr("ve.cantPaste") };
    return insert && "select" in r ? { caretAfter: r.select[r.select.length - 1]! } : r;
  });
}

/** 移调（`transpose.ts` 的对话框）：全曲换调（音、调号一起移），或选中的音移几个半音。 */
export function transposeModel(ctx: ModelActionCtx, whole: boolean, n: number): boolean {
  if (whole) return commit(ctx, (doc) => transposeScore(doc, n, HOOKS));
  const ids = selectedNotes(ctx);
  if (!ids.length) {
    ctx.setStatus(tr("ve.selectToMove"));
    return true;
  }
  return commit(ctx, (doc) => shiftSemitones(doc, ids, n, HOOKS), true);
}

/** 歌词录入：和弦 `id` 第 `verse` 段写成 `text`（`model/edit.ts::setLyric`），写完选中这个音。 */
export function lyricModel(ctx: ModelActionCtx, id: ElementId, verse: number, text: string, hyphen: boolean, extend: boolean): boolean {
  return commit(ctx, (doc) => setLyric(doc, id, verse, text, hyphen, extend));
}

/** 和弦名录入：和弦 `id` 的和弦名写成 `text`。 */
export function harmonyModel(ctx: ModelActionCtx, id: ElementId, text: string): boolean {
  return commit(ctx, (doc) => setHarmony(doc, id, text));
}

/** 文字 / 力度录入：和弦 `id` 前面那条写成 `text`。 */
export function directionModel(ctx: ModelActionCtx, id: ElementId, type: "words" | "dynamics", text: string): boolean {
  return commit(ctx, (doc) => setDirectionText(doc, id, type, text));
}

/** 某个条目对应的音符 id：音符就是它；小节线、换行是它前面那个音。 */
function anchorNote(ctx: ModelActionCtx): ElementId | null {
  const sel = ctx.view.state.selection.main;
  const e = sel.empty ? entryBeforeCaret(ctx) : ctx.selectedEntries().pop() ?? null;
  return e ? e.id : null;
}

/** 删文字：歌词连同整个 `<lyric>` 元素去掉（连它前面的缩进）；标题清空（原字相同的几处一起）。纯文字改动，局部补丁。 */
function removeText(ctx: ModelActionCtx, e: SyncEntry): boolean {
  const doc = ctx.view.state.doc;
  const text = doc.toString();
  let changes: { from: number; to: number; insert: string }[];
  if (e.kind === "lyric") {
    const open = text.lastIndexOf("<lyric", e.from);
    const close = text.indexOf("</lyric>", e.to);
    if (open < 0 || close < 0) return true;
    let from = open;
    while (from > 0 && /[ \t]/.test(text[from - 1]!)) from--;
    if (from > 0 && text[from - 1] === "\n") from--;
    changes = [{ from, to: close + "</lyric>".length, insert: "" }];
  } else {
    const raw = doc.sliceString(e.from, e.to);
    changes = ctx.sync.ordered().filter((x) => x.kind === "header" && doc.sliceString(x.from, x.to) === raw).map((x) => ({ from: x.from, to: x.to, insert: "" }));
  }
  ctx.view.dispatch({ changes, userEvent: "input.visual" });
  ctx.reloadNow();
  const at = changes[0]!.from;
  ctx.select(at, at);
  return true;
}

/** 删掉一个条目（或一段）：音符删音、小节线并小节、换行去掉、弧去掉。 */
function removeEntries(ctx: ModelActionCtx, targets: SyncEntry[]): boolean {
  if (targets.length === 0) return true;
  const bar = targets.find((e) => e.kind === "barline");
  const brk = targets.find((e) => e.kind === "break");
  const slur = targets.find((e) => e.kind === "mark" && e.markKind === "slur");
  const notes = targets.filter((e) => e.kind === "note").map((e) => e.id);
  if (notes.length) return commit(ctx, (doc) => deleteChords(doc, notes, HOOKS));
  if (bar) {
    return commit(ctx, (doc) => {
      const l = locate(doc, bar.id);
      return l ? mergeMeasures(doc, l.si, l.mi, HOOKS) : { error: tr("ve.noBarline") };
    });
  }
  if (brk) {
    return commit(ctx, (doc) => {
      const l = locate(doc, brk.id);
      return l ? setBreakBefore(doc, l.si, l.mi + 1, null) : { error: tr("ve.noBreak") };
    });
  }
  if (slur && slur.end !== undefined) return commit(ctx, (doc) => toggleSlur(doc, slur.id, slur.end!));
  ctx.setStatus(tr("ve.cantDeleteXml"));
  return true;
}

/**
 * 模型那一路处理这个动作；不归它管的（导航、模式、全选、撤销、格式标记、插入模式改「当前时值」）返回 null，控制器照旧处理。
 */
export function runModelAction(ctx: ModelActionCtx, a: VisualAction, key: string): boolean | null {
  const sel = ctx.view.state.selection.main;
  const edit = !sel.empty;
  const ids = (): ElementId[] => selectedNotes(ctx);
  const need = (fn: (doc: ScoreDoc, ids: ElementId[]) => ModelEdit, sound = false): boolean => {
    const list = ids();
    if (list.length === 0) {
      ctx.setStatus(tr("ve.selectNote"));
      return true;
    }
    return commit(ctx, (doc) => fn(doc, list), sound);
  };
  // 改音高的几样（音级、半音、八度）：插入模式作用于光标前刚插的那个音，光标留在它后面（同 MuseScore 输入态）
  const pitch = (fn: (doc: ScoreDoc, ids: ElementId[]) => ModelEdit): boolean => {
    if (edit) return need(fn, true);
    const prev = entryBeforeCaret(ctx);
    if (prev?.kind !== "note") {
      ctx.setStatus(tr("ve.selectNote"));
      return true;
    }
    return commit(ctx, (doc) => {
      const r = fn(doc, [prev.id]);
      return "select" in r && r.select[0] ? { caretAfter: r.select[0] } : r;
    }, true);
  };
  switch (a.id) {
    case "note.digit": {
      const d = Number(key);
      if (edit) return need((doc, l) => setDegree(doc, l, d, HOOKS), true);
      return insertNote(ctx, () => d);
    }
    case "note.letter": {
      if (edit) return need((doc, l) => setStep(doc, l, key, HOOKS), true);
      return insertNote(ctx, (doc, at) => degreeOfStep(key, anchorFifths(doc, at)));
    }
    case "chord.add": {
      const d = Number(key);
      const id = ids().pop();
      if (id === undefined) {
        ctx.setStatus(tr("ve.selectNote"));
        return true;
      }
      return commit(ctx, (doc) => addChordNote(doc, id, d, HOOKS), true);
    }
    case "voice.set": return null; // 控制器记下当前声部
    case "meas.append":
      return commit(ctx, (doc) => insertMeasure(doc, 0, doc.songs[0]?.parts[0]?.measures.length ?? 0, HOOKS));
    case "meas.insert":
      return commit(ctx, (doc) => {
        const r = selectedMeasures(ctx, doc);
        return insertMeasure(doc, r?.si ?? 0, r?.from ?? 0, HOOKS);
      });
    case "meas.delete":
      return commit(ctx, (doc) => {
        const r = selectedMeasures(ctx, doc);
        return r ? deleteMeasures(doc, r.si, r.from, r.to, HOOKS) : { error: tr("ve.selectMeasToDelete") };
      });
    case "meas.key":
    case "meas.time":
    case "meas.tempo": {
      const hint = a.id === "meas.key" ? tr("ve.hint.key") : a.id === "meas.time" ? tr("ve.hint.time") : tr("ve.hint.tempo");
      void ctx.prompt(hint, "").then((v) => {
        if (v === null) return;
        commit(ctx, (doc) => {
          const r = selectedMeasures(ctx, doc);
          if (!r) return { error: tr("ve.selectInMeasure") };
          if (a.id === "meas.key") {
            const f = parseKeyInput(v);
            return f === null ? { error: tr("ve.badKey", { v }) } : setKeyAt(doc, r.si, r.from, f, HOOKS);
          }
          if (a.id === "meas.time") {
            const t = parseTimeInput(v);
            return t ? setTimeAt(doc, r.si, r.from, t.beats, t.beatType, HOOKS) : { error: tr("ve.badTime", { v }) };
          }
          const bpm = parseTempoInput(v);
          return bpm === null ? { error: tr("ve.badTempo", { v }) } : setTempoAt(doc, r.si, r.from, bpm);
        });
      });
      return true;
    }
    case "bar.single":
    case "bar.double":
    case "bar.final":
    case "bar.repeatStart":
    case "bar.repeatEnd": {
      const kind = a.id.slice(4) as BarKind;
      return commit(ctx, (doc) => {
        const r = selectedMeasures(ctx, doc);
        if (!r) return { error: tr("ve.selectMeasOrBar") };
        return setBarKind(doc, r.si, kind === "repeatStart" ? r.from : r.to, kind);
      });
    }
    case "volta.1":
    case "volta.2":
      return commit(ctx, (doc) => {
        const r = selectedMeasures(ctx, doc);
        return r ? toggleEnding(doc, r.si, r.from, r.to, a.id === "volta.1" ? 1 : 2) : { error: tr("ve.selectVolta") };
      });
    case "jump.segno":
    case "jump.coda":
    case "jump.dc":
    case "jump.ds":
    case "jump.fine":
      return commit(ctx, (doc) => {
        const r = selectedMeasures(ctx, doc);
        const kind = a.id.slice(5) as JumpKind;
        if (!r) return { error: tr("ve.selectInMeasure") };
        return toggleJump(doc, r.si, kind === "segno" || kind === "coda" ? r.from : r.to, kind);
      });
    case "oct.up": return pitch((doc, l) => shiftOctave(doc, l, 1, HOOKS));
    case "oct.down": return pitch((doc, l) => shiftOctave(doc, l, -1, HOOKS));
    case "step.up": return pitch((doc, l) => stepDegree(doc, l, 1, HOOKS));
    case "step.down": return pitch((doc, l) => stepDegree(doc, l, -1, HOOKS));
    case "semi.up": return pitch((doc, l) => stepSemitone(doc, l, 1, HOOKS));
    case "semi.down": return pitch((doc, l) => stepSemitone(doc, l, -1, HOOKS));
    case "acc.sharp": return need((doc, l) => toggleAccidental(doc, l, "sharp", HOOKS), true);
    case "acc.flat": return need((doc, l) => toggleAccidental(doc, l, "flat", HOOKS), true);
    case "acc.natural": return need((doc, l) => toggleAccidental(doc, l, "natural", HOOKS), true);
    case "dur.dot": return need((doc, l) => toggleDot(doc, l, HOOKS));
    case "dur.halve": return edit ? need((doc, l) => scaleDuration(doc, l, 0.5, HOOKS)) : null;
    case "dur.double": return edit ? need((doc, l) => scaleDuration(doc, l, 2, HOOKS)) : null;
    case "sus.add": {
      // 模型里没有独立的增时线：给选中的（插入模式：光标前那个）音多一拍
      const id = edit ? ids().pop() : (() => {
        const p = entryBeforeCaret(ctx);
        return p?.kind === "note" ? p.id : undefined;
      })();
      if (id === undefined) {
        ctx.setStatus(tr("ve.selectNote"));
        return true;
      }
      return commit(ctx, (doc) => addBeat(doc, id, HOOKS));
    }
    case "slur.toggle": {
      const l = ids();
      if (l.length < 2) {
        ctx.setStatus(tr("ve.slurTwo"));
        return true;
      }
      return commit(ctx, (doc) => toggleSlur(doc, l[0]!, l[l.length - 1]!));
    }
    case "tuplet.toggle": return need((doc, l) => toggleTuplet(doc, l, HOOKS));
    case "tie.toggle": return need((doc, l) => toggleTie(doc, l[0]!));
    case "deco.fermata": return need((doc, l) => toggleDeco(doc, l, "fermata"));
    case "deco.accent": return need((doc, l) => toggleDeco(doc, l, "accent"));
    case "bar.insert": {
      const id = anchorNote(ctx);
      if (id === null) return true;
      return commit(ctx, (doc) => splitMeasure(doc, id, HOOKS));
    }
    case "brk.line":
    case "brk.page": {
      const id = anchorNote(ctx);
      if (id === null) return true;
      const page = a.id === "brk.page";
      return commit(ctx, (doc) => {
        const l = locate(doc, id);
        if (!l) return { error: tr("ve.noBreakPos") };
        const last = [...l.measure.elements].reverse().find((e) => e.kind === "chord" && e.voice === l.chord.voice);
        if (last !== l.chord) return { error: tr("ve.breakAtBar") };
        return setBreakBefore(doc, l.si, l.mi + 1, page ? "page" : "system");
      });
    }
    case "del.forward":
    case "del.back": {
      // Alt+点击单独选中的和弦音：只删它
      const pn = ctx.pickedChordNote;
      if (edit && pn) return commit(ctx, (doc) => removeChordNote(doc, pn.id, pn.index, HOOKS));
      // 选中的是一段文字（歌词、标题）：直接改原文里那几个字
      const text = edit ? ctx.sync.range(sel.from, sel.to).find((e) => (e.kind === "lyric" || e.kind === "header") && e.from === sel.from && e.to === sel.to) : undefined;
      if (text) return removeText(ctx, text);
      if (edit) return removeEntries(ctx, ctx.selectedEntries());
      const t = a.id === "del.forward" ? entryAfterCaret(ctx) : entryBeforeCaret(ctx);
      return removeEntries(ctx, t ? [t] : []);
    }
  }
  return null;
}
