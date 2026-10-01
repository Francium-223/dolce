// 简谱 OMR 的编辑器侧控制器：识别 → 出文本 → 叠加核对视图 → 点选定位。
//
// 从 App 里整体切出来的一块。它自己拿着识别产物（二值图 / RecognizedScore / 代码区间映射 /
// 输出格式）与那几个工具条控件，只通过下面的 OmrHost 向 App 要能力——**故意把这个接口
// 列全**：它就是「识别这摊事到底依赖编辑器多少东西」的清单，越短越好，加东西前先想想。
//
// 识别产物的关键性质：`RecognizedScore` 与输出格式无关，留在内存里；换格式只重走
// omr/emit.ts 的 emitter，绝不重跑识别。输出格式的下拉与打开文件后切格式是同一个
// （`formatswitch.ts`），这里作为它的一种来源（`FormatSource`）。
import { recognizedBeatIssues, type RecognizedBeatIssue } from "../omr/beats";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  recognizeMusicppDetailed, renderRecognitionSvg, renderRowPopup, renderHeaderPopup, renderRowSource,
  OMR_EMITTERS, DEFAULT_OMR_FORMAT, isOmrFormat, omrEmitter,
  type OmrFormat, type RecogView,
} from "../omr";
import type { Binary, JpwMeta, RecognizedScore } from "../omr";
import type { ElementId, ScoreDoc } from "../model/doc";
import type { PlayPoint } from "./player";
import type { DocFormatId } from "./formats";
import { confirmDiscardEdits, type FormatOption, type FormatSource, type FormatSwitch } from "./formatswitch";
import { reprojectRecognized, type Reprojected } from "../omr/reproject";

/** 是否 PDF 字节（mime 或 `%PDF-` 魔数）。与 `omr/decode.ts` 里那份同判据。 */
function isPdfBytes(bytes: Uint8Array, mime?: string): boolean {
  if (mime === "application/pdf") return true;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** 一份识别输入（拖进来、选进来的图片或 PDF）。 */
export interface RecogInput {
  bytes: Uint8Array;
  mime?: string;
  name?: string;
}

/** 文件名 → 曲名（去掉目录与扩展名）。 */
function baseTitle(name: string): string {
  return name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
}

/** OmrController 向编辑器要的全部能力。 */
export interface OmrHost {
  /** 当前预览模式。识别模式期间为 "recognize"。 */
  readonly mode: "jp" | "mixed" | "recognize";
  /** 编辑器里的 CodeMirror 视图（点选定位要用）。 */
  readonly view: EditorView;

  getText(): string;
  setText(text: string): void;
  setStatus(text: string): void;
  /** 当前状态栏文本 */
  readonly status: string;
  saveSettings(): void;
  stopPlayback(): void;
  /** 点中识别框：停止中记为起播点，播放中跳过去。 */
  seekPlayback(point: PlayPoint): void;
  /** 正在试听（播放或暂停中）：点音符让给跳播 */
  playbackActive(): boolean;
  /** 当前文本解析出的模型（试听播的就是它；播放高亮按它的元素 id 找识别框）。 */
  currentScoreDoc(): ScoreDoc | null;
  /** 重新解析并排版（退出识别模式时回到排版稿）。 */
  reload(text: string): void;
  /**
   * 五线谱识别产物落地：与打开 `.musicxml` 同一个模式（无代码区），默认进**混排视图**。
   * 不走 `importOmrDoc`：五线谱的和弦、多声部、slur 在 `.jpwabc` 与简谱引擎里装不下。
   * 返回 false 表示简谱那一侧转不出来（不影响混排预览）。
   */
  adoptStaffXml(xml: string): boolean;
  /** 简谱识别产物落地：识别直出的模型与它写成的 123 核对文本。 */
  importOmrDoc(doc: ScoreDoc, text: string): void;
  /** 识别产物有无变了：同步排版档按钮（简谱识别期间不露「五线谱」「混排」两档）。 */
  syncViewModes(): void;

  /** 清空 #score-pane 与翻页状态（各预览铺页前都要做）。 */
  clearPages(): void;
  /** 铺页（见 App._renderPagesWith）。 */
  renderPagesWith(
    count: number,
    svgOf: (i: number) => SVGSVGElement,
    opts?: {
      aspectRatio?: (i: number) => string;
      position?: string;
      onPage?: (svg: SVGSVGElement, wrap: HTMLDivElement, i: number) => void;
      resetPageIndex?: boolean;
    },
  ): void;

  /** 进入/退出识别模式（改 mode、退混排布局、停播放）。 */
  setRecognizeMode(on: boolean): void;
  /** 123 以外的产物落地：丢掉混排底本、切 docFormat、设文件路径，再设文本。 */
  adoptText(format: DocFormatId, text: string, filePath: string | null): void;
  /** 代码区标题栏的格式下拉（识别结果是它的一种来源） */
  readonly formats: FormatSwitch;
  /** 上下文相关控件的显隐（工具条）。 */
  setContextControl(el: Element | null, on: boolean): void;
  syncContextGroup(el: Element | null | undefined): void;
  /** 核对视图里能不能可视化编辑（有代码区、有点选映射）。能就把点击交给它 */
  visualEnabled(): boolean;
  /** 核对视图上的单击 / 双击交给可视化编辑（选中、落光标、改字） */
  visualClick(ev: MouseEvent): void;
  visualDblClick(ev: MouseEvent): void;
  /** 核对视图重画完了：App 按新的命中框重绑索引条目、重画光标 */
  recognizeRendered(): void;
}

export class OmrController implements FormatSource {
  /** 识别模式：二值图 + 带源图坐标的识别结果，供叠加核对。 */
  private bin: Binary | null = null;
  private score: RecognizedScore | null = null;
  private btnEl: HTMLButtonElement | null = null;
  /** 叠加视图样式（原位叠加 / 附近浮窗 / 仅原图）。 */
  view: RecogView = "floating";
  private viewSelectEl: HTMLSelectElement | null = null;
  private popupEl: HTMLDivElement | null = null;
  /** 「音符/歌词/标题/著作者 → 编辑器代码区间」映射，点选定位用。 */
  private meta: JpwMeta | null = null;
  /** 识别结果的输出格式。产物本身与格式无关，切换只是重出文本，不重跑识别。 */
  format: OmrFormat = DEFAULT_OMR_FORMAT;
  /** 上次由识别产出的文本；与当前文本不同即说明用户手改过。 */
  private emitted: string | null = null;
  /** 小节时值自检报出的小节（识别完算一次，核对视图标红） */
  private beatMarks: RecognizedBeatIssue[] = [];
  /** 元素 id ↔ 识别框序（按 doc 与 meta 身份缓存，见 idMapOf）。 */
  private idMap: { doc: ScoreDoc; meta: JpwMeta; toI: Map<ElementId, number>; toId: ElementId[] } | null = null;
  /** 试听的竖直播放线（`rect.omr-playhead`，见 highlightPlaying）。 */
  private playingEl: SVGRectElement | null = null;
  /** 最近一次画的重投影（核对时改过的值，见 `omr/reproject.ts`）；浮窗用同一份 */
  private shown: Reprojected | null = null;
  /** 第几次重画（浮窗按它判断要不要重建） */
  private renderSeq = 0;

  constructor(private host: OmrHost) {}

  /** 是否有可核对的识别产物。 */
  get hasResult(): boolean {
    return this.score !== null && this.bin !== null;
  }

  // ---------------- 持久化 ----------------
  loadSettings(s: { omrFormat?: unknown; recogView?: unknown; omrFollow?: unknown; omrKind?: unknown }): void {
    if (isOmrFormat(s.omrFormat)) this.format = s.omrFormat;
    if (typeof s.omrFollow === "boolean") this.follow = s.omrFollow;
    if (s.omrKind === "auto" || s.omrKind === "jianpu" || s.omrKind === "staff") this.kind = s.omrKind;
    this.syncFollowBtn();
    this.syncKindSelects();
  }

  // ---------------- 识别类型（分流） ----------------
  /** 识别为：自动判断（按有没有五线谱表，`rasteromr/detect.ts`）/ 简谱 / 五线谱。持久化 */
  kind: "auto" | "jianpu" | "staff" = "auto";
  private kindSelects: HTMLSelectElement[] = [];
  /** 上一次识别的输入（改判时拿它重识别，不必再选一次文件） */
  private lastInputs: RecogInput[] = [];
  /** 正在识别（Esc 取消只在这期间有效） */
  private busy = false;
  private cancelRequested = false;

  /** 起始页与工具条各有一个「识别为」下拉，两个同步。工具条那个改了就用上次的图重新识别。 */
  setKindSelects(start: HTMLSelectElement | null, toolbar: HTMLSelectElement | null): void {
    for (const sel of [start, toolbar]) {
      if (!sel) continue;
      this.kindSelects.push(sel);
      sel.addEventListener("change", () => {
        this.kind = sel.value as typeof this.kind;
        this.host.saveSettings();
        this.syncKindSelects();
        if (sel === toolbar && this.lastInputs.length) void this.rerecognize();
      });
    }
    this.syncKindSelects();
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.busy) this.cancelRequested = true;
    });
  }

  private syncKindSelects(): void {
    for (const sel of this.kindSelects) sel.value = this.kind;
  }

  /** 用上次的输入按新的识别类型重识别（手改过先问）。 */
  private async rerecognize(): Promise<void> {
    if (this.emitted !== null && this.host.getText() !== this.emitted && !(await confirmDiscardEdits())) return;
    await this.recognizeFiles(this.lastInputs);
  }

  private progress(text: string): void {
    this.host.setStatus(text);
    const el = document.getElementById("recognition-progress-detail");
    if (el) el.textContent = text;
  }

  /**
   * 识别一份或几份输入（拖进来、选进来的图片 / PDF；几份时按文件名排好、合成一首）。分流：
   * 文字层完整的五线谱 PDF → 矢量路；有五线谱表的位图（`kind` 为自动时按 `detect.ts` 判）→ 位图五线谱路；其余 → 简谱路。
   * 简谱一次识别一张（几张时只认第一张，状态栏说明）。
   */
  async recognizeFiles(files: readonly RecogInput[]): Promise<boolean> {
    if (!files.length) return false;
    this.lastInputs = [...files];
    const first = files[0]!;
    // 文字层完整的五线谱 PDF（矢量）先试：只要不是指定按简谱识别
    if (files.length === 1 && this.kind !== "jianpu" && isPdfBytes(first.bytes, first.mime) && (await this.tryStaffPdf(first.bytes, performance.now()))) return true;
    if (this.kind !== "jianpu") {
      const t0 = performance.now();
      try {
        const rb = await import("../rasteromr/browser");
        const pdfs: Uint8Array[] = [];
        for (const f of files) pdfs.push(await rb.asRasterPdf(f.bytes, f.mime));
        const isStaff = this.kind === "staff" || (await rb.looksLikeStaffBytes(pdfs[0]!));
        if (isStaff) return await this.recognizeRasterStaff(pdfs, files, t0);
      } catch (e) {
        if (this.kind === "staff") {
          console.error("位图五线谱识别失败", e);
          this.host.setStatus("五线谱识别失败：" + (e instanceof Error ? e.message : String(e)));
          return false;
        }
        console.warn("五线谱判定失败，按简谱识别", e);
      }
    }
    const ok = await this.recognizeBytes({ bytes: first.bytes, mime: first.mime }, true);
    if (ok && files.length > 1) this.host.setStatus(`${this.host.status}；简谱一次识别一张，只认了第一张（${files.length} 张）`);
    return ok;
  }

  /** 位图五线谱：在线 OCR 跑整曲识别，产物是 MusicXML，落地同打开 `.musicxml`（无代码区、谱面上改模型）。 */
  private async recognizeRasterStaff(pdfs: Uint8Array[], files: readonly RecogInput[], t0: number): Promise<boolean> {
    const rb = await import("../rasteromr/browser");
    this.busy = true;
    this.cancelRequested = false;
    this.progress("五线谱识别中…（按 Esc 取消）");
    let res;
    try {
      res = await rb.recognizeRasterPdfs(pdfs, {
        title: files.length === 1 && files[0]!.name ? baseTitle(files[0]!.name) : undefined,
        onPage: (done, total) => this.progress(`五线谱识别中… ${done}/${total} 页（按 Esc 取消）`),
        cancelled: () => this.cancelRequested,
      });
    } catch (e) {
      this.host.setStatus(this.cancelRequested ? "已取消识别" : "五线谱识别失败：" + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      this.busy = false;
    }
    if (!res.xml) {
      this.host.setStatus("没找到五线谱表（可在工具栏把「识别为」改成简谱再试）");
      return false;
    }
    this.clear();
    this.lastInputs = [...files];
    this.staffResult = res;
    this.host.adoptStaffXml(res.xml);
    this.host.setContextControl(this.kindField(), true);
    const s = res.stats;
    this.host.setStatus(
      `五线谱识别完成（${((performance.now() - t0) / 1000).toFixed(1)}s）：${s.pages} 页 / ${s.parts ?? 1} 个声部 / ${s.notes} 个音符` +
        (s.bars ? `，满拍小节 ${Math.round((s.full / s.bars) * 100)}%` : "") + "。谱面上可直接校对修改",
    );
    return true;
  }

  /** 位图五线谱的识别结果（各页位图与音符坐标），对照视图用；简谱识别或清掉后为 null */
  staffResult: import("../rasteromr/song").RasterSongResult | null = null;

  private kindField(): Element | null {
    return this.kindSelects[1]?.closest(".toolbar-select-field") ?? null;
  }

  // ---------------- 原图片段跟随 ----------------
  /** 排版稿（简谱 / 五线谱 / 混排档）里选中音符时，右下角小窗显示原图上那一行并框出这个音。持久化 */
  follow = false;
  private followBtn: HTMLButtonElement | null = null;
  private followEl: HTMLElement | null = null;

  setFollowBtn(btn: HTMLButtonElement, box: HTMLElement | null): void {
    this.followBtn = btn;
    this.followEl = box;
    this.host.setContextControl(btn, false);
    btn.addEventListener("click", () => {
      this.follow = !this.follow;
      this.host.saveSettings();
      this.syncFollowBtn();
      if (!this.follow) this.followSelection(null);
    });
    this.syncFollowBtn();
  }

  private syncFollowBtn(): void {
    this.followBtn?.classList.toggle("active", this.follow);
    this.followBtn?.setAttribute("aria-pressed", String(this.follow));
  }

  /** 排版稿里选中了元素 `id`（源模型的 id）：小窗换到它那一行；null / 关着 / 没有识别结果 / 对不上框 → 收起。 */
  followSelection(id: ElementId | null): void {
    const box = this.followEl;
    if (!box) return;
    const i = id !== null && this.follow && this.bin && this.score && this.host.mode !== "recognize"
      ? this.idMapOf(this.host.currentScoreDoc())?.toI.get(id)
      : undefined;
    if (i === undefined || !this.bin || !this.score) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const ri = this.rowIndexOfFlat(i);
    const svg = renderRowSource(this.bin, this.score, ri);
    // 框出这个音（坐标就是源图像素，与浮窗同一坐标系）
    const flat = this.score.rows.flatMap((r) => r.nums);
    const b = flat[i]?.bbox;
    if (b) {
      const pad = Math.max(3, b.h * 0.25);
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("class", "omr-follow-hit");
      r.setAttribute("x", String(b.x - pad));
      r.setAttribute("y", String(b.y - pad));
      r.setAttribute("width", String(b.w + pad * 2));
      r.setAttribute("height", String(b.h + pad * 2));
      r.setAttribute("rx", String(pad));
      svg.appendChild(r);
    }
    // 以这个音为中心横向裁一段（约 8 个行高宽），整行太宽缩下来字就看不清了
    const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (b && vb && vb.length === 4) {
      const w = Math.min(this.bin.w, vb[3]! * 8);
      const x = Math.max(0, Math.min(this.bin.w - w, b.x + b.w / 2 - w / 2));
      svg.setAttribute("viewBox", `${x} ${vb[1]} ${w} ${vb[3]}`);
    }
    box.replaceChildren(svg);
    box.hidden = false;
  }

  /** 编辑器改动时同步代码区间映射（CodeMirror 的 changes 映射）。 */
  remapMeta(map: (m: JpwMeta) => JpwMeta): void {
    if (this.meta) this.meta = map(this.meta);
  }

  // ---------------- 工具条绑定 ----------------
  /** Register the #btn-recognize element so App can enable/disable it. */
  setRecognizeBtn(el: HTMLButtonElement): void {
    this.btnEl = el;
    this.host.setContextControl(el, false);
  }

  /** Register the #sel-recog-view dropdown (识别视图切换)。 */
  setRecogViewSelect(el: HTMLSelectElement): void {
    this.viewSelectEl = el;
    el.value = this.view;
  }

  // ---------------- 输出格式（代码区标题栏的格式下拉） ----------------
  options(): readonly FormatOption[] {
    return OMR_EMITTERS.map(({ id, label }) => ({ value: id, label }));
  }

  current(): string {
    return this.format;
  }

  switchTo(value: string): Promise<boolean> {
    return isOmrFormat(value) ? this.setFormat(value) : Promise.resolve(false);
  }

  /** 切换识别视图（原位叠加/附近浮窗/仅原图）。识别模式下即时重渲。 */
  setRecogView(v: RecogView): void {
    this.view = v;
    if (this.viewSelectEl) this.viewSelectEl.value = v;
    if (this.host.mode === "recognize") this.renderPages();
  }

  /** 切换识别输出格式：有识别结果就地重出文本（不重跑识别），并持久化选择。
   *  @returns 是否切了（用户取消手改确认时为 false） */
  async setFormat(format: OmrFormat): Promise<boolean> {
    if (this.format === format) return true;
    const rec = this.score;
    const bin = this.bin;
    if (rec && bin && this.emitted !== null && this.host.getText() !== this.emitted) {
      if (!(await confirmDiscardEdits())) return false;
    }
    this.format = format;
    this.host.saveSettings();
    if (rec && bin) {
      // 保持当前预览模式（对照 / 简谱），只换文本——切格式不该把用户踢出正在看的视图。
      const wasRecognize = this.host.mode === "recognize";
      this.emit(rec, bin);
      if (wasRecognize && this.host.mode !== "recognize") await this.toggle();
      this.host.setStatus(`已切换输出格式：${omrEmitter(format).label}（未重新识别）`);
    }
    return true;
  }

  // ---------------- 识别 ----------------
  /** 已取得图片字节后的识别核心（供拖拽识别复用）。
   *  保留二值图+识别结果，完成后默认进入叠加核对视图（先核对；「原图对照」可切回排版稿）。 */
  async recognizeBytes(picked: { bytes: Uint8Array; mime?: string }, jianpuOnly = false): Promise<boolean> {
    // 外部直接调（回归脚本、旧入口）走完整分流；`recognizeFiles` 判完了才以 jianpuOnly 进来
    if (!jianpuOnly) return this.recognizeFiles([picked]);
    this.host.setStatus("识别中…可能需要几十秒");
    try {
      const t0 = performance.now();
      const { bin, score } = await recognizeMusicppDetailed(picked.bytes, picked.mime);
      this.emit(score, bin);
      this.host.setContextControl(this.kindField(), true);
      if (this.host.mode !== "recognize") await this.toggle(); // 识别后默认进叠加核对（本仓库「先核对」取向）
      const n = this.beatMarks.length;
      this.host.setStatus(`识别完成（${((performance.now() - t0) / 1000).toFixed(1)}s）`
        + (n ? `；${n} 个小节拍数与拍号对不上（核对视图已标红，多半是增时线/减时线读错）` : ""));
      return true;
    } catch (e) {
      console.error("OMR failed", e);
      this.host.setStatus("识别失败：" + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }

  /**
   * 五线谱 PDF 那条路：识别 → MusicXML → 走导入路径落地。
   *
   * 与简谱那条路的分工写在 `staffomr/browser.ts` 开头。识别不出谱表就返回 false，
   * 让调用方继续走简谱那条（该 PDF 多半是扫描件或简谱）。
   */
  private async tryStaffPdf(bytes: Uint8Array, t0: number): Promise<boolean> {
    const { openStaffPdf, isStaffPdf, recognizeStaffPdf } = await import("../staffomr/browser");
    let ok = false;
    try {
      const { pdf, OPS } = await openStaffPdf(bytes);
      ok = await isStaffPdf(pdf, OPS);
      pdf.destroy?.();
    } catch {
      return false;
    }
    if (!ok) return false;
    const res = await recognizeStaffPdf(bytes, {
      onProgress: (done, total) => this.host.setStatus(`五线谱识别中… ${done}/${total} 页`),
    });
    if (!res.notes) {
      this.host.setStatus("这份 PDF 里没找到五线谱");
      return false;
    }
    // 五线谱只出 MusicXML，且只进混排视图（理由见 OmrHost.adoptStaffXml）。
    this.clear();
    this.host.setContextControl(this.kindField(), true);
    const jpOk = this.host.adoptStaffXml(res.musicxml);
    this.host.setStatus(
      `五线谱识别完成（${((performance.now() - t0) / 1000).toFixed(1)}s）：` +
        `${res.pages} 页 / ${res.parts} 个声部 / ${res.notes} 个音符` +
        (res.skipped ? `，${res.skipped} 页无谱表已跳过` : "") +
        (jpOk ? "" : "；简谱文本未变——五线谱装不进 .jpwabc，请从「导出 → MusicXML」取产物"),
    );
    return true;
  }

  /**
   * 把一份识别结果按当前输出格式出成编辑器文本。格式清单与各自的产出在 omr/emit.ts 的
   * 注册表里，这里只管把产物落到编辑器（123 按 123 文档落地，文本谱直接设文本）。
   * **不重跑识别。**
   *
   * 各 emitter 的 meta 都按同一套音符序（flatten(rows[].nums)）编号，
   * 所以「原图对照」的点选定位对所有格式通用（见 rangeOfHit）。
   */
  private emit(rec: RecognizedScore, bin: Binary): void {
    const out = omrEmitter(this.format).emit(rec);
    // importOmrDoc 开头会 clear()，故必须先落地、后回填本次产物。
    if (out.kind === "123") {
      this.host.importOmrDoc(out.doc, out.text);
    } else {
      this.clear();
      this.host.adoptText(out.kind, out.text, null);
    }
    this.beatMarks = recognizedBeatIssues(rec);
    this.meta = out.meta; // 点选映射按写出文本的源区间生成（`omr/meta.ts`）；.jpwabc / ABC 没有
    this.bin = bin;
    this.score = rec;
    this.emitted = this.host.getText();
    if (this.btnEl) this.btnEl.textContent = "原图对照";
    this.host.setContextControl(this.btnEl, true);
    this.host.setContextControl(this.followBtn, true);
    this.host.formats.use(this);
    this.host.syncViewModes();
  }

  // ---------------- 核对视图 ----------------
  /** 在「简谱模式」与「识别模式」（二值图+半透明识别叠加）之间切换。需先有 OMR 识别结果。 */
  async toggle(): Promise<void> {
    if (!this.hasResult) return;
    this.host.stopPlayback();
    if (this.host.mode === "recognize") {
      this.host.setRecognizeMode(false);
      this.setLayout(false);
      if (this.btnEl) this.btnEl.textContent = "原图对照";
      this.host.reload(this.host.getText());
    } else {
      this.followSelection(null); // 核对视图本身就是原图，小窗收起
      this.host.setRecognizeMode(true);
      this.setLayout(true);
      if (this.btnEl) this.btnEl.textContent = "返回排版稿";
      this.renderPages();
    }
  }

  /** 识别模式布局钩子：打 body.recognize 类 + 显示/隐藏视图下拉。 */
  private setLayout(on: boolean): void {
    document.getElementById("body")?.classList.toggle("recognize", on);
    const field = this.viewSelectEl?.closest<HTMLElement>(".toolbar-select-field");
    if (field) field.hidden = !on;
    else if (this.viewSelectEl) this.viewSelectEl.hidden = !on;
    this.host.syncContextGroup(this.btnEl ?? field ?? this.viewSelectEl);
    if (!on) this.hidePopup();
  }

  /** 退出识别模式时的布局收尾（App 从别的入口切走预览模式时调用）。 */
  leaveLayout(): void {
    this.setLayout(false);
  }

  /** 渲染识别视图：二值图 + 识别结果 → 一张 SVG，沿用 score-page-wrap + zoom 容器。 */
  renderPages(): void {
    // 核对时改一下就整张重画：保住滚动位置（清空谱面会把它归零）
    const pane = document.getElementById("score-pane");
    const scroll = pane ? { top: pane.scrollTop, left: pane.scrollLeft } : null;
    this.host.clearPages();
    this.popupEl = null;
    this.playingEl = null;
    if (!this.bin || !this.score) return;
    const bin = this.bin;
    // 代码区改过：把当前模型投回原识别框（改过的标蓝、删掉的划灰、新插的插值定位）
    const doc = this.host.currentScoreDoc();
    const map = this.idMapOf(doc);
    this.shown = doc && map ? reprojectRecognized(this.score, doc, map.toI) : null;
    this.renderSeq++;
    const score = this.shown?.score ?? this.score;
    // 可视化编辑开着时拍数红框由它按当前模型画（随改随变）；识别完那一份只在不能编辑时画
    const marks = this.host.visualEnabled() ? [] : this.beatMarks;
    this.host.renderPagesWith(1, () => renderRecognitionSvg(bin, score, this.view, marks, this.shown ?? undefined), {
      aspectRatio: () => `${bin.w} / ${bin.h}`,
      position: "relative", // 浮窗绝对定位相对此容器
      onPage: (svg, wrap) => this.wireInteraction(svg, wrap),
      resetPageIndex: false,
    });
    if (pane && scroll) {
      pane.scrollTop = scroll.top;
      pane.scrollLeft = scroll.left;
    }
    this.host.recognizeRendered();
  }

  /** 这份结果有没有点选映射（123 / 文本谱产物有，`.jpwabc` / ABC 没有）。 */
  get hasMeta(): boolean {
    return this.meta !== null;
  }

  /** 索引条目 → 核对视图上的命中框：音符按框序（新插的按元素 id）、歌词按框序与段、页眉另认（`headerHits`）。 */
  hitFor(kind: "note" | "lyric", id: ElementId, verse = 0): SVGGraphicsElement | null {
    const pane = document.getElementById("score-pane");
    const i = this.idMapOf(this.host.currentScoreDoc())?.toI.get(id);
    if (kind === "lyric") {
      return i === undefined ? null : pane?.querySelector<SVGRectElement>(`.omr-hits rect[data-kind="lyric"][data-i="${i}"][data-verse="${verse}"]`) ?? null;
    }
    if (i !== undefined) return pane?.querySelector<SVGRectElement>(`.omr-hits rect[data-kind="note"][data-i="${i}"]`) ?? null;
    return pane?.querySelector<SVGRectElement>(`.omr-hits rect[data-kind="note"][data-id="${id}"]`) ?? null;
  }

  /** 页眉命中框（标题、著作者），按字对上索引里的页眉条目（同 `App._bindHeader`）。 */
  headerHits(): { el: SVGGraphicsElement; text: string; role: "text" }[] {
    const pane = document.getElementById("score-pane");
    const out: { el: SVGGraphicsElement; text: string; role: "text" }[] = [];
    for (const r of pane?.querySelectorAll<SVGRectElement>('.omr-hits rect[data-kind="title"], .omr-hits rect[data-kind="author"]') ?? []) {
      const text = r.getAttribute("data-kind") === "title" ? (this.score?.title ?? "") : (r.getAttribute("data-text") ?? "");
      out.push({ el: r, text, role: "text" });
    }
    return out;
  }

  /** 元素所在谱行的竖向范围（源图像素 = 核对 SVG 的用户坐标）：插入光标照这一行的高度画。 */
  rowBand(id: ElementId): { svg: SVGSVGElement; y: number; h: number } | null {
    const score = this.score;
    const el = this.hitFor("note", id);
    const svg = el?.ownerSVGElement;
    if (!score || !el || !svg) return null;
    const i = this.idMapOf(this.host.currentScoreDoc())?.toI.get(id);
    const row = i !== undefined ? score.rows[this.rowIndexOfFlat(i)] : this.shown?.inserted.find((x) => x.id === id) && score.rows[this.shown.inserted.find((x) => x.id === id)!.row];
    if (!row) return null;
    const pad = (row.bottomY - row.topY) * 0.15;
    return { svg, y: row.topY - pad, h: row.bottomY - row.topY + pad * 2 };
  }

  /** 识别 SVG 交互：点选命中对象→选中对应代码；悬停高亮；floating 视图弹行/页眉浮窗。 */
  private wireInteraction(svg: SVGSVGElement, wrap: HTMLDivElement): void {
    const hitOf = (t: EventTarget | null): SVGRectElement | null =>
      (t instanceof Element ? t.closest(".omr-hits rect") : null) as SVGRectElement | null;

    let hovered: SVGRectElement | null = null;
    const setHover = (r: SVGRectElement | null): void => {
      if (hovered === r) return;
      hovered?.classList.remove("omr-hover");
      hovered = r;
      hovered?.classList.add("omr-hover");
    };

    svg.addEventListener("click", (e) => {
      // 能编辑：点选交给可视化编辑（选中、落光标、拍数红框透过）；播放中点音符仍让给跳播
      if (this.host.visualEnabled()) {
        const r0 = hitOf(e.target);
        const i0 = r0?.getAttribute("data-kind") === "note" ? r0.getAttribute("data-i") : null;
        if (i0 !== null && i0 !== undefined && this.host.playbackActive()) {
          const id = this.idOfNote(Number(i0));
          if (id !== undefined) this.host.seekPlayback({ id, pass: 1 });
          return;
        }
        this.host.visualClick(e);
        return;
      }
      const r = hitOf(e.target);
      if (!r) return;
      const range = this.rangeOfHit(r);
      if (range) this.selectCode(range);
      svg.querySelectorAll(".omr-hits rect.selected").forEach((x) => x.classList.remove("selected"));
      r.classList.add("selected");
      if (r.getAttribute("data-kind") === "note") {
        const id = this.idOfNote(Number(r.getAttribute("data-i")));
        if (id !== undefined) this.host.seekPlayback({ id, pass: 1 });
      }
    });

    svg.addEventListener("dblclick", (e) => {
      if (this.host.visualEnabled()) this.host.visualDblClick(e);
    });
    svg.addEventListener("mousemove", (e) => {
      const r = hitOf(e.target);
      setHover(r);
      if (this.view === "floating") this.updateFloatingPopup(r, wrap);
    });
    svg.addEventListener("mouseleave", () => {
      setHover(null);
      if (this.view === "floating") this.hidePopup();
    });
  }

  // ---------------- 试听高亮 ----------------
  /**
   * 元素 id ↔ 识别框序（`data-i`）。两层：
   * - **id ↔ meta 序**靠源区间：`meta.noteRanges[k].from`（随编辑经 CodeMirror 变更迁移）对元素的 `source.offset`，
   *   所以在识别模式下改了文本也对得上；对不上的按 `omr/meta.ts::elementMeta` 同样的遍历序号兜底（未编辑时两者一致）。
   * - **meta 序 → 框序**见 `flatOrder`：多声部时两者不同。
   * 没有 meta（`.jpwabc` / ABC 产物）返回 null：只播不高亮。
   */
  private idMapOf(doc: ScoreDoc | null): { toI: Map<ElementId, number>; toId: ElementId[] } | null {
    const meta = this.meta;
    if (!doc || !meta || !this.score) return null;
    if (this.idMap?.doc === doc && this.idMap.meta === meta) return this.idMap;
    const toFlat = flatOrder(this.score);
    const byFrom = new Map<number, number>();
    meta.noteRanges.forEach((r, k) => { if (r.to > r.from && !byFrom.has(r.from)) byFrom.set(r.from, k); });
    const toI = new Map<ElementId, number>();
    const toId: ElementId[] = [];
    let seq = 0;
    for (const part of doc.songs[0]?.parts ?? []) {
      for (const m of part.measures) {
        for (const el of m.elements) {
          if (el.kind === "chord" && el.grace) continue;
          if (el.kind === "space" && el.spacer === "y") continue;
          const k = el.source && el.source.length > 0 ? byFrom.get(el.source.offset) : undefined;
          const i = toFlat[k ?? seq];
          seq++;
          if (i === undefined || toId[i] !== undefined) continue;
          toI.set(el.id, i);
          toId[i] = el.id;
        }
      }
    }
    this.idMap = { doc, meta, toI, toId };
    return this.idMap;
  }

  private idOfNote(i: number): ElementId | undefined {
    return this.idMapOf(this.host.currentScoreDoc())?.toId[i];
  }

  /** 框序 → meta 序（点选定位查 `noteRanges` / `lyricRanges` 用）。 */
  private metaIndex(i: number): number {
    if (!this.score) return i;
    const k = flatOrder(this.score).indexOf(i);
    return k < 0 ? i : k;
  }

  /**
   * 播到某个元素：同五线谱（`painter.ts::movePlayhead`），放一条竖直播放线——横向取这个音的识别框，
   * 纵向贯穿它所在的系统（多声部是连谱号括起的几行，连同夹在中间的歌词带；单声部就是这一行）。null = 撤掉。
   * 这份谱里对不上框的音（没有 meta 的格式）不挪，留在上一处。
   */
  highlightPlaying(id: ElementId | null): void {
    if (id === null) {
      this.playingEl?.remove();
      this.playingEl = null;
      return;
    }
    const score = this.score;
    const i = score ? this.idMapOf(this.host.currentScoreDoc())?.toI.get(id) : undefined;
    const box = i === undefined ? null : document.querySelector<SVGRectElement>(`#score-pane .omr-hits rect[data-kind="note"][data-i="${i}"]`);
    const svg = box?.ownerSVGElement;
    if (!score || i === undefined || !box || !svg) return;
    const row = score.rows[this.rowIndexOfFlat(i)]!;
    const sys = row.system === undefined ? [row] : score.rows.filter((r) => r.system === row.system);
    const pad = (row.bottomY - row.topY) * 0.25;
    const bx = Number(box.getAttribute("x"));
    const bw = Number(box.getAttribute("width"));
    const y0 = Math.min(...sys.map((r) => r.topY)) - pad;
    const y1 = Math.max(...sys.map((r) => r.bottomY)) + pad;
    let line = this.playingEl;
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      line.setAttribute("class", "omr-playhead");
      this.playingEl = line;
    }
    line.setAttribute("rx", String(Math.round(pad / 2)));
    line.setAttribute("x", String(bx - pad));
    line.setAttribute("width", String(bw + pad * 2));
    line.setAttribute("y", String(y0));
    line.setAttribute("height", String(y1 - y0));
    if (line.ownerSVGElement !== svg) svg.appendChild(line);
    line.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /** 命中 rect → 编辑器代码区间（据 data-kind 查 meta）。 */
  private rangeOfHit(r: SVGRectElement): { from: number; to: number } | null {
    const meta = this.meta;
    if (!meta) return null;
    const kind = r.getAttribute("data-kind");
    if (kind === "note") {
      return meta.noteRanges[this.metaIndex(Number(r.getAttribute("data-i")))] ?? null;
    }
    if (kind === "lyric") {
      const v = Number(r.getAttribute("data-verse"));
      return meta.lyricRanges[this.metaIndex(Number(r.getAttribute("data-i")))]?.get(v) ?? null;
    }
    if (kind === "title") return meta.titleRange ?? null;
    if (kind === "author") {
      const text = (r.getAttribute("data-text") ?? "").trim();
      const a = meta.authorRanges.find((x) => x.text.trim() === text)
        ?? meta.authorRanges.find((x) => text.includes(x.text.trim()) || x.text.trim().includes(text));
      return a?.range ?? null;
    }
    return null;
  }

  /** 选中并滚动到编辑器里的代码区间。 */
  private selectCode(range: { from: number; to: number }): void {
    const view = this.host.view;
    const len = view.state.doc.length;
    const from = Math.max(0, Math.min(range.from, len));
    const to = Math.max(from, Math.min(range.to, len));
    view.dispatch({
      selection: EditorSelection.single(from, to),
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
  }

  /** floating 视图：悬停对象所在行→在该行相邻固定位置弹整行浮窗；页眉命中→弹整块页眉。 */
  private updateFloatingPopup(r: SVGRectElement | null, wrap: HTMLDivElement): void {
    if (!this.bin || !this.score) { this.hidePopup(); return; }
    // 停在音符/歌词间隙（无命中）时保持当前浮窗，不隐藏——否则同 system 内移动光标会反复隐现闪烁。
    // 真正离开谱面由 svg 的 mouseleave 负责隐藏。
    if (!r) return;
    const bin = this.bin, score = this.score;
    const kind = r.getAttribute("data-kind");
    let key: string;
    let r2: { svg: SVGSVGElement; srcTop: number; srcBottom: number };
    if (kind === "title" || kind === "author") {
      key = "header";
      r2 = renderHeaderPopup(bin, score);
    } else {
      const i = Number(r.getAttribute("data-i"));
      const id = r.getAttribute("data-id");
      const ri = id !== null ? (this.shown?.inserted.find((x) => String(x.id) === id)?.row ?? 0) : this.rowIndexOfFlat(i);
      key = "row" + ri;
      r2 = renderRowPopup(bin, this.shown?.score ?? score, ri, this.shown ?? undefined);
    }
    // 同一行/页眉不重复重建（改过谱就换一份 key，重画）
    key += `@${this.renderSeq}`;
    if (this.popupEl?.dataset.key !== key) {
      this.showPopup(r2.svg, key, wrap, bin, r2.srcTop, r2.srcBottom);
    }
  }

  private showPopup(content: SVGSVGElement, key: string, wrap: HTMLDivElement, bin: Binary, srcTop: number, srcBottom: number): void {
    let el = this.popupEl;
    if (!el) {
      el = document.createElement("div");
      el.className = "omr-popup";
      wrap.appendChild(el);
      this.popupEl = el;
    }
    el.dataset.key = key;
    el.replaceChildren(content);
    el.style.display = "block";
    // 定位到**当前 system 之下**（srcBottom 已含本行歌词带底，故浮窗不盖当前行歌词）；
    // 靠近底部则翻到当前行之上。浮窗整幅宽、列与源图对齐，便于逐音对比。
    const topPct = (srcBottom / bin.h) * 100;
    const botPct = (srcTop / bin.h) * 100;
    if (topPct < 82) {
      el.style.top = `${topPct}%`;
      el.style.bottom = "auto";
    } else {
      el.style.bottom = `${100 - botPct}%`;
      el.style.top = "auto";
    }
  }

  private hidePopup(): void {
    if (this.popupEl) { this.popupEl.style.display = "none"; delete this.popupEl.dataset.key; }
  }

  /** flatten 音符下标 → 所属行下标。 */
  private rowIndexOfFlat(i: number): number {
    if (!this.score) return 0;
    let acc = 0;
    for (let ri = 0; ri < this.score.rows.length; ri++) {
      const n = this.score.rows[ri].nums.length;
      if (i < acc + n) return ri;
      acc += n;
    }
    return this.score.rows.length - 1;
  }

  /** 清掉本次 OMR 的识别叠加产物并禁用识别按钮；若正处识别模式则退回简谱模式。 */
  clear(): void {
    this.bin = null;
    this.score = null;
    this.beatMarks = [];
    this.meta = null;
    this.idMap = null;
    this.playingEl = null;
    this.emitted = null;
    if (this.host.formats.source === this) this.host.formats.use(null);
    this.hidePopup();
    if (this.btnEl) this.btnEl.textContent = "原图对照";
    this.host.setContextControl(this.btnEl, false);
    this.host.setContextControl(this.followBtn, false);
    this.host.setContextControl(this.kindField(), false);
    this.staffResult = null;
    this.followSelection(null);
    if (this.host.mode === "recognize") {
      this.host.setRecognizeMode(false);
      this.setLayout(false);
    }
    this.host.syncViewModes();
  }
}

const flatOrderCache = new WeakMap<RecognizedScore, number[]>();

/**
 * meta 序 → 框序。框（`omr/overlay.ts` 的 `data-i`）按 `flatten(rows[].nums)` 编号，即谱面**逐行**；
 * 模型（`omr/todoc.ts`）按声部建 part——声部 0 的各行、再声部 1 的各行……，`meta.ts` 按 part 序编号。
 * 单声部两者相同；四声部一个系统四行交错，不换算就整片对错框。
 */
function flatOrder(score: RecognizedScore): number[] {
  let out = flatOrderCache.get(score);
  if (out) return out;
  const starts: number[] = [];
  let acc = 0;
  for (const r of score.rows) { starts.push(acc); acc += r.nums.length; }
  const order: number[] = [];
  const voices = [...new Set(score.rows.map((r) => r.voice ?? 0))].sort((a, b) => a - b);
  for (const v of voices) {
    score.rows.forEach((r, ri) => {
      if ((r.voice ?? 0) === v) for (let k = 0; k < r.nums.length; k++) order.push(starts[ri]! + k);
    });
  }
  flatOrderCache.set(score, order);
  return order;
}
