// 谱后单独排版的附段歌词：谱行下只配第 1 段，第 2…N 段按诗行印在谱子后面，不跟音符对齐
// （圣徒诗歌 11《仰看穹苍浩大无穷》：「二」「三」各领一段四行诗）。
//
// 这块字进不了歌词通道——lyrics.ts S1 给末谱行的下方带按行距封了底（防谱后正文），本来也不该进：
// 它没有 x 可对。这里另走一路：DBNet 检测整块、逐行识别，按段号/空行切段，再照**第 1 段的音位骨架**
// 逐字填进去——第 1 段有字的音依次是各段的起字音位，melisma 的分布跟第 1 段一样。
//
// 判据只有一条：**这一段的音节数等于第 1 段的起字音位数**（容 OCR 多读漏读两个字）。
// 谱后的背景介绍/版权说明是散文，字数碰不上，整块照旧丢掉（1600《南非之行》那九段正文）。
import type { Binary, StaffRow, TextRegion } from "./types";
import { rbottom } from "./types";
import type { OcrBackend } from "./ocr";
import { CN_NUM, LYRIC_PUNCT, LYRIC_QUOTE_CLOSE, LYRIC_QUOTE_OPEN, normPunct } from "./lyrics";
import { median } from "./geom";
import { probe } from "./probe";

const isHanzi = (c: string) => /[一-鿿]/.test(c);
const isLatin = (c: string) => /[A-Za-z']/.test(c);

// 整行只有段号：「二」「2」「2.」「（二）」
const LABEL_ONLY_RE = new RegExp(`^[(（]?([${CN_NUM}]|\\d{1,2})[)）]?[.、．。:：]?$`);
// 段号领着正文：「2.夕阳…」「二、夕阳…」——必须带分隔符，裸「一面运行」的「一」是正文
const LABEL_PREFIX_RE = new RegExp(`^[(（]?([${CN_NUM}]|\\d{1,2})[)）]?[.、．](?=.)`);
/** 音节数与第 1 段音位数至多差几个还照填（OCR 多读/漏读一两个字） */
const COUNT_TOL = 2;

/** 一段诗文拆成音节：汉字一字一个，拉丁词按空白/连字符断；收尾标点、闭引号贴前字，开引号领起后字。
 *  规则与 lyrics.ts 装配谱下歌词那一路一致，两边拆出来的数才可比。 */
export function toSyllables(text: string): string[] {
  const out: string[] = [];
  let lead = "", pend = "";
  const flush = () => { if (pend) { out.push(lead + pend); lead = ""; pend = ""; } };
  for (const ch of text) {
    if (isHanzi(ch)) { flush(); out.push(lead + ch); lead = ""; }
    else if (isLatin(ch)) pend += ch;
    else if (ch === "-") { if (pend) { pend += "-"; flush(); } }
    else if (/\s/.test(ch)) flush();
    else if (LYRIC_QUOTE_OPEN.test(ch) && !pend) lead += normPunct(ch);
    else if (LYRIC_PUNCT.test(ch) || LYRIC_QUOTE_CLOSE.test(ch)) {
      if (pend) pend += normPunct(ch);
      else if (out.length) out[out.length - 1] += normPunct(ch);
    }
  }
  flush();
  return out;
}

interface Stanza { label?: string; lines: { text: string; bbox: TextRegion["bbox"] }[] }

/** 识别谱后附段并按第 1 段的音位骨架写进各音符的 `lyrics[v]`。返回收下的诗文行（识别模式叠加用）。
 *  一页两调的（选本诗歌712「(第一调)」谱 + 附段 +「(第二调)」谱）按谱行间的大间隔（>3 倍行距，同 lyrics.ts 的段末行）
 *  切成几段，每段在它与下一段之间找附段、按本段第 1 段的音位骨架填。 */
export async function recognizeTrailingStanzas(
  bin: Binary, staff: StaffRow[], numH: number, ocr: OcrBackend, lyricRegions: TextRegion[] | undefined,
): Promise<TextRegion[]> {
  if (!ocr.recognizeRegion) return [];
  const rows = staff.filter((r) => r.nums.length);
  if (!rows.length) return [];
  const tops = rows.map((r) => r.topY);
  const pitch = tops.length >= 2 ? median(tops.slice(1).map((t, j) => t - tops[j]!)) : 0;
  const segs: StaffRow[][] = [[]];
  rows.forEach((r, i) => {
    // 多声部页不切（同 lyrics.ts 段末行）
    if (i > 0 && pitch > 0 && r.system === undefined && r.topY - rows[i - 1]!.topY > pitch * 3) segs.push([]);
    segs[segs.length - 1]!.push(r);
  });
  if (segs.length > 1) probe("stanza.segments");
  const out: TextRegion[] = [];
  for (let k = 0; k < segs.length; k++) {
    const next = segs[k + 1]?.[0];
    const y1 = next ? Math.round(next.topY - numH * 0.5) : bin.h;
    out.push(...await stanzasOfSegment(bin, segs[k]!, numH, ocr, lyricRegions, y1));
  }
  return out;
}

async function stanzasOfSegment(
  bin: Binary, rows: StaffRow[], numH: number, ocr: OcrBackend, lyricRegions: TextRegion[] | undefined, yEnd: number,
): Promise<TextRegion[]> {
  const last = rows[rows.length - 1];
  if (!last || !ocr.recognizeRegion) return [];

  // 第 1 段的起字音位：谱下有字的音，按谱面顺序。
  const slots = rows.flatMap((r) => r.nums.filter((n) => n.lyrics?.[0]));
  if (slots.length < 8) return [];

  // 区域：末谱行歌词下缘 → 下一段首行（没有就到图底）。末行下没配词（器乐尾奏）就从谱行底下一个字高起。
  const below = (lyricRegions ?? []).filter((r) => r.bbox.y >= last.bottomY - numH * 0.2 && r.bbox.y < yEnd);
  const y0 = Math.round((below.length ? Math.max(...below.map((r) => rbottom(r.bbox))) : last.bottomY + numH) + numH * 0.3);
  if (yEnd - y0 < numH * 2) return [];
  const dets = (await ocr.recognizeRegion(bin, { x: 0, y: y0, w: bin.w, h: yEnd - y0 }))
    .map((d) => ({ text: d.text.trim(), bbox: d.bbox }))
    .filter((d) => d.text);
  if ((globalThis as { __omrDebug?: boolean }).__omrDebug) {
    console.log("[stanzas/det]", dets.map((d) => `${Math.round(d.bbox.h)}px@${Math.round(d.bbox.y)}=${JSON.stringify(d.text)}`).join("  "));
  }
  if (!dets.length) return [];
  // 先按纵向重叠聚成视觉行、行内按 x 排：一行诗常分两半印（选本诗歌712「我乃天上的人，　暂居世间，」），
  // 段号「二」也单独成框——各框顶端参差几个像素，只按 y 排，右半句、段号就会插到左半句前面，切段全乱。
  dets.sort((a, b) => a.bbox.y - b.bbox.y);
  const vlines: (typeof dets)[] = [];
  for (const d of dets) {
    const ln = vlines.find((l) => l.some((o) => Math.min(rbottom(o.bbox), rbottom(d.bbox)) - Math.max(o.bbox.y, d.bbox.y) >= Math.min(o.bbox.h, d.bbox.h) * 0.5));
    if (ln) ln.push(d); else vlines.push([d]);
  }
  vlines.sort((a, b) => Math.min(...a.map((d) => d.bbox.y)) - Math.min(...b.map((d) => d.bbox.y)));
  // 页脚注释从这里起就不是诗了：选本诗歌712 通本在附段下面印「(337)1.生命的饼：指主的话语。…」，
  // 行首是括号括着的曲号。混进末段就字数对不上、整块被拒。演唱说明「(唱至第五、六节的“和”时…)」同理（304）
  // 下一调的小标题「(第二调)」「降E调 4/4」也是截断处
  const noteAt = vlines.findIndex((l) => {
    const t = [...l].sort((a, b) => a.bbox.x - b.bbox.x).map((d) => d.text).join("");
    return /^[(（](?:\d{1,4}[)）]|唱|注)/.test(t) || /[(（]第.{1,3}调[)）]|调\s*\d{1,2}\s*[/／]\s*\d{1,2}/.test(t);
  });
  if (noteAt >= 0) { probe("stanza.footnoteCut"); vlines.length = noteAt; }
  const ordered = vlines.flatMap((l) => l.sort((a, b) => a.bbox.x - b.bbox.x).map((d, i) => ({ ...d, lineStart: i === 0, lineLen: l.length })));

  // 切段：段号开新段；没段号时按空行（行距明显大于常规行距）断开。
  const lineH = median(dets.map((d) => d.bbox.h)) || numH;
  const stanzas: Stanza[] = [];
  let cur: Stanza | null = null;
  let prevBottom = -Infinity;
  // 下一个段号（上一段是「二」就等「三」）：段号与正文粘成一框又不带分隔符的（选本诗歌712 246
  //「三世界虽然充满鬼魅…」）只在视觉行首、且正是顺下来的那个号时才切——裸「一面运行」这种不会碰上。
  // 还没切出任何段时等的是「二」——谱下配的就是第 1 段（选本 167「二由死而生—何等奇妙的复活！」）
  // 段号漏检的段（408「二」没检出来）按段数往下推
  const nextLabel = () => {
    if (!stanzas.length) return CN_NUM[1];
    const k = cur?.label ? CN_NUM.indexOf(cur.label) : stanzas.length;
    return k >= 0 && k + 1 < CN_NUM.length ? CN_NUM[k + 1] : undefined;
  };
  const labeled = ordered.some((d) => d.lineStart && (LABEL_ONLY_RE.test(d.text) || LABEL_PREFIX_RE.test(d.text)));
  for (const d of ordered) {
    const nl = nextLabel();
    // 段号读错了字（684「西」= 四、「三卷」）：视觉行首单独一个 1–2 字的小框、同一行后面还跟着正文，照样是段号
    const only = LABEL_ONLY_RE.exec(d.text) ??
      (labeled && d.lineStart && d.lineLen > 1 && [...d.text].length <= 2 && nl ? ([d.text, nl] as unknown as RegExpExecArray) : null);
    const glued = !only && d.lineStart && nl && d.text.length > 1 && d.text[0] === nl ? ([nl, nl] as unknown as RegExpExecArray) : null;
    const pre = only ? null : LABEL_PREFIX_RE.exec(d.text) ?? glued;
    if (glued && pre === glued) probe("stanza.gluedLabel");
    // 有段号就按段号切，不再按空行断：行距宽的版面（选本诗歌712 637，行间空当超过一个框高）段内也像空行
    const gapBreak = !labeled && d.lineStart && d.bbox.y - prevBottom > lineH * 1.2;
    prevBottom = d.lineStart ? rbottom(d.bbox) : Math.max(prevBottom, rbottom(d.bbox));
    if (only) { stanzas.push(cur = { label: only[1], lines: [] }); continue; }
    if (pre) {
      stanzas.push(cur = { label: pre[1], lines: [{ text: d.text.slice(pre[0].length), bbox: d.bbox }] });
      continue;
    }
    // 段号行后面紧跟的第一行不算空行断开（段号与正文之间本来就隔着点距离）
    if (!cur || (gapBreak && cur.lines.length)) stanzas.push(cur = { lines: [] });
    cur.lines.push({ text: d.text, bbox: d.bbox });
  }

  // 逐段对音位数；一段对不上，整块当正文丢掉（散文碰巧有一段字数对上的概率不值得冒险）。
  // 带副歌的：附段只配主歌那几行，副歌每段照唱、不重印（选本诗歌712 529：二三四段各两行诗，只对前两谱行，
  // 后两行「和」领起的副歌不在附段里）。所以音位数不必等于整首，可以等于**到某一谱行为止**的前缀——
  // 各段须落在同一条行界上。整首对得上优先。
  const sylls = stanzas.filter((s) => s.lines.length).map((s) => toSyllables(s.lines.map((l) => l.text).join("")));
  const cum: number[] = [];
  rows.reduce((a, r) => { const v = a + r.nums.filter((n) => n.lyrics?.[0]).length; cum.push(v); return v; }, 0);
  const fits = (S: number) => sylls.every((sy) => Math.abs(sy.length - S) <= COUNT_TOL);
  const S = !sylls.length ? 0 : fits(slots.length) ? slots.length
    : [...cum].reverse().find((c) => c >= 8 && c < slots.length && fits(c)) ?? 0;
  if (!S) {
    if (sylls.length) probe("stanza.rejected");
    return [];
  }
  if (S < slots.length) probe("stanza.versePrefix");

  const base = Math.max(1, ...rows.flatMap((r) => r.nums.map((n) => n.lyrics?.length ?? 0)));
  sylls.forEach((sy, k) => {
    const v = base + k;
    if (sy.length !== S) probe("stanza.countMismatch");
    slots.slice(0, S).forEach((n, i) => { (n.lyrics ??= [])[v] = sy[i] ?? ""; });
  });
  probe("stanza");
  return stanzas.flatMap((s) => s.lines.map((l) => ({ text: l.text, bbox: l.bbox })));
}
