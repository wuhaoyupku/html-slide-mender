---
name: html-slide-mender
description: Visual editor for local or saved HTML files, especially HTML slide decks, AI-generated HTML presentations, and "HTML PPT" pages. Use this skill whenever the user says they want to edit, modify, fix, change, or "修改这个 HTML" for a local/saved `.html` file, including simple text or image edits. Do not use for live websites, authenticated online pages, generic HTML coding tasks, or PPTX/PowerPoint files; ask for a saved local HTML copy first.
version: 0.1.5
metadata:
  openclaw:
    homepage: https://github.com/wuhaoyupku/html-slide-mender
    requires:
      bins:
        - node
---

# HTML Slide Mender

Search terms: Local HTML editor for slides, HTML PPT editor, HTML slide deck editor, AI HTML presentation mender, saved HTML page editor, HTML text and image editor, web PPT local mender.

This skill turns a local or saved `.html` file into an editable browser page by injecting the HTML Slide Mender runtime. It is especially useful for AI-generated HTML presentations, HTML PPT outputs, and one-page web slide decks where the user only wants to change text or images without asking the model to regenerate the whole file. The generated editable HTML can be opened directly as a local file.

Use this skill whenever the user asks to edit, modify, fix, change, or update "this HTML" and the target is a local or saved `.html` file. Phrases like "edit this HTML", "modify this HTML", "make this HTML editable", "change the text in this HTML", or "replace an image in this HTML PPT" should trigger this skill.

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
- `--strip-csp`: remove meta Content-Security-Policy tags only when the user accepts that risk because CSP is blocking the local editor.
- `--preserve-csp`: legacy no-op; CSP meta tags are preserved by default.

## Important Behavior

- The generated editable HTML includes the editor runtime inline, marked with `data-hsm-editor`.
- The editor's clean export removes its own toolbar, boxes, and injected runtime scripts.
- Local draft saving is disabled. Refreshing or closing the editable page can lose unsaved edits; use "Download HTML" when the user wants to keep the result.
- The injector preserves meta Content-Security-Policy tags by default. If a trusted local deck does not start because CSP blocks inline scripts, rerun with `--strip-csp` after warning the user that this weakens protections in the editable copy.
- For skill-injected pages in `basic` mode, the final download starts from the original source HTML and applies content-layer edits to text/images/backgrounds instead of serializing the live runtime DOM. This avoids freezing slide-deck runtime state such as generated navigation dots or the currently translated slide.
- For PPT-style HTML with separate CSS or image files, keep the edited HTML next to the original assets so relative paths continue to work.
- The skill runtime does not bundle remote CSS or images. It avoids network-backed resource collection during export.
- If the editable page appears unstyled, generate the editable file next to the original HTML so relative CSS/image paths still resolve. Only consider a local HTTP server if the user's browser blocks necessary local assets under `file://` and direct local opening cannot work.

## Example

User: "I want to modify this HTML: `/Users/me/deck.html`."

Run:

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /Users/me/deck.html --lang zh-CN --mode basic
```

Then open `/Users/me/deck.editable.html` and let the user edit in the browser.

---

# HTML Slide Mender

搜索关键词：本地 HTML 编辑、HTML PPT 编辑、网页 PPT 本地修补、HTML 幻灯片编辑、AI 生成 HTML PPT 修补、HTML 文字图片编辑。

这个技能会把一个本地或已保存的 `.html` 文件变成可以在浏览器里可视化编辑的页面。它特别适合 AI 生成的 HTML 演示文稿、HTML PPT、一个网页里包含多页幻灯片的页面，以及用户只想改几个字或换几张图、不想让大模型重新生成整份文件的场景。生成的可编辑 HTML 可以直接作为本地文件打开。

只要用户说想“编辑这个 HTML”“修改这个 HTML”“改一下这个 HTML”“把这个 HTML 变成可编辑”“改这个 HTML PPT 里的文字/图片”，并且目标是本地或已保存的 `.html` 文件，就应该使用这个技能。

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
- `--strip-csp`：只有在用户接受风险、且 CSP 确实阻止本地编辑器启动时，才移除 meta Content-Security-Policy。
- `--preserve-csp`：兼容旧用法；现在默认就会保留 CSP。

## 重要行为

- 生成的可编辑 HTML 会内联编辑器运行时，并用 `data-hsm-editor` 标记。
- 干净导出会移除编辑器自己的工具栏、选框和注入脚本。
- 本地草稿保存是关闭的。刷新或关闭可编辑页面可能丢失未下载的修改；用户要保存结果时，应点击“下载 HTML”。
- 注入脚本默认保留 meta Content-Security-Policy。如果可信的本地 HTML 因 CSP 无法启动编辑器，先提醒用户这会降低可编辑副本的保护，再用 `--strip-csp` 重新生成。
- 对 skill 注入的页面，`basic` 模式会从原始 HTML 出发，只应用内容层的文字、图片、背景图修改，而不是保存运行中的 DOM 状态。这可以避免把幻灯片运行时状态、生成出来的导航点、当前翻页位置等错误保存进去。
- HTML PPT 如果依赖独立 CSS 或图片文件，把导出的 HTML 放在原始资源旁边，确保相对路径继续可用。
- skill 运行时不会打包远程 CSS 或图片，导出时不做基于网络的资源收集。
- 如果打开可编辑页面后样式丢失，把可编辑文件生成到原 HTML 旁边，确保相对路径还能正常解析。只有在用户的浏览器因为 `file://` 限制阻止必要本地资源、直接打开确实不可用时，才考虑本地 HTTP 服务。

## 示例

用户：“我想修改这个 HTML：`/Users/me/deck.html`。”

运行：

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /Users/me/deck.html --lang zh-CN --mode basic
```

然后打开 `/Users/me/deck.editable.html`，让用户在浏览器里编辑。
