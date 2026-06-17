---
name: html-slide-mender
description: Visual editor for local or saved HTML files, especially HTML PPTs, AI-generated presentation pages, one-page web slide decks, and dynamic JavaScript slide pages. Use this skill whenever the user wants to make a local HTML editable, edit or modify an HTML PPT, fix text, replace images, adjust layout/position/size, move/scale/resize/stretch a title/image/card/block, or says phrases like “修改这个 HTML”, “HTML PPT 可编辑”, “标题往上一点”, “调整版面”, or “改宽高”. Clean export patches text/images/backgrounds/layout styles back into the original source HTML instead of saving runtime DOM. Do not use for live websites, authenticated online pages, generic source-code edits, or PPTX/PowerPoint files; ask for a saved local HTML copy first.
version: 0.1.8
metadata:
  openclaw:
    homepage: https://github.com/wuhaoyupku/html-slide-mender
    requires:
      bins:
        - node
---

# HTML Slide Mender

Use this skill to turn a local `.html` deck into a browser-editable copy. It is built for HTML PPTs and AI-generated slide pages where the user wants small visual edits instead of regenerating the whole page.

## Core Behavior

- Generates an editable `*.editable.html` next to the source unless `--out` is provided.
- Keeps the original source HTML as the clean-export baseline.
- Exports by patching changed text, images, background images, and layout styles back into the source.
- Avoids saving editor UI, generated runtime state, navigation dots, current-slide transforms, or injected scripts.
- Never modifies the original HTML by default.

## Workflow

1. Locate the user's local source HTML. If multiple files match, ask which one to edit.
2. Run the injector:

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /absolute/path/input.html
```

3. Open the generated editable file directly, preferably as `file:///absolute/path/name.editable.html`.
4. Let the user edit visually in the browser.
5. Tell the user to click `下载 HTML` / `Download HTML` to save the durable clean result.

Do not start a local HTTP server just to view the file unless `file://` blocks required local assets.

## Script Options

```bash
node scripts/inject-html-editor.mjs <input.html> \
  --out <output.html> \
  --lang zh-CN \
  --mode basic
```

- `--out`: custom output path.
- `--lang zh-CN|en`: editor language. Default: `zh-CN`.
- `--mode basic`: keeps external links and applies edits back to source HTML. Default: `basic`.
- `--no-autostart`: inject runtime without starting the editor automatically.

## Important Notes

- Local draft saving is disabled; refreshing can lose unsaved edits.
- Keep editable/exported HTML next to the original assets when the deck uses relative CSS or images.
- CSP meta tags are preserved. If CSP blocks inline startup, use the browser extension workflow or ask the user how to handle the trusted file.
- The skill runtime does not bundle remote CSS/images and avoids network-backed export.
- If the editable page appears unstyled, regenerate it beside the original HTML so relative paths resolve.

## Version Notes

### 0.1.8

- Adds `移动缩放 / 改宽高 / 恢复` in layout mode.
- `移动缩放` uses `transform: scale(...)` for safer visual scaling.
- `改宽高` writes real `width` / `height` for width-only, height-only, or stretched changes.
- `恢复` clears movement, scale, and editor-added size while preserving original transform and inline dimensions.

### 0.1.7

- Adds `文字/图片` and `位置微调` mode switching.
- Adds drag and arrow-key layout movement for visible text, images, cards, and blocks.
- Preserves layout changes in clean source-based export.
- Improves nested layout selection so smaller inner elements remain selectable.
- Adds explicit edit-box state feedback.

## Example

User: `帮我把 /Users/me/deck.html 变成可编辑版本`

Run:

```bash
node /path/to/this-skill/scripts/inject-html-editor.mjs /Users/me/deck.html --lang zh-CN --mode basic
```

Then open `/Users/me/deck.editable.html` for visual editing.
