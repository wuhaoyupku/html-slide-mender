# HTML Mender

HTML Mender（原 HTML Slide Mender）让 **HTML PPT / AI 生成的网页演示稿** 可以在浏览器里直接修稿：改文字、换图片、调样式、微调位置和尺寸，然后下载一份干净的 HTML。

它适合 AI 生成 HTML PPT 后的最后一轮人工修改，尤其是“一页网页里包含多页 PPT”的动态页面。导出时会从原始 HTML 出发，只把文字、图片、背景图和版面样式改回去，尽量保留原来的脚本、动画、翻页逻辑和页面结构。

## 功能

- 编辑文字：字号、颜色、加粗、对齐、行高。
- 替换图片：填充、适应、拉伸、缩放和拖动。
- 位置微调：移动标题、图片、卡片和块级元素。
- 移动缩放：用 `transform: scale(...)` 做安全视觉缩放。
- 改宽高：写入真实 `width` / `height`，支持只改宽、只改高或自由拉伸。
- 临时多选：`Shift` / `Cmd` / `Ctrl` 点选多个模块后，可一起移动、缩放、改宽高、对齐或统一尺寸。
- 干净导出：移除编辑器 UI 和注入脚本。

## 使用方式

### 用大模型安装技能

对 Codex 或类似 coding agent 说：

```text
请从 ClawHub 安装 html-mender 技能。（旧名 html-slide-mender 也会跳转到它。）
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

如果商店暂时还显示旧名，搜索 `html-slide-mender` 也可以找到同一个工具。

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

HTML Mender, formerly HTML Slide Mender, lets you visually edit **HTML slide decks and AI-generated presentation pages** in the browser: edit text, replace images, adjust styles, fine-tune layout, resize elements, and export clean HTML.

It is designed for the final editing pass after an AI has generated an HTML deck, especially dynamic one-page decks that contain multiple slides. On export, it starts from the original source HTML and patches back only text, image, background, and layout-style changes, preserving scripts, animations, navigation, and page structure as much as possible.

## Features

- Text editing: font size, color, bold, alignment, and line height.
- Image replacement: cover, contain, fill, zoom, and drag.
- Layout adjustment: move titles, images, cards, and block elements.
- Move/scale: safe visual scaling with `transform: scale(...)`.
- Resize: real `width` / `height` edits, including width-only, height-only, and freeform stretch changes.
- Temporary multi-select: `Shift` / `Cmd` / `Ctrl` click several modules to move, scale, resize, align, or match sizes together.
- Clean export: removes editor UI and injected runtime scripts.

## Usage

### Install The LLM Skill

Tell Codex or a similar coding agent:

```text
Please install the html-mender skill from ClawHub. The old html-slide-mender name redirects to it.
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

If the store still shows the old listing, `html-slide-mender` should find the same tool.

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
