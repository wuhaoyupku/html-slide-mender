# HTML Slide Mender Extension

Chrome-compatible Manifest V3 extension for editing visible text and images on
HTML slide pages, then exporting a clean local HTML copy.

## Load Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this `extension` folder.
5. Open an HTML slide page and click the extension action.

For local `file://` decks, enable "Allow access to file URLs" on the extension
details page.

You can test with `fixtures/sample-deck.html` after enabling file URL access.

## MVP Scope

- Runtime injection only after the user invokes the extension.
- Chinese / English UI switching from the popup or floating toolbar.
- Floating editor toolbar; no side panels and no page navigation takeover.
- Current viewport text and image detection.
- Text editing, font size, color, bold, alignment, and line height controls.
- Image replacement, fit mode, zoom, drag, and reset.
- Layout micro-adjustment mode for lightly moving visible text, image, card, and block elements.
- Basic HTML export for generated slide files, plus full single-file export for
  webpage edits when CSS and image resources should be bundled.

## Text Editing Notes

- Click a text box once to enter editing mode.
- `Ctrl+A` / `Cmd+A` selects only the current editable text block.
- Mouse drag selection works after the text box is in editing mode.
- Text style controls apply to the current selection first; with no active
  selection they apply to the whole text block.

## Development

The content editor is split into classic content-script modules so the unpacked
extension can inject files in a deterministic order. Most editor modules are
plain scripts; third-party Web Components are bundled into local vendor files.

- `src/content/modules/config.js`: constants, selectors, fonts, i18n.
- `src/content/modules/utils.js`: generic DOM and serialization helpers.
- `src/content/modules/selection.js`: caret and text-range helpers.
- `src/content/modules/ui-kit.js`: shared UI component adapters.
- `src/content/modules/scanner.js`: visible text/image detection.
- `src/content/modules/text.js`: text editing and style application.
- `src/content/modules/image.js`: image replace, fit, zoom, and drag.
- `src/content/modules/history.js`: mutation history and modified tracking.
- `src/content/modules/exporter.js`: clean HTML export.
- `src/content/modules/ui.js` and `styles.js`: floating editor UI.
- `src/content/modules/editor-app.js`: assembles the editor class.
- `src/content/editor.js`: bootstraps the singleton and message listener.

Vendor color picker files under `vendor/pickr*` come from Pickr 1.9.1 and are
included with the local MIT license copy in `vendor/pickr-LICENSE.txt`.

The shared combo-box control is built from Vaadin Web Components and bundled to
`vendor/vaadin-ui-kit.js`. License and dependency notices are kept in
`vendor/vaadin-LICENSE.txt` and `vendor/vaadin-NOTICES.txt`.

Rebuild the local UI kit bundle after changing Vaadin dependencies or
`src/content/ui-kit/vaadin-entry.js`:

```bash
npm run build:ui-kit
```

When adding a content module, update `src/content/content-script-files.js`; the
background injector, validator, and smoke test all read that list.

Run the static checks from this directory:

```bash
npm run check
```

To run the browser smoke test, install Playwright separately:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

Playwright is intentionally kept out of the default dependency set. The smoke
test is for contributors who want to verify browser editing and clean export
behavior end to end.
