# HTML Mender

HTML Mender 让 **HTML PPT / AI 生成的网页演示稿** 可以在浏览器里直接修稿：改文字、换图片、新增文字和图片、调样式、微调位置和尺寸，然后下载一份干净的 HTML。

它适合 AI 生成 HTML PPT 后的最后一轮人工修改，尤其是“一页网页里包含多页 PPT”的动态页面。导出时会从原始 HTML 出发，只把文字、图片、背景图和版面样式改回去，尽量保留原来的脚本、动画、翻页逻辑和页面结构。

## 功能

- 编辑文字：字号、颜色、加粗、对齐、行高。
- 新增内容：直接插入新的文字块和图片。
- 替换图片：填充、适应、拉伸、缩放；默认拖动移动图片框，按住 Option/Alt 可调整图片内部位置。
- 边框操作：选中文字或图片后，直接拖动边框/标签移动，拖动边缘或角点改大小。
- 临时多选：`Shift` / `Cmd` / `Ctrl` 点选多个文字/图片/模块后，可一起移动、对齐或统一尺寸。
- 版面调整：仍支持安全缩放、真实宽高调整和恢复，用于更复杂的标题、卡片和块级元素。
- 干净导出：移除编辑器 UI 和注入脚本。

## 使用方式

### 用大模型安装技能

对 Codex 或类似 coding agent 说：

```text
请从 ClawHub 安装 html-mender 技能。
```

安装后继续说：

```text
帮我把这个 HTML PPT 变成可编辑页面：/path/to/deck.html
```

它会生成 `*.editable.html`。打开后在浏览器里修改，最后点击工具栏的“下载 HTML”保存结果。

### 安装浏览器扩展

在 Chrome Web Store、Microsoft Edge Add-ons 或其他 Chromium 扩展商店搜索：

```text
html-mender
```

如果商店暂时未刷新，搜索 `html-mender` 可以找到这个工具。

安装后打开 HTML PPT，点击扩展图标开始编辑。编辑本地 `file://` 页面时，可能需要在扩展详情页开启 `Allow access to file URLs`。

### 从源码使用

```bash
git clone https://github.com/wuhaoyupku/html-mender.git
cd html-mender
npx -y skills add ./skills/html-slide-mender
```

把编辑器注入到本地 HTML：

```bash
node skills/html-slide-mender/scripts/inject-html-editor.mjs /absolute/path/input.html \
  --out /absolute/path/input.editable.html \
  --lang zh-CN \
  --mode basic
```

本地加载扩展：

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本仓库的 `extension` 目录。
5. 打开 HTML PPT 页面，点击扩展图标。

## 版本说明

### 0.1.14

- 优化中文搜索和触发描述，覆盖 `HTML 编辑`、`PPT 编辑`、`HTML PPT 编辑`、`网页编辑`、`演示稿编辑`、`幻灯片编辑` 等常见搜索词。
- 保持技能范围明确限定在本地或已保存的 HTML 文件，继续排除在线网站、需要登录的页面、通用源码编辑和 PPTX 文件。

### 0.1.13

- 默认文字/图片编辑模式新增直接边框操作。
- 选中元素后可拖动边框或标签移动，拖动边缘改宽高，拖动角点等比缩放。
- 默认图片拖动改为移动图片框；按住 Option/Alt 可调整图片在框内的位置。
- `Shift` / `Cmd` / `Ctrl` 可在默认编辑模式下多选文字和图片，并使用对齐/统一尺寸工具。
- 优化重叠元素的选中顺序，让单独的文字或图片更容易点中。
- 移除顶部 `文字/图片` 与 `位置微调` 的大模式切换，常用版面操作直接融合到选框上。
- 缩短工具栏状态文案，让紧凑工具栏更容易放下。
- 修复编辑器 UI 聚焦时 `Ctrl/Cmd+Z` 不触发的问题。
- 修复刷新后首次拖动图片再撤销，无法回到原位的问题，并覆盖连续拖动不回扯。
- 选中文字框的可拖动边框或标签时，会显示可移动的手型光标。

### 0.1.10

- “位置微调”支持临时多选，不保存绑定关系。
- 多选模块可一起移动、缩放、改宽高、恢复、对齐和统一宽高。
- 多选版面操作会作为一次历史记录撤销 / 重做。

### 0.1.8

- “位置微调”新增 `移动缩放 / 改宽高 / 恢复`。
- `移动缩放` 使用 `transform: scale(...)` 做安全视觉缩放。
- `改宽高` 写入真实 `width` / `height`，支持只改宽、只改高和自由拉伸。
- `恢复` 会清除移动、缩放和编辑器写入的尺寸，并保留原始 transform 与原始内联宽高。

### 0.1.7

- 新增 `文字/图片` 和 `位置微调` 模式切换。
- 支持拖动或方向键微调当前可见文字、图片、卡片和块级元素。
- 干净导出保留位置微调结果，同时移除编辑器 UI 和运行时脚本。
- 优化嵌套版面选中顺序，小元素不会被大框盖住。
- 编辑框开关增加明确回显：`编辑框 开` / `编辑框 关`。

## 开发

```bash
cd extension
npm install
npm run check
```

浏览器烟测需要单独安装 Playwright：

```bash
cd extension
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

## 仓库结构

```text
docs/                         产品设计和项目文档
examples/                     示例 HTML PPT
extension/                    Chrome Manifest V3 扩展
skills/html-slide-mender/      Codex / LLM 技能包
prototypes/                   早期原型资产
```

## 路线图

- [x] 元素位置调整。
- [x] 元素尺寸调整。
- [ ] 更好的文字溢出提示。
- [ ] 内容级草稿/恢复机制。
- [ ] 多文件导出和资源打包。
- [ ] 更多 HTML PPT 模板适配测试。
- [ ] AI 辅助修稿、缩短、统一语气和翻译。

---

# HTML Mender

HTML Mender lets you visually edit **HTML slide decks and AI-generated presentation pages** in the browser: edit text, replace images, insert new text and images, adjust styles, fine-tune layout, resize elements, and export clean HTML.

It is designed for the final editing pass after an AI has generated an HTML deck, especially dynamic one-page decks that contain multiple slides. On export, it starts from the original source HTML and patches back only text, image, background, and layout-style changes, preserving scripts, animations, navigation, and page structure as much as possible.

## Features

- Text editing: font size, color, bold, alignment, and line height.
- Insert content: add new text blocks and images directly.
- Image replacement: cover, contain, fill, zoom; default dragging moves the image frame, while Option/Alt drag adjusts image content inside the frame.
- Border handles: select text or images, then drag the border/label to move and drag edges or corners to resize.
- Temporary multi-select: `Shift` / `Cmd` / `Ctrl` click several text/image/module boxes to move, align, or match sizes together.
- Advanced layout adjustment: safe scale, real width/height resizing, and reset tools remain available for complex titles, cards, and block elements.
- Clean export: removes editor UI and injected runtime scripts.

## Usage

### Install The LLM Skill

Tell Codex or a similar coding agent:

```text
Please install the html-mender skill from ClawHub.
```

Then ask:

```text
Please make this HTML deck editable: /path/to/deck.html
```

The assistant will generate `*.editable.html`. Open it in the browser, edit visually, then click `Download HTML` to save the result.

### Install The Browser Extension

Search your browser extension store for:

```text
html-mender
```

If the store has not refreshed yet, search for `html-mender`.

After installing, open an HTML deck and click the extension action. For local `file://` decks, enable `Allow access to file URLs` in the extension details page if needed.

### Use From Source

```bash
git clone https://github.com/wuhaoyupku/html-mender.git
cd html-mender
npx -y skills add ./skills/html-slide-mender
```

Inject the editor into a local HTML file:

```bash
node skills/html-slide-mender/scripts/inject-html-editor.mjs /absolute/path/input.html \
  --out /absolute/path/input.editable.html \
  --lang en \
  --mode basic
```

Load the extension locally:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repository's `extension` folder.
5. Open an HTML deck and click the extension action.

## Release Notes

### 0.1.14

- Improved Chinese search and trigger wording for terms such as `HTML 编辑`, `PPT 编辑`, `HTML PPT 编辑`, `网页编辑`, `演示稿编辑`, and `幻灯片编辑`.
- Kept the skill scope explicitly limited to local or saved HTML files and preserved the exclusions for live websites, authenticated online pages, generic source-code edits, and PPTX files.

### 0.1.13

- Added direct border handles in the default text/image editing mode.
- Drag a selected border or label to move an element, drag side handles to resize, and drag corner handles to resize proportionally.
- Default image dragging moves the image frame; hold Option/Alt to adjust the image content inside the frame.
- Shift / Cmd / Ctrl multi-select now works in the default text/image editing mode and opens alignment / same-size controls.
- Overlapping text/image boxes are ordered for easier selection of individual elements.
- Removed the top-level Text/Image vs. Move layout switch because border handles now cover the normal layout workflow.
- Shortened the toolbar status text to fit in compact toolbars.
- Fixed Ctrl/Cmd+Z when focus is on editor UI such as image handles or popover controls.
- Fixed first-drag undo for images whose frame originally had no inline style, and covered sequential image drags so they do not snap back.
- Added a movable cursor when hovering a selected text box's draggable border or label.

### 0.1.10

- Added temporary multi-select in layout mode without saving persistent groups.
- Multi-selected modules can move, scale, resize, reset, align, and match width/height together.
- Multi-select layout operations undo / redo as one history step.

### 0.1.8

- Added `Move/scale | Resize | Reset` in layout mode.
- `Move/scale` uses `transform: scale(...)` for safer visual scaling.
- `Resize` writes real `width` / `height` for width-only, height-only, and freeform stretch changes.
- `Reset` clears movement, scale, and editor-added size while preserving original transform and inline dimensions.

### 0.1.7

- Added `Text/Image` and `Move layout` mode switching.
- Added drag and arrow-key layout movement for visible text, images, cards, and blocks.
- Clean export preserves layout changes while removing editor UI and runtime scripts.
- Improved nested layout selection so smaller inner elements remain selectable.
- Added explicit edit-box state feedback: `Boxes on` / `Boxes off`.

## Development

```bash
cd extension
npm install
npm run check
```

Browser smoke tests require Playwright installed separately:

```bash
cd extension
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

## Repository Layout

```text
docs/                         Product notes and project docs
examples/                     Example HTML decks
extension/                    Chrome Manifest V3 extension
skills/html-slide-mender/      Codex / LLM skill
prototypes/                   Early prototype assets
```

## Roadmap

- [x] Element positioning.
- [x] Element resizing.
- [ ] Better text overflow warnings.
- [ ] Content-level draft/recovery.
- [ ] Multi-file export and resource packaging.
- [ ] More HTML deck compatibility tests.
- [ ] AI-assisted editing, shortening, tone matching, and translation.

## License

MIT
