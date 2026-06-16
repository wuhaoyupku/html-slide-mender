---
name: html-slide-mender
description: Visual editor for local or saved HTML files, especially dynamic HTML slide decks, one-page web PPTs, AI-generated HTML presentations, and "HTML PPT" pages. Use this skill whenever the user wants to make a local HTML PPT editable, fix text, replace images, or visually micro-adjust layout/positions such as moving a title, image, card, or block a little. Its clean export patches text/images/backgrounds/layout styles back into the original HTML source instead of saving the live browser DOM, so slide navigation, generated dots, transforms, scripts, and runtime state do not pollute the final file. Do not use for live websites, authenticated online pages, generic HTML coding tasks, or PPTX/PowerPoint files; ask for a saved local HTML copy first.
version: 0.1.7
metadata:
  openclaw:
    homepage: https://github.com/wuhaoyupku/html-slide-mender
    requires:
      bins:
        - node
---

# HTML Slide Mender

Search terms: Local HTML editor for slides, HTML PPT editor, dynamic HTML PPT editor, one-page web slide deck editor, AI HTML presentation mender, saved HTML page editor, HTML text/image/layout editor, web PPT local mender, source-based HTML PPT export, visual layout micro-adjustment.

This skill turns a local or saved `.html` file into an editable browser page by injecting the HTML Slide Mender runtime. It is especially useful for AI-generated HTML presentations, HTML PPT outputs, dynamic one-page web slide decks, and pages where the user only wants to change text, replace images, or lightly adjust visual positions without asking the model to regenerate the whole file. The generated editable HTML can be opened directly as a local file.

For one-page web decks and dynamic JavaScript slide pages, this skill keeps the original HTML as the export baseline and applies content/layout-layer patches back into that source. This helps preserve slide navigation, generated dots, transforms, animations, and initialization scripts as part of the original page structure.

Use this skill whenever the user asks to edit, modify, fix, change, or update "this HTML" and the target is a local or saved `.html` file. Phrases like "edit this HTML", "modify this HTML", "make this HTML editable", "change the text in this HTML", "replace an image in this HTML PPT", "move this title a little", "adjust the layout", or "this HTML PPT position is off" should trigger this skill.

Do not use this skill for live websites, authenticated online pages, arbitrary source-code editing, or `.pptx` / PowerPoint files. If the user points to an online page, first ask for or create a saved local HTML copy, then use this skill on that local copy.

## Workflow

1. Locate the user's source HTML file. If multiple local `.html` files could match, ask which one to edit.
2. Run the injector script:

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /absolute/path/input.html
```

3. Use the JSON output to find the generated editable file. By default it is created next to the source file as `name.editable.html`.
4. Open the editable HTML directly in a browser when the user wants to edit immediately. Prefer a local file URL such as `file:///absolute/path/name.editable.html`, or the in-app browser's direct local-file opening capability when available. Do not start a local HTTP server just to view the editable file.
5. Let the user edit visually in the page.
6. When finished, tell the user to click the editor toolbar's "Download HTML" button. The downloaded file is the durable clean result.

The original HTML file is never modified by default.

## Script Options

```bash
node scripts/inject-html-editor.mjs <input.html> \
  --out <output.html> \
  --lang zh-CN \
  --mode basic
```

- `--out`: custom editable HTML output path.
- `--lang zh-CN|en`: editor language. Default: `zh-CN`.
- `--mode basic`: export mode. The skill runtime only supports `basic`, which keeps original external links and applies content edits to the source HTML. Default: `basic`.
- `--no-autostart`: inject runtime but do not start the editor automatically.

## Important Behavior

- The generated editable HTML includes the editor runtime inline, marked with `data-hsm-editor`.
- The editor's clean export removes its own toolbar, boxes, and injected runtime scripts.
- Local draft saving is disabled. Refreshing or closing the editable page can lose unsaved edits; use "Download HTML" when the user wants to keep the result.
- The injector preserves meta Content-Security-Policy tags and does not provide a CSP-stripping mode. If a local deck's CSP blocks inline editor startup, do not weaken the file automatically; use the browser extension workflow or ask the user how they want to handle that trusted file.
- For skill-injected pages in `basic` mode, the final download starts from the original source HTML and applies content/layout-layer edits to text/images/backgrounds/position styles instead of serializing the live runtime DOM. This avoids freezing slide-deck runtime state such as generated navigation dots or the currently translated slide.
- The original source HTML is kept inside the editor's private runtime closure for source-based export. It is not exposed through a `window` global.
- For PPT-style HTML with separate CSS or image files, keep the edited HTML next to the original assets so relative paths continue to work.
- The skill runtime does not bundle remote CSS or images. It avoids network-backed resource collection during export.
- If the editable page appears unstyled, generate the editable file next to the original HTML so relative CSS/image paths still resolve. Only consider a local HTTP server if the user's browser blocks necessary local assets under `file://` and direct local opening cannot work.

## Version Notes

### 0.1.7

- Adds a visible `Text/Image` and `Move layout` mode switch in the editor toolbar.
- Adds layout micro-adjustment mode for moving visible text, image, card, and block elements with drag or arrow keys.
- Preserves layout adjustments in clean source-based export without saving runtime editor UI.
- Improves nested selection so smaller inner elements stay selectable when larger layout boxes overlap them.
- Adds explicit edit-box state feedback: `Boxes on` / `Boxes off`.

## Example

User: "I want to modify this HTML: `/Users/me/deck.html`."

Run:

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /Users/me/deck.html --lang zh-CN --mode basic
```

Then open `/Users/me/deck.editable.html` and let the user edit in the browser.

---

# HTML Slide Mender

搜索关键词：本地 HTML 编辑、HTML PPT 编辑、动态 HTML PPT 编辑、一页网页 PPT 修补、网页 PPT 本地修补、HTML 幻灯片编辑、AI 生成 HTML PPT 修补、HTML 文字图片版面编辑、位置微调、基于源 HTML 的干净导出。

这个技能会把一个本地或已保存的 `.html` 文件变成可以在浏览器里可视化编辑的页面。它特别适合 AI 生成的 HTML 演示文稿、HTML PPT、动态的一页网页幻灯片、一个网页里包含多页 PPT 的页面，以及用户只想改几个字、换几张图、或者把标题/图片/卡片的位置轻微调一下、不想让大模型重新生成整份文件的场景。生成的可编辑 HTML 可以直接作为本地文件打开。

对于一页网页里包含多页 PPT、并通过 JavaScript 控制翻页或动画的页面，这个技能会保留原始 HTML 作为导出底稿，只把内容层和版面微调层的文字、图片、背景图、位置样式修改 patch 回源文件结构里。这样可以更好地保留原页面的翻页逻辑、导航点、`transform`、动画和初始化脚本结构。

只要用户说想“编辑这个 HTML”“修改这个 HTML”“改一下这个 HTML”“把这个 HTML 变成可编辑”“改这个 HTML PPT 里的文字/图片”“这个标题往上一点”“调整一下版面位置”，并且目标是本地或已保存的 `.html` 文件，就应该使用这个技能。

不要直接用于在线网站、需要登录的网页、泛泛的源码改写任务，或 `.pptx` / PowerPoint 文件。如果用户给的是在线页面，先让用户提供本地保存的 HTML 副本，或者先把页面保存成本地 HTML，再对本地文件使用这个技能。

## 工作流

1. 找到用户要编辑的源 HTML 文件。如果有多个可能的本地 `.html` 文件，先问用户要编辑哪一个。
2. 运行注入脚本：

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /absolute/path/input.html
```

3. 从 JSON 输出里找到生成的可编辑文件。默认会在源文件旁边生成 `name.editable.html`。
4. 如果用户现在就要编辑，直接在浏览器里打开这个可编辑 HTML。优先使用 `file:///absolute/path/name.editable.html` 这种本地文件地址，或者使用 Codex 内置浏览器直接打开本地文件的能力。不要为了查看这个可编辑文件专门启动本地 HTTP 服务。
5. 让用户直接在页面里可视化编辑文字和图片。
6. 编辑完成后，让用户点击编辑器工具栏里的“下载 HTML”按钮。下载得到的 HTML 才是最终可长期保存的干净文件。

默认不会修改原始 HTML 文件。

## 脚本参数

```bash
node scripts/inject-html-editor.mjs <input.html> \
  --out <output.html> \
  --lang zh-CN \
  --mode basic
```

- `--out`：自定义可编辑 HTML 的输出路径。
- `--lang zh-CN|en`：编辑器语言，默认 `zh-CN`。
- `--mode basic`：导出模式。skill 运行时只支持 `basic`，它会保留原始外部链接，并把内容修改应用回源 HTML。默认 `basic`。
- `--no-autostart`：注入运行时，但不自动启动编辑器。

## 重要行为

- 生成的可编辑 HTML 会内联编辑器运行时，并用 `data-hsm-editor` 标记。
- 干净导出会移除编辑器自己的工具栏、选框和注入脚本。
- 本地草稿保存是关闭的。刷新或关闭可编辑页面可能丢失未下载的修改；用户要保存结果时，应点击“下载 HTML”。
- 注入脚本保留 meta Content-Security-Policy，并且不提供移除 CSP 的模式。如果本地 HTML 的 CSP 阻止内联编辑器启动，不要自动降低文件保护；改用浏览器插件工作流，或者先询问用户要如何处理这个可信文件。
- 对 skill 注入的页面，`basic` 模式会从原始 HTML 出发，只应用内容层和版面微调层的文字、图片、背景图、位置样式修改，而不是保存运行中的 DOM 状态。这可以避免把幻灯片运行时状态、生成出来的导航点、当前翻页位置等错误保存进去。
- 原始 HTML 底稿会保存在编辑器运行时自己的私有闭包里，用于 source-based export，不会通过 `window` 全局变量暴露。
- HTML PPT 如果依赖独立 CSS 或图片文件，把导出的 HTML 放在原始资源旁边，确保相对路径继续可用。
- skill 运行时不会打包远程 CSS 或图片，导出时不做基于网络的资源收集。
- 如果打开可编辑页面后样式丢失，把可编辑文件生成到原 HTML 旁边，确保相对路径还能正常解析。只有在用户的浏览器因为 `file://` 限制阻止必要本地资源、直接打开确实不可用时，才考虑本地 HTTP 服务。

## 版本说明

### 0.1.7

- 新增工具栏里的“文字/图片”和“位置微调”模式切换。
- 新增版面微调模式，可以拖动或用方向键移动当前可见文字、图片、卡片和块级元素。
- 干净导出会保留位置微调结果，同时继续移除编辑器 UI 和运行时脚本。
- 优化大版面套小版面的选择顺序，小元素不会再被大框盖住而选不中。
- 编辑框开关现在显示明确状态：“编辑框 开” / “编辑框 关”。

## 示例

用户：“我想修改这个 HTML：`/Users/me/deck.html`。”

运行：

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /Users/me/deck.html --lang zh-CN --mode basic
```

然后打开 `/Users/me/deck.editable.html`，让用户在浏览器里编辑。
