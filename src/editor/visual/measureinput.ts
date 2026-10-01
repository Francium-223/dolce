// 「调号… / 拍号… / 速度…」输入框里的字怎么读。两路（文本格式、`.musicxml`）共用。

const MAJOR_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

/**
 * 调号：`1=G`、`G`、`bB` / `Bb` / `B♭`、`#F` / `F#`、`Eb大调`（只认大调主音），也收整数升降号个数（`+2`、`-3`）。
 * 返回升号个数（降号为负）；读不懂为 null。
 */
export function parseKeyInput(s: string): number | null {
  const t = s.trim().replace(/^1\s*=\s*/, "").replace(/[♯＃]/g, "#").replace(/♭/g, "b").replace(/(大调|major|maj)$/i, "").trim();
  if (/^[+-]?\d$/.test(t)) {
    const n = Number(t);
    return n >= -7 && n <= 7 ? n : null;
  }
  const m = /^([#b]?)([A-Ga-g])([#b]?)$/.exec(t);
  if (!m) return null;
  const acc = m[1] || m[3] || "";
  const name = m[2]!.toUpperCase() + acc;
  return MAJOR_FIFTHS[name] ?? null;
}

/** 调号的写法（123 的 `1=G`、ABC 的 `G`）要的主音名。 */
export function keyTonic(fifths: number): string {
  return Object.entries(MAJOR_FIFTHS).find(([, v]) => v === fifths)?.[0] ?? "C";
}

/** 拍号：`3/4`、`6/8`（分母是 2 的幂）。 */
export function parseTimeInput(s: string): { beats: number; beatType: number } | null {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(s);
  if (!m) return null;
  const beats = Number(m[1]);
  const beatType = Number(m[2]);
  return beats > 0 && [1, 2, 4, 8, 16, 32].includes(beatType) ? { beats, beatType } : null;
}

/** 速度：每分钟拍数（`90`、`♩=90`、`1/4=90`）；空或 0 = 去掉（返回 0）；读不懂为 null。 */
export function parseTempoInput(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  const m = /(\d{1,3})\s*$/.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 400 ? n : null;
}
