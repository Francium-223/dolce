// 选中元素的读数（谱面标题栏右侧那一小行）：声部、第几小节第几拍、音高（音名 + 唱名）、时值。
// 同 MuseScore 状态栏的那一行——改音、数拍时不用回头对原文。只读模型，不碰谱面。

import type { Chord, ElementId, Key, ScoreDoc, Time } from "../../model/doc";
import { SIMPLE_DIVISIONS } from "../../model/doc";
import { degreeFromPitch, pitchFromDegree } from "../../model/jianpu";

const TYPE_NAME: Record<string, string> = {
  maxima: "八全", long: "四全", breve: "倍全", whole: "全", half: "二分", quarter: "四分",
  eighth: "八分", "16th": "十六分", "32nd": "三十二分", "64th": "六十四分", "128th": "128 分", "256th": "256 分",
};

const ACC_MARK: Record<string, string> = { sharp: "♯", flat: "♭", natural: "♮", "double-sharp": "𝄪", "double-flat": "𝄫" };

/** 唱名连八度点：高音 `1'`、低音 `1,`（与 123 的写法一致，读的人一眼对得上原文）。 */
function degreeText(n: number, shift: number, acc?: string): string {
  const pre = acc ? ACC_MARK[acc] ?? "" : "";
  return pre + String(n) + (shift > 0 ? "'".repeat(shift) : ",".repeat(-shift));
}

/** 音名：`E4`、`F♯5`。 */
function pitchText(step: string, alter: number, octave: number): string {
  const acc = alter === 1 ? "♯" : alter === -1 ? "♭" : alter === 2 ? "𝄪" : alter === -2 ? "𝄫" : "";
  return `${step}${acc}${octave}`;
}

function durText(c: Chord): string {
  const t = c.duration.type ? TYPE_NAME[c.duration.type] ?? c.duration.type : "";
  const dots = c.duration.dots ? "附点".repeat(c.duration.dots) : "";
  const tup = c.duration.timeMod ? `（${c.duration.timeMod.actual} 连音）` : "";
  return t ? `${dots}${t}${tup}` : "";
}

/**
 * 元素 `id` 的读数；找不到为 null。拍位按拍号的拍（`4/4` 数四分、`6/8` 数八分），从 1 数，
 * 落在拍中间的写小数（`2.5`）。简谱形状的模型一拍 48 divisions（`SIMPLE_DIVISIONS`），MusicXML 按各小节 `divisions`。
 */
export function selectionInfo(doc: ScoreDoc | null, id: ElementId): string | null {
  if (!doc) return null;
  for (const song of doc.songs) {
    const multi = song.parts.length > 1;
    for (const [pi, part] of song.parts.entries()) {
      let divisions = SIMPLE_DIVISIONS;
      let key: Key | undefined = song.key;
      let time: Time | undefined = song.time;
      for (const [mi, m] of part.measures.entries()) {
        if (m.attrs?.divisions) divisions = m.attrs.divisions;
        if (m.attrs?.key) key = m.attrs.key;
        if (m.attrs?.time) time = m.attrs.time;
        const voiceAt = new Map<number, number>();
        for (const el of m.elements) {
          if (el.kind !== "chord" && el.kind !== "space") continue;
          const dur = el.kind === "chord" ? (el.grace ? 0 : el.duration.divisions) : (el.duration?.divisions ?? 0);
          const start = el.kind === "chord" && el.onset !== undefined ? el.onset : voiceAt.get(el.voice) ?? 0;
          voiceAt.set(el.voice, start + dur);
          if (el.id !== id || el.kind !== "chord") continue;
          const beatUnit = time ? (divisions * 4) / time.beatType : divisions;
          const beat = Math.round((start / beatUnit + 1) * 100) / 100;
          const parts: string[] = [];
          if (multi) parts.push(part.name?.trim() || `声部 ${pi + 1}`);
          parts.push(`第 ${m.number || mi + 1} 小节 · 第 ${beat} 拍`);
          if (el.rest) parts.push("休止");
          else if (el.notes.length) {
            const n = el.notes[0]!;
            const pitch = n.pitch ?? (n.degree && key ? pitchFromDegree(n.degree, key) : null);
            const deg = n.degree ?? (n.pitch && key ? degreeFromPitch(n.pitch, key, n.accidental) : null);
            const names: string[] = [];
            if (pitch) names.push(pitchText(pitch.step, pitch.alter, pitch.octave));
            if (deg && deg.number > 0) names.push(`唱名 ${degreeText(deg.number, deg.octaveShift, deg.accidental)}`);
            if (el.notes.length > 1) names.push(`和弦 ${el.notes.length} 音`);
            if (names.length) parts.push(names.join("，"));
          }
          const d = durText(el);
          if (d) parts.push(d);
          return parts.join(" · ");
        }
      }
    }
  }
  return null;
}
