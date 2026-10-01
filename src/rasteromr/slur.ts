// 弧线（圆滑线 / 连音线）：**又宽又扁、逐列一段墨、而且拱着**的那一团。
//
// 无主 contour 报表里最大的一类带外图形就是它（实测 6~15 格宽、1~3 格高、
// 团状度 0.03~0.07），而位图路至今一条都不认——GT 里宁静 283 条、破碎 326 条。
//
// 与松叶（`wedge.ts`）是同一批候选里分出来的两类，判据正好相反：
//   - 松叶：逐列**两段**墨（两条臂），或者一条臂——**直**的；
//   - 弧线：逐列**一段**墨，而且**拱**（离两端连线最远处超过 0.25 格）。
//
// 认出来之后交给矢量路现成的那一套（`staffomr/slur.ts`）：`attachSlurs` 挂两端、
// `reconnectSlurs` 接回跨行的、`markSlurNotes` 落到音符上，`toxml` 出 `<slur>`/`<tied>`
// ——那边一行不改，只是这边要造一个假 `PObj` 装着盒（与 `adapt.ts` 造假字形同一套路）。
import type { Rect } from "../omr/types";
import { PObj } from "../staffomr/model";
import type { SlurArc } from "../staffomr/slur";
import type { Contour, ContourMap } from "./contour";
import type { RasterUnit } from "./staffline";

/** 形状闸（一律按线距）。 */
/** 宽度下限。扫过 2.0 / 1.4 / 1.2 / 1.0：圆滑线 37.6 / **39.4** / 39.4 / 39.4%
 *  （凭空多出 23 → 25），1.4 往下是平台，取 1.4。 */
const MIN_W = 1.4;
const MAX_W = 40;
const MAX_H = 4.0;
/** 团状度上限：又宽又扁才有资格。 */
const MAX_COMPACT = 0.25;
/** 逐列一段墨的列要占多少——两段的是松叶。 */
const ONE_RUN_FRAC = 0.8;
/** **拱**：离两端连线最远处的下限（线距）。直的那些是松叶的臂、加线、连音线的一截。 */
const BOW_MIN = 0.25;
/** 弧线细：逐列的墨迹跨度不该超过这么多（线距）。跨度大的是松叶或实心块。 */
const SPREAD_MAX = 0.6;

/**
 * 从 contour 层里挑出弧。
 *
 * @param only 只看这些 contour（传账本里**无主**的那些）。
 * @param nextId 造假 `PObj` 用的起始 id（与页面里其它对象别撞号）。
 */
export function findRasterSlurs(map: ContourMap, unit: RasterUnit, only: Contour[], nextId: number): SlurArc[] {
  const out: SlurArc[] = [];
  for (const c of only) {
    if (c.w < MIN_W || c.w > MAX_W || c.h > MAX_H) continue;
    if (c.compact > MAX_COMPACT) continue;
    const arc = judgeArc(map, c, unit, nextId + out.length);
    if (arc) out.push(arc);
  }
  return out;
}

function judgeArc(map: ContourMap, c: Contour, unit: RasterUnit, id: number): SlurArc | null {
  const b = c.bbox;
  const ys: number[] = [];
  let one = 0;
  let cols = 0;
  let wide = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    let top = -1;
    let bot = -1;
    let runs = 0;
    let prev = false;
    let sum = 0;
    let n = 0;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map.labels[y * map.w + x] === c.id;
      if (on) {
        if (top < 0) top = y;
        bot = y;
        sum += y;
        n++;
        if (!prev) runs++;
      }
      prev = on;
    }
    if (n === 0) {
      ys.push(NaN);
      continue;
    }
    cols++;
    if (runs === 1) one++;
    if (bot - top > unit.space * SPREAD_MAX) wide++;
    ys.push(sum / n);
  }
  if (!cols || one < cols * ONE_RUN_FRAC) return null;
  if (wide > cols * 0.15) return null; // 跨度大的列太多：那是松叶或实心块
  // **两端的 y 只取最外那一小截**（三十分之一），不能取六分之一：
  // 弧的两头是尖的，往里取一段，端点的 y 会被拉向弧背，`validateSlurNote`
  // 的「在符头上方/下方三格以内」就判偏了。扫过 1/6、1/12、1/30、1/60、一列：
  // 圆滑线 34.0 / 36.6 / **37.6** / 37.6 / 37.8%——1/30 起是平台。
  const q = Math.max(1, Math.round(ys.length / 30));
  const mean = (a: number[]) => {
    const v = a.filter((y) => !Number.isNaN(y));
    return v.length ? v.reduce((s, y) => s + y, 0) / v.length : NaN;
  };
  const ly = mean(ys.slice(0, q));
  const ry = mean(ys.slice(-q));
  if (Number.isNaN(ly) || Number.isNaN(ry)) return null;
  // 拱多少、往哪边拱：离两端连线最远的那一点（y 向下，负 = 拱在上方）
  let bow = 0;
  for (let i = 0; i < ys.length; i++) {
    if (Number.isNaN(ys[i])) continue;
    const t = ys.length > 1 ? i / (ys.length - 1) : 0;
    const d = ys[i] - (ly + (ry - ly) * t);
    if (Math.abs(d) > Math.abs(bow)) bow = d;
  }
  if (Math.abs(bow) < unit.space * BOW_MIN) return null; // 直的不是弧
  const box: Rect = { x: b.x, y: b.y, w: b.w, h: b.h };
  return {
    obj: fakeArcObj(id, box),
    lx: b.x,
    ly,
    rx: b.x + b.w - 1,
    ry,
    // `above` = 弧画在音符**上方**（开口向下）：中间比两端高，y 向下就是 bow < 0
    above: bow < 0,
    tie: false,
  };
}

/** 造一个只带包围盒的假对象——`SlurArc.obj` 要一个 `PObj`，下游只用它的盒与标记。 */
function fakeArcObj(id: number, box: Rect): PObj {
  const o = new PObj(id, { id, kind: "path", bbox: box, fill: "#000", stroke: null, lineWidth: 0, path: [], clip: null, curves: 0 } as unknown as never, null);
  o.addTag("Slur");
  return o;
}

// ── 虚线弧 ─────────────────────────────────────────────────────────────────
//
// 诗歌本里第二段起唱法不同的那几处，圆滑线 / 连音线画成**虚线**（Holy, Holy, Holy 十二条）。
// 每一截只有 0.7×0.25 格，单看是噪点；成串看：一截截**等宽、等距、排成一线**的短横划。
// 两端那一截常粘在符头、符干上，认出来的只是中段——端点仍落在两个音符之间，`attachSlurs` 挂得上。

/** 一截短划的尺寸（格）：宽、高上限，宽高比下限。弧两头那截是斜的，8×5 像素（0.42 格高、宽高比 1.6）。 */
const DASH_W = [0.35, 1.0] as const;
const DASH_H = 0.5;
const DASH_ASPECT = 1.4;
/** 相邻两截的间隔（格）、竖向错开上限（格），宽度比上下限。 */
const DASH_GAP = [0.25, 0.9] as const;
const DASH_DY = 0.35;
const DASH_WR = [0.6, 1.6] as const;
/** 至少几截；各间隔之间最多差多少（格）。 */
const DASH_MIN = 3;
const DASH_GAP_SPREAD = 0.3;

/**
 * 从无主 contour 里串出虚线弧。`side(x0, x1, y)` 由调用方给：这一串近旁的符头在它下方返回 `"above"`
 *（弧画在音符上方）、在上方返回 `"below"`，近旁没有符头、或落在歌词带那种地方返回 `null`（不认）。
 */
export function findRasterDashedSlurs(
  only: Contour[],
  unit: RasterUnit,
  nextId: number,
  side: (x0: number, x1: number, y: number) => "above" | "below" | null,
): SlurArc[] {
  const sp = unit.space;
  const dashes = only
    .filter((c) => {
      const b = c.bbox;
      return b.w >= sp * DASH_W[0] && b.w <= sp * DASH_W[1] && b.h <= sp * DASH_H && b.w >= b.h * DASH_ASPECT;
    })
    .map((c) => c.bbox)
    .sort((a, b) => a.x - b.x);
  const used = new Set<Rect>();
  const out: SlurArc[] = [];
  for (const d0 of dashes) {
    if (used.has(d0)) continue;
    const chain = [d0];
    for (;;) {
      const cur = chain[chain.length - 1]!;
      const cy = cur.y + cur.h / 2;
      const next = dashes.find((d) => {
        if (used.has(d) || chain.includes(d)) return false;
        const gap = d.x - (cur.x + cur.w);
        const wr = d.w / cur.w;
        return gap >= sp * DASH_GAP[0] && gap <= sp * DASH_GAP[1] && Math.abs(d.y + d.h / 2 - cy) <= sp * DASH_DY && wr >= DASH_WR[0] && wr <= DASH_WR[1];
      });
      if (!next) break;
      chain.push(next);
    }
    if (chain.length < DASH_MIN) continue;
    const gaps = chain.slice(1).map((d, i) => d.x - (chain[i]!.x + chain[i]!.w));
    if (Math.max(...gaps) - Math.min(...gaps) > sp * DASH_GAP_SPREAD) continue;
    const first = chain[0]!;
    const last = chain[chain.length - 1]!;
    const ly = first.y + first.h / 2;
    const ry = last.y + last.h / 2;
    const midY = chain.reduce((a, d) => a + d.y + d.h / 2, 0) / chain.length;
    const where = side(first.x, last.x + last.w, midY);
    if (!where) continue;
    for (const d of chain) used.add(d);
    const x0 = first.x;
    const y0 = Math.min(...chain.map((d) => d.y));
    const box: Rect = { x: x0, y: y0, w: last.x + last.w - x0, h: Math.max(...chain.map((d) => d.y + d.h)) - y0 };
    out.push({ obj: fakeArcObj(nextId + out.length, box), lx: x0, ly, rx: last.x + last.w - 1, ry, above: where === "above", tie: false, dashed: true });
  }
  return out;
}

