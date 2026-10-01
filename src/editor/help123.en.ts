// 「123 格式」帮助页的英文说明，与 help123.ts 一一对应（示例顺序相同；示例源码共用，只译说明）。
// 改 help123.ts 的说明时同步改这里。

export const INTRO_123_EN =
  "**123** is this project's **main jianpu format**: it keeps ABC notation's header fields (`X:` `T:` `K:` `M:` `w:` …) and structure, " +
  "with jianpu digits in the music body. It's plain UTF-8 text, easy to write by hand, and can carry scores converted from MusicXML, ABC, " +
  "text jianpu or image recognition without loss. The file extension is `.123`. Common notation comes first below, each with a live-rendered example.";

export const GLOSSARY_123_EN: [string, string][] = [
  ["Field", "A line such as `K:1=G`; the part before the colon is the field name. Chinese names and full-width colons work too: `调：1=G`, `标题：奇异恩典`."],
  ["Music body", "Lines that aren't fields: notes, barlines, slurs and marks. Spaces are only for readability and don't affect the score."],
  ["Lyric slot", "When lyrics are aligned syllable by syllable, each note takes one slot; visible rests `0` and grace notes don't."],
  ["`$` and `$$`", "`$` is a line break on the score and `$$` a page break; a music line is followed by its lyric lines."],
  ["`%` comments", "From `%` at the start of a line to its end is a comment and doesn't appear on the score."],
];

export const EXAMPLES_123_TEXT_EN: { title: string; body: string[] }[] = [
  {
    title: "File header",
    body: [
      "A file starts with fields: `X:` number, `T:` title (a second `T:` is the subtitle), `C:` credits (may repeat), `K:` key, `M:` time signature, `Q:` tempo.",
      "Write the key as movable do, `K:1=G` (ABC's `K:G` also works); `Q:1/4=76` means 76 beats per minute, used by playback and MIDI export.",
      "The example below renders the header layout of a title page.",
    ],
  },
  {
    title: "Notes and rests",
    body: [
      "**1–7** are the scale degrees (do re mi fa so la ti) and **0** is a rest.",
      "`x` is an **invisible rest**: it takes time but isn't drawn — use it when an empty beat needs a lyric.",
    ],
  },
  {
    title: "Octaves",
    body: ["Write `'` after a digit to raise it an octave and `,` to lower it; they stack: `1''` is two octaves up."],
  },
  {
    title: "Sharps, flats and naturals",
    body: ["Write `#` **before** a digit to raise it a semitone, `b` to lower it and `n` for a natural: `#4` is fa sharp, `b7` ti flat."],
  },
  {
    title: "Duration: underlines",
    body: [
      "`_` after a digit halves it: one is an eighth note, two (`__`) a sixteenth.",
      "**Beams are grouped by beat automatically**; spaces are only for readability — `1_2_` and `1_ 2_` look the same.",
    ],
  },
  {
    title: "Duration: dots and dashes",
    body: [
      "`.` is a dot, adding half the value — often paired with an underline as `5. 6_`.",
      "`-` is an extension dash adding one beat each: `5 -` is a half note and `1 - - -` a whole note.",
    ],
  },
  {
    title: "Barlines and repeats",
    body: [
      "`|` barline, `||` double barline, `|]` final barline; `|:` and `:|` enclose the measures to repeat.",
      "To change the time signature mid-piece, write an inline field such as `[M:3/4]`.",
    ],
  },
  {
    title: "First and second endings",
    body: [
      "`[1` marks the first-time ending and `[2` the second (as in ABC). Multiple passes are written `[1,3` or `[1-3`. The As-printed view draws volta brackets; the Expanded view unrolls each pass instead.",
      "Note that `|1` is also a first ending in ABC, so leave a space when a digit follows a barline: `| 1`.",
    ],
  },
  {
    title: "Slurs and ties",
    body: [
      "Notes inside parentheses `( … )` are joined by an arc: a **slur** across different pitches, a **tie** across the same pitch. They can nest.",
      "`~` after a note means one arc **between it and the next note**, without brackets: `2~ 3` equals `(2 3)` and can reach out of a triplet.",
    ],
  },
  {
    title: "Triplets and tuplets",
    body: [
      "`(3: … )` is a triplet; write the notes with their printed durations, and **the `)` is required**: `(3: 1_ 2_ 3_ )` is an eighth-note triplet filling one beat.",
      "Write other tuplets as `(N:`; for a non-default ratio write `(n:p:`, read as “n notes in the time of p”.",
    ],
  },
  {
    title: "Lyrics",
    body: [
      "**One lyric line per music line**: lyrics go in a `w:` line and align from the first note of the music line right above; Chinese characters can be written together, one per note.",
      "`$` ends a music line (and breaks the line on the score); a second `w:` under the same music line is the second verse.",
      "`_` extends the previous syllable to this note (a melisma) and `/` leaves the note without a syllable; punctuation joins the previous syllable and takes no slot.",
    ],
  },
  {
    title: "More lyrics: verse numbers, continuation, several characters per note",
    body: [
      "`<1.>` at the start of a verse marks the printed verse number; it takes no note slot (printed at the line start for multiple verses).",
      "A long verse can be split: continue the previous line with `+:`.",
      "To fit several characters under one note, wrap them in `{}`: `{主耶}稣`. If a verse has no words on a line, write an empty `w:` to keep its place.",
    ],
  },
  {
    title: "Chords, annotations and marks",
    body: [
      "Write a chord name **before** its note, separated by a space: `F 1 3`. Quote non-standard names: `\"N.C.\"`.",
      "Annotations go in quotes with a position prefix: `\"^rit.\"` above, `\"_…\"` below.",
      "Note marks go in `!…!` before the note, in several spellings: `!fermata!`, `!延长!` and `!yc!` are all fermatas; `!>!` and `!accent!` are accents. Dynamics: `!p!` `!mf!` `!f!`.",
    ],
  },
  {
    title: "Grace notes",
    body: ["Grace notes go in braces before the main note and take no time: `{2_}` is a sixteenth grace note, `{2}` an eighth."],
  },
  {
    title: "Line and page breaks",
    body: [
      "`$` is a line break on the score and `$$` a page break; ordinary line breaks in the code don't affect the score. If the original line ends without a barline, put `$` right after that note.",
      "`I:linebreak <none>` ignores `$` and leaves line breaking to “By phrase”; `I:linesperpage 4` sets lines per page.",
    ],
  },
  {
    title: "Multiple voices",
    body: [
      "`V:1` `V:2` … separate voices; writing `V:n` again continues that voice, so you can interleave them line by line, each voice followed by its own lyrics.",
      "In four-part music, men's parts written an octave up get `V:3 clef=treble-8` where the voice first appears; playback and staff notation then sound and show the actual octave.",
    ],
  },
  {
    title: "Singing order",
    body: [
      "Printed `|: :|` and endings are just marks, and the default singing order follows them; for precise control use ABC's `P:` (e.g. `P:A2B`) or the extension `I:playorder`.",
      "Each `I:playorder` entry is a measure range plus a verse number; `page` turns the page after that pass. Endpoints can point at notes (`11.2` = the 2nd note of measure 11).",
    ],
  },
];
