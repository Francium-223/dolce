// 帮助对话框的英文内容，与 help.ts 里的中文表一一对应（主题顺序相同；记谱法只译说明，示例谱码共用）。
// 改中文帮助时同步改这里。

/** 功能帮助主题（不含 extra：快捷键表由 help.ts 按顺序挂上）。 */
export const FEATURE_TOPICS_EN: { title: string; body: string[] }[] = [
  {
    title: "Open, save and save as",
    body: [
      "Use **Open score** on the start page, or drag a file onto the window: 123 (`.123`, the main jianpu format — see the 123 format tab), `.jpwabc` (JP-Word), text jianpu (Fanqie / Shigeben, `.pu` `.fq` `.jps` `.txt`), MusicXML (`.xml` / `.musicxml`) and ABC (`.abc`).",
      "**Save** (top right) writes back in the original format (`.jpwabc` stays JP-Word compatible). **Save As** converts to 123, JPWABC, ABC, Fanqie or Shigeben text jianpu — before converting it lists anything the target format can't hold and asks you to confirm. **Export** produces PPTX, MIDI and MusicXML, plus PNG and PDF in the Staff / Mixed views.",
      "The format drop-down in the source pane header switches a recognition result or a freshly opened file to another format for editing; switch back to “original” to restore it.",
      "**Desktop**: native open/save dialogs write straight to disk, and the last file reopens on startup. **Browser**: files are opened with the web file picker and saved as downloads.",
    ],
  },
  {
    title: "Editing with live layout",
    body: [
      "The left pane is a syntax-highlighted source editor that **re-lays out as you type** — the score on the right updates after a ~0.2 s pause.",
      "**Click to locate**: clicking a note or lyric on the score jumps to it in the source. You can also edit right on the score — see the Visual editing tab.",
      "MusicXML has no source pane; in the Mixed view and while proofing a recognition the source is read-only or hidden (see the related topics).",
    ],
  },
  {
    title: "Pages and zoom",
    body: [
      "**Pages**: the previous / next buttons, or `PageUp` / `PageDown`; `Ctrl/⌘+Home` goes to the first page and `Ctrl/⌘+End` to the last.",
      "**Zoom**: the `−` / `100%` / `＋` buttons, `Ctrl/⌘ +` / `-` / `0`, or scroll while holding `Ctrl/⌘`.",
      "The **macOS desktop app** also supports trackpad pinch-to-zoom.",
    ],
  },
  {
    title: "Recognize an image",
    body: [
      "Drag a jianpu **image or PDF** (PNG/JPG/WEBP/PDF) onto the window, or click **Recognize image** on the start page, and it is recognized into an editable 123 score, with four-part jianpu split into separate voices. Recognition runs **entirely on your device** — images are never uploaded — in both the browser and desktop versions.",
      "Afterwards you land in a proofing view that overlays the result on the binarized image, shown as a nearby popup, in place, or original only. Click a recognized item to jump to its code; **Compare** in the toolbar switches between proofing and the editable score. Measures whose beats don't match the time signature are circled.",
      "**Staff-notation PDFs** with a complete text layer (exported by notation software) can be recognized too; the result opens in the Staff / Mixed views.",
      "Please proofread the result — especially lyrics and tricky rhythms.",
    ],
  },
  {
    title: "Importing ABC / MusicXML",
    body: [
      "**ABC notation** (`.abc`) is parsed natively and laid out as jianpu; you can edit it and save the original text. Multiple voices, repeats, first/second endings, chords, ornaments and lyrics are supported.",
      "**MusicXML** (`.xml` / `.musicxml`): when you open a single-part song you can convert it to 123 / JPWABC / ABC / text jianpu for editing, or keep MusicXML and view it as staff notation (Settings can remember the choice). Multi-part scores (e.g. SATB) open in the **Mixed** view.",
    ],
  },
  {
    title: "Score views",
    body: [
      "Four views sit above the score: **Expanded** (repeats and verses unrolled, one verse per page — for projection), **As printed** (laid out once like the original, verses stacked), **Staff**, and **Mixed** (staff notation with a jianpu layer). For text formats the staff notation is generated from the source.",
      "**Line breaking**: “Original” keeps the line structure from import or recognition; “By phrase” re-breaks lines by lyric and musical phrases. Text jianpu is supported too — the source itself is re-broken; click “Original” to restore it exactly (or undo with Ctrl+Z).",
      "These tools only appear when the current file supports them.",
    ],
  },
  {
    title: "Playback",
    body: [
      "The **Playback** button shows Play / Pause / Resume; ■ stops and returns to the beginning. Jianpu, Staff, Mixed and the Compare view all show a vertical playhead across the line (the whole system for multiple parts) that follows every part's note onsets.",
      "Drag the **progress bar** to seek; the time shows elapsed / total (click to show remaining). While playing or paused, clicking a note continues from it; when stopped, clicking a note or dragging the bar sets where the next play starts.",
      "Playback follows the tempo marked in the score, and the speed drop-down scales it from ×0.5 to ×2; changing speed while playing continues from the current position.",
      "For multi-part scores, adjust each part's volume in **Settings**.",
      "The **macOS desktop app** can use the system's native instruments for better sound.",
    ],
  },
  {
    title: "Export",
    body: [
      "**Export** in the header. In jianpu views you can export **PPTX** (vector, one slide per page, from the Expanded view), **MIDI** (with repeats, dynamics and part volumes) and **MusicXML**.",
      "In Staff / Mixed views you can export the current page as **PNG**, all pages as **PDF**, plus **MIDI** and **MusicXML**. Exports match the current preview (with or without the jianpu layer). To change the source format, use **Save As**.",
    ],
  },
  {
    title: "Simplified / Traditional Chinese",
    body: [
      "**简/繁** in the toolbar converts all Chinese text — lyrics, titles and credits — while leaving the music code untouched; it works for all five formats.",
      "Choose Auto-detect, Simplified → Traditional or Traditional → Simplified. Lyric marks such as `/` and `-` stay in place and don't split words (`日光/之下` is still converted as one word). The source itself is changed, so `Ctrl/⌘+Z` undoes it in one step.",
    ],
  },
  {
    title: "Settings",
    body: [
      "**Settings** has three tabs and only shows options that take effect in the current view: **Layout** (paper, orientation, margins, aspect ratio, lines per page, font size, colors; staff size, lyric size and hidden measure numbers in Staff / Mixed), **Header & style** (songbook style sheet `.ss`; fonts and sizes for title, subtitle, scripture and credits), and **Other** (interface language, what to do when opening MusicXML, sound when editing notes, part volumes).",
      "“Reset this view” at the bottom only clears the settings of the current view.",
    ],
  },
  {
    title: "Interface language",
    body: [
      "The interface is available in **中文** and **English**. On first launch it follows your browser / system language; change it any time in **Settings → Other → Language** — it switches instantly, no reload needed.",
      "Only the interface is translated; scores, lyrics and notation code stay as they are. You can also add `?lang=en` or `?lang=zh` to the URL.",
    ],
  },
  {
    title: "Keyboard shortcuts",
    body: [],
  },
];

/** 主快捷键表的行（与 help.ts 的中文行一一对应）。 */
export const SHORTCUTS_EN: [string, string][] = [
  ["Zoom in / out", "Ctrl/⌘ +  ·  Ctrl/⌘ -"],
  ["Reset zoom to 100%", "Ctrl/⌘ 0"],
  ["Previous / next page", "PageUp  ·  PageDown"],
  ["First / last page", "Ctrl/⌘ Home  ·  Ctrl/⌘ End"],
  ["Ctrl/⌘ + scroll wheel", "Zoom around the pointer"],
];

/** 可视化编辑主题（不含 extra）。 */
export const VISUAL_TOPICS_EN: { title: string; body: string[] }[] = [
  {
    title: "Two modes, two cursors",
    body: [
      "Edit right on the score: **click the score** so it takes the keyboard; the current mode is shown at the top right. Every change is written back to the source on the left, which stays the single source of truth.",
      "**Edit mode** (block cursor): the block covers the selected element and keys act on it. Clicking a note (or a dot, chord name or ornament on it) enters Edit mode; clicking a note selects only the note itself (accidental, degree, octave dots), not its underlines or dot. **Dots, underlines, extension dashes, barlines and slurs can each be clicked on their own** — whatever you click is selected, and `Delete` or `Backspace` removes just that (deleting an underline returns the note to a quarter, deleting a barline merges two measures, deleting a slur removes both brackets, deleting a dash shortens the note by a beat).",
      "**Insert mode** (bar cursor): the bar sits between two elements and actions insert at it. Clicking the gap between two notes enters Insert mode.",
      "**Text is selected with a single click and edited with a double click**: a single click on lyrics, title, subtitle, credits or key/time signature selects the whole item (the score keeps the keyboard, so `Delete` removes it); a double click enters Insert mode with the bar at the clicked character in the source and hands the keyboard to the source pane, so typing edits that text. Lyrics select one syllable at a time. When the source cursor is on these fields, the matching text on the score lights up too.",
      "`Insert` or `i` switches from Edit to Insert mode (the bar goes after the selection); `Esc` switches back to Edit mode (the block covers the element before the cursor).",
      "Both cursors are **shown in the source and on the score at the same time**: with the score focused, the selected note token is boxed in the source and the insert position blinks; moving the cursor in the source moves the score cursor too.",
    ],
  },
  {
    title: "Selecting and moving",
    body: [
      "`←` / `→` step through notes, dashes, barlines and line breaks; `Shift+←` / `Shift+→` extend the selection; `Home` / `End` jump to the start and end of the line on the score.",
      "`Shift` + click selects from the current selection to the clicked note.",
    ],
  },
  {
    title: "Changing notes",
    body: [
      "With a note selected (Edit mode): `1`–`7` change the degree and `0` makes it a rest; `↑` / `↓` (or `'` / `,`) shift the octave; `#` `b` `n` add a sharp, flat or natural (press again to remove); `.` toggles a dot. With a range selected, octave and accidentals change together.",
      "`_` halves the duration (removing half the dashes if any, otherwise adding an underline), `=` doubles it (removing an underline if any, otherwise adding dashes), and `-` adds a dash after the note.",
      "`f` toggles a fermata and `>` an accent. 123, ABC, `.jpwabc` and text jianpu can all be edited on the score; each format writes things its own way (e.g. ABC uses note names with absolute accidentals; `.jpwabc` can't combine dashes with underlines or dots), and edits follow each format's rules.",
    ],
  },
  {
    title: "Inserting and deleting",
    body: [
      "In Insert mode, typing a digit inserts a note at the cursor using the “current duration” shown at the top right, which `_` / `=` adjust; `-` inserts a dash and `|` a barline.",
      "`Delete` / `Backspace`: in Edit mode they delete the selection — a note goes together with its dashes, chord name and ornaments; in Insert mode they delete the element after / before the cursor.",
    ],
  },
  {
    title: "Line and page breaks",
    body: [
      "`Enter` breaks the line after the selection (Insert mode: at the cursor) and `Shift+Enter` breaks the page; at the end of a measure the barline stays on the earlier line.",
      "In ABC a line break is the end of a code line: breaking splits the code line in two and deleting the break joins them, with `w:` lines following along. In text jianpu a line break starts a new `Q:` line: breaking cuts the `Q:` and `C:` lines together, and selecting the break at the line end and pressing `Delete` joins it with the next line. `.jpwabc` lyrics are anchored, so their `@measure,note` anchors are recomputed after adding or removing notes, barlines or breaks.",
      "**Lyrics split too**: in 123 a `$` ends a music line and the `w:` lines right after a code line belong to its last music line. So breaking splits the code line at the cursor and splits every `w:` line at the matching syllable, moving the first half under the earlier line; deleting the break does the reverse, joining verses back together (padding with `/` if the earlier part is short).",
      "Lines whose lyrics use `+:` continuation can't be split automatically yet; you'll be asked to edit the source.",
    ],
  },
  {
    title: "Marks attached to notes",
    body: [
      "**Add a slur**: select a range (`Shift+→` or `Shift`+click) and press `s` (or `(`); an identical slur is removed. **Add a tie**: select a note and press `t` to tie it to the next note of the same pitch; press again to remove. In 123 both are written as brackets — the difference is only whether the notes have the same pitch.",
      "Chord names, fermatas and other ornaments, section annotations and slurs/ties can be selected on their own: click them on the score (chord names, ornaments, annotations), or select a note and press `Tab` to cycle through its marks, returning to the note after a full round.",
      "With a mark selected, its source text is selected too (e.g. `\"G\"`, `!fermata!`, a slur's brackets); press `Delete` to remove it — deleting a slur/tie removes both brackets.",
    ],
  },
  {
    title: "Formatting marks (line and page breaks)",
    body: [
      "The **¶** button at the top right of the score pane (or `Ctrl/⌘+Shift+M`) toggles formatting marks: a line break `↵` at the end of each line and `⤓` at page breaks; the matching `$`, `$$`, `$(…)` and `[fenye]` in the source are dimmed.",
      "Click a line break to select it. In text jianpu (Fanqie / Shigeben) a line break simply starts a new `Q:` line, so there's no separate symbol in the source.",
    ],
  },
  {
    title: "Context menu and symbol palette",
    body: [
      "**Right-click** the score: it first selects by the click rules (note, mark, line break; empty space places the insert cursor), then shows the actions available for it, each with its shortcut.",
      "**Palette** at the top right of the score pane opens the symbol palette: degrees, octaves, accidentals, durations, slurs/ties, fermata, accent, barlines, line/page breaks and delete are all clickable; buttons unavailable in the current mode are greyed out. Buttons show the score symbol (`1̇` high dot, `1̲` underline, `⌢` slur…), and hovering shows the name and shortcut.",
      "The palette and menu run the same actions as the keyboard shortcut table.",
    ],
  },
  {
    title: "Sound when editing notes",
    body: [
      "After changing a degree, octave or accidental, or inserting a note, a short piano note sounds (pitch follows the key signature) so you can check by ear while entering. It stays silent during playback.",
      "Turn it off by unchecking “Sound when editing notes” in **Settings**.",
    ],
  },
  {
    title: "Beat check",
    body: [
      "Every measure's length is checked against the time signature; measures that don't add up get a light red background on the score (hover for a note like “1/2 beat short”) and a red squiggle under their first note in the source. The count is shown at the top right — click it to jump through them.",
      "Accepted cases: a pickup first measure; first and last measures that add up to one full measure; two adjacent partial measures split by a repeat sign that add up to one; mixed meters (`M:3/4 4/4`) match either signature; free-time music without a time signature isn't checked.",
      "The **Beats** button at the top right toggles the check. **Image recognition** uses the same check and circles mismatched measures in the proofing view (usually a misread dash or underline).",
    ],
  },
  {
    title: "Undo and redo",
    body: [
      "`Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` on the score share one undo history with the source pane — undoing on either side is the same.",
    ],
  },
  {
    title: "Shortcut reference",
    body: ["These shortcuts work when **the score has focus** (click the score first). `/` is not bound; it's reserved for lyric alignment."],
  },
];

export const GLOSSARY_EN: [string, string][] = [
  ["Degrees 1–7", "Jianpu writes the seven notes do re mi fa so la ti as the digits 1234567; `0` is a rest (silence)."],
  ["Octave dots", "Small dots above or below a note: each dot above raises it an octave, each dot below lowers it an octave."],
  ["Underlines", "Short lines **under** a note: one halves its duration (an eighth note), two halve it again (a sixteenth)."],
  ["Extension dashes", "Dashes `-` **to the right** of a note, each adding one beat."],
  ["Dot", "A small dot `.` to the right of a note adds half its value (a dotted quarter = quarter + eighth)."],
  ["Barline / time signature", "`|` separates measures; a time signature such as `4/4` means four beats per measure with a quarter note as the beat."],
  ["Key", "E.g. `1=C` means do is sung as C, setting the pitch reference for the whole piece."],
  ["Slur / tie", "Arcs between notes: across different pitches it's a slur (legato); across the same pitch it's a tie (joining two notes into one long note)."],
];

/** 记谱法各节的标题与说明，与 help.ts 的 NOTATION 顺序一一对应（示例谱码共用）。 */
export const NOTATION_TEXT_EN: { title: string; body: string[] }[] = [
  {
    title: "Notes and rests",
    body: [
      "Jianpu writes the seven degrees (do re mi fa so la ti) as **1–7**, and **0** is a **rest** (no sound on that beat).",
      "Spaces between notes are optional.",
    ],
  },
  {
    title: "Octaves (octave dots)",
    body: [
      "**Octave dots**: a `'` (apostrophe) puts a dot **above** the note, raising it an octave; a `,` (comma) puts a dot **below**, lowering it an octave. Two marks mean two octaves.",
      "In the source they go **after** the digit: `1'` is high do and `1,` is low do.",
    ],
  },
  {
    title: "Sharps and flats",
    body: [
      "Put `#` **before** a digit to raise it a semitone and `b` to lower it.",
      "For example `#4` is fa sharp and `b7` is ti flat.",
    ],
  },
  {
    title: "Duration: underlines and sixteenths",
    body: [
      "**Underlines** (`_` under the note) halve the duration: one `_` is an eighth note, two `__` a sixteenth.",
      "Adjacent short notes are beamed together automatically.",
    ],
  },
  {
    title: "Duration: dots and extension dashes",
    body: [
      "A **dot** `.` (to the right of the note) adds half its value: `5.` is a dotted quarter, often paired with an underline as `5. 5_` (dotted rhythm).",
      "Each **extension dash** `-` adds one beat: `5-` is a half note and `5---` a whole note.",
    ],
  },
  {
    title: "Barlines, time signature and key",
    body: [
      "`|` is a **barline** separating measures. The **time signature** and **key** go in `KeyAndMeters` in the `.Title` section, written `{part=key,meter}`, e.g. `{1=G,3/4}`.",
      "The time signature can also change mid-`.Voice` by simply writing a mark like `3/4`.",
    ],
  },
  {
    title: "Repeat signs",
    body: [
      "Repeat signs make a passage play twice: `|:` starts the repeat and `:|` ends it.",
      "`||` is a double barline (section end) and `|]` is the final barline.",
      "`.jpwabc` follows JP-Word's look: repeat signs and barline styles **aren't drawn** on the score, but playback and the Expanded view still repeat by them.",
    ],
  },
  {
    title: "Singing order (.Repeat section)",
    body: [
      "`|:` `:|` and first/second endings in `.Voice` are only **printed marks**; the actual order — and which verse is sung each time — comes from the `.Repeat` section. Importing MusicXML, recognizing an image or opening ABC fills it in automatically, so you rarely write it by hand; edit it when you need precise control.",
      "One entry per line, `startMeasure-endMeasureVverse` (measures count from 1). Entries are sung in order and a range may appear more than once. The example sings measures 1–4 twice — verse 1 then verse 2 — and then measures 5–8.",
      "Add `P` after the verse number to **turn the page after this pass** (for separating verses and chorus): `1-4V1P`.",
      "Endpoints can point at notes: a start of `11.2` enters at the **2nd note** of measure 11 (handy for long notes ending across lines); an end of `11.1` stops after the **1st note** of measure 11.",
      "Entries can also be comma-separated on one line: `1-4V1,1-4V2` is the same as two lines.",
    ],
  },
  {
    title: "Slurs and ties",
    body: [
      "Arcs between notes: across **different** pitches it's a **slur** (legato, one breath); across the **same** pitch it's a **tie** (joining two notes into one longer note).",
      "In the source, wrap the notes in parentheses `( ... )`.",
    ],
  },
  {
    title: "Fermata",
    body: [
      "Write `{YanYin}` **before** a note to add a **fermata** (the “◠” above it), meaning the note may be held freely.",
    ],
  },
  {
    title: "Lyrics",
    body: [
      "Lyrics go in the `.Words` section. The prefix `W1@1,1:` means verse 1, aligned from the 1st note of measure 1.",
      "Each character **maps to one note by default**; `/` means **no new character** on that note (a melisma). Write further verses as `W2`, `W3`…",
    ],
  },
  {
    title: "Title information",
    body: [
      "The `.Title` section holds the header: `Title` is the title (centered at the top), `WordsByAndMusicBy` the credits (`{lyricist,composer}`), and `KeyAndMeters` the key and time signature.",
      "`Expression` holds tempo and expression: `{♩=76}` means 76 beats per minute, or write an expression text. Playback and MIDI export follow `{♩=…}` (♩=90 if absent); the speed drop-down next to Playback scales it (×0.5–×2).",
      "JP-Word itself stores the note symbol as the letter `J` (displayed as ♩ by the music font); both spellings are read, so tempos from JP-Word files are kept.",
      "The example below renders the header layout of a title page.",
    ],
  },
];
