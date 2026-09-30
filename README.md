# jpeditor

**中文** | [English](README.en.md)

> 开源的简谱编辑与排版器：写谱、识谱、排版、试听、导出，浏览器即开即用，也有 Windows / macOS 桌面版。

[![Release](https://img.shields.io/github/v/release/lodebar2026/jpeditor?display_name=tag)](https://github.com/lodebar2026/jpeditor/releases)
[![Live demo](https://img.shields.io/badge/%F0%9F%8C%90%20%E5%9C%A8%E7%BA%BF%E4%BD%BF%E7%94%A8-online-2b6cb0)](https://lodebar2026.github.io/jpeditor/)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20macOS%20%7C%20Windows-555)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 快速入口

| | 入口 | 说明 |
| :-: | --- | --- |
| 🌐 | **[在线使用](https://lodebar2026.github.io/jpeditor/)** | 免安装，浏览器直接打开 |
| 🍎 | **[macOS 版下载](https://github.com/lodebar2026/jpeditor/releases/latest)**（`.dmg`，Apple Silicon） | 首次打开提示“已损坏”见 [macOS 打不开](docs/macOS-打不开.md) |
| 🪟 | **[Windows 版下载](https://github.com/lodebar2026/jpeditor/releases/latest)**（`x64-setup.exe`） | 安装包，Windows 10/11 x64 |

![首页](docs/screenshot-start.png)

![界面](docs/screenshot.png)

## 特性

**编辑**
- 左侧源码、右侧实时简谱，边打字边重排；支持 **123**（本项目的简谱主格式，见下）、**JP-Word `.jpwabc`**、
  **文本谱**（番茄简谱 / 诗歌本「动态谱」）、**ABC** 四种文本格式，语法高亮与诊断提示。
- **可视化编辑**：直接在谱面上选中、插入、修改音符与记号（唱名、八度、升降号、时值、增时线、小节线、圆滑线 / 延音线、
  延长号、重音、换行换页），键盘、右键菜单、记号面板三种入口；简谱、五线谱、混排各档都能改；改动落回源码，与代码区共用撤销。
- 点选音符或歌词即双向定位到源码；拍数与拍号对不上的小节标红。
- **简繁转换**：整篇转歌词、标题、词曲信息，乐谱代码不动。

**识谱（OMR，本地离线）**
- 拖入简谱**照片、截图或扫描 PDF**，识别成 123 简谱再排版：音符、时值、歌词逐字对位、页眉标题 / 词曲 / 调号，
  四声部简谱按声部分开。完全在浏览器或桌面本地运行，图片不上传。
- 识别后可进入**原图对照**：识别结果按源图坐标叠加在二值图上逐音核对，点选即定位到源码，也能直接试听。
- 文字层完整的**五线谱 PDF** 可识别成 MusicXML，进五线谱 / 混排视图。
- 命令行识别（`omr-cli.mjs 图片 --lyrics 歌词.txt`）可附上同一首的**歌词文本**做词谱互证：形近字按歌词选字、
  补回漏读的字，版本用字不同、字多字少、疑似漏认的弧与反复顺序对不上的地方逐条报告，不擅改。

**排版**
- 四档视图：**展开**（反复与多段歌词逐遍展开、一屏一段，适合投影）、**原样**（按原谱排、多段词叠排，适合印刷）、
  **五线谱**、**混排**（五线谱上叠一层简谱）。
- **按乐句重排**：综合歌词标点与音乐信号（延长号、终止线、长音、休止、连线）重新断行；可一键还原原始排版。
- 纸张、方向、边距、页眉字体字号可设；诗集样式表 `.ss` 统一一本歌集的字体、配色与版式。

**试听**
- 按谱面速度演奏，光标跟随；可暂停、拖进度条、点音符从那里接着播，×0.5～×2 倍速；多声部可调各声部音量。

**保存、另存为与导出**
- 保存写回原格式；**另存为**可在 123 / JPWABC / ABC / 文本谱之间互转，转换前先列出目标格式装不下的内容。
- 导出：简谱档出 **矢量 PPTX**、**MIDI**、**MusicXML**；五线谱 / 混排档出 **PNG**、**PDF**、**MIDI**、**MusicXML**。

## 123 格式

123 是本项目的**简谱主格式**：**简谱的 ABC 方言**——字段头（`X:` `T:` `K:` `M:` `w:` …）、反复、房号、
多声部、演唱顺序等机制沿用 ABC 记谱，音乐体换成简谱数字。纯文本、UTF-8，适合手写，
也能无损承载从 MusicXML、ABC、文本谱与图片识别转来的谱。

```
X:1
T:奇异恩典
C:词 John Newton
K:1=F
M:3/4
Q:1/4=76
5, | 1 - 3_ 1_ | 3 - 2 | 1 - 6, | 5, - $
w:奇异恩_典，何等甘甜，
5, | 1 - 3_ 1_ | 3 - 2 | 5 - - | 5 - |]
w:我罪已_得赦免_
```

| 写法 | 含义 | 写法 | 含义 |
| --- | --- | --- | --- |
| `1`–`7` `0` | 唱名、休止 | `\|` `\|:` `:\|` `\|]` | 小节线、反复、终止线 |
| `1'` `1,` | 高 / 低八度 | `[1` `[2` | 一房、二房 |
| `#4` `b7` `n4` | 升、降、还原 | `( … )`、`2~ 3` | 圆滑线 / 延音线 |
| `1_` `1__` | 八分、十六分（符杠按拍自动连） | `(3: 1_ 2_ 3_ )` | 三连音 |
| `5.` | 附点 | `w:` | 歌词（一行曲一行词，汉字连写） |
| `5 -` | 增时线，每条加一拍 | `$` `$$` | 换行、换页 |
| `F 1` | 和弦（写在音符前） | `V:1` `V:2` | 多声部 |

- 完整规范：[docs/格式/123格式.md](docs/格式/123格式.md)
- 界面里 **帮助 → 123 格式** 有逐条说明，每条都附实时渲染的效果。

## 支持的格式

| 格式 | 扩展名 | 打开 | 编辑 | 保存 / 另存为 | 说明 |
| --- | --- | :-: | :-: | :-: | --- |
| 123 | `.123` | ✅ | ✅ | ✅ | 简谱主格式，UTF-8 |
| JP-Word | `.jpwabc` | ✅ | ✅ | ✅ | UTF-16LE + BOM，与 JP-Word 互通 |
| 文本谱 | `.pu` `.fq` `.jps` `.txt` | ✅ | ✅ | ✅ | 番茄简谱脚本、诗歌本文本谱（「动态谱」），自动识别方言 |
| ABC | `.abc` | ✅ | ✅ | ✅ | 原生解析，多声部、反复、房号、和弦、装饰音等 |
| MusicXML | `.xml` `.musicxml` | ✅ | 转成文本格式后编辑 | ✅ | 打开单声部谱时可选转成 123 等格式编辑，或保持 MusicXML 看五线谱 / 混排 |
| 图片 / PDF | `.png` `.jpg` `.webp` `.pdf` | 识谱 | — | — | 简谱图片与扫描 PDF；文字层完整的五线谱 PDF |

## 安装

- **浏览器在线版**（免安装）：<https://lodebar2026.github.io/jpeditor/>
- **macOS 版**（Apple Silicon，`jpeditor_<版本>_aarch64.dmg`）与 **Windows 版**（x64，`jpeditor_<版本>_x64-setup.exe`）：
  [最新 Release](https://github.com/lodebar2026/jpeditor/releases/latest)
- macOS 首次打开提示“已损坏”或“无法验证开发者”？应用未签名，属正常现象，一条命令即可解决，见
  [docs/macOS-打不开.md](docs/macOS-打不开.md)。

## 开发

Tauri 2 + TypeScript + SVG：排版、渲染、模型、编辑都在前端 TypeScript，Rust 只做原生加速。
技术栈、构建命令、分层与模块地图见 [docs/架构.md](docs/架构.md)；需求与各模块说明见 [docs/](docs/)。
还要做什么见 [docs/待办.md](docs/待办.md)。回归脚本与测试语料不在本仓库。

## 致谢

本项目站在这些工作之上，一并致谢：

- [open-fanqie](https://github.com/Linho1219/open-fanqie)（MIT）—— 番茄简谱脚本的第三方开源
  解析/渲染实现；番茄简谱脚本规范文档见 <https://fqdoc.linho.cc/>
- [ABC 记谱标准](https://abcnotation.com/wiki/abc:standard:v2.1) —— 123 格式的字段与结构所本
- [Bravura / SMuFL](https://github.com/steinbergmedia/bravura)（Steinberg，SIL OFL）——
  音乐字体与字形元数据
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)（Apache-2.0）—— 识谱里数字与歌词的
  识别模型；推理运行时用 [onnxruntime-web](https://github.com/microsoft/onnxruntime)
- [CodeMirror 6](https://codemirror.net/)、
  [Tauri 2](https://tauri.app/)、[Vite](https://vite.dev/)、[TypeScript](https://www.typescriptlang.org/)
  —— 编辑器 / 桌面外壳 / 构建
- [opencc-js](https://github.com/nk2028/opencc-js)（简繁转换）、
  [pdf.js](https://mozilla.github.io/pdf.js/)（PDF 栅格化）、
  [jsPDF](https://github.com/parallax/jsPDF)（PDF 导出）、
  [smplr](https://github.com/danigb/smplr)（试听音源）、
  [fflate](https://github.com/101arrowz/fflate)（PPTX 打包）、
  [opentype.js](https://opentype.js.org/)（字形轮廓）

## 许可

本项目代码以 MIT 授权（见 [LICENSE](LICENSE)）。随附 Bravura 字体按 SIL OFL 授权
（见 `public/redist`）；各第三方依赖的许可以其自身声明为准。
