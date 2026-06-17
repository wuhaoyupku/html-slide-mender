# HTML Slide Mender Extension

Chrome-compatible Manifest V3 extension for visually editing local or saved HTML slide pages, then exporting a clean HTML copy.

## Load Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this `extension` folder.
5. Open an HTML slide page and click the extension action.

For local `file://` decks, enable `Allow access to file URLs` on the extension details page.

## Scope

- Chinese / English UI.
- Visible text and image detection.
- Text editing: font size, color, bold, alignment, line height.
- Image replacement: fit, zoom, drag, reset.
- Layout mode: move elements, safe visual scale, and real width/height resize.
- Basic HTML export for generated slide files; full single-file export for bundled webpage edits.

## Development

```bash
npm run check
```

The editor is split into ordered content-script modules under `src/content/modules/`. When adding a module, update `src/content/content-script-files.js`; the injector, validator, and smoke test read that list.

Key modules:

- `config.js`: constants, selectors, fonts, i18n.
- `scanner.js`: visible text/image detection.
- `text.js`: text editing and style application.
- `image.js`: image replacement and image-frame adjustments.
- `layout.js`: move, scale, resize, and layout export tracking.
- `history.js`: undo/redo and modified tracking.
- `exporter.js`: clean HTML export.
- `ui.js` / `styles.js`: floating editor UI.
- `editor-app.js`: editor class assembly.

Vendor bundles:

- Pickr color picker: `vendor/pickr*`.
- Vaadin combo-box adapter: `vendor/vaadin-ui-kit.js`.

Rebuild the UI kit after changing Vaadin dependencies or `src/content/ui-kit/vaadin-entry.js`:

```bash
npm run build:ui-kit
```

Browser smoke test requires Playwright installed separately:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```
