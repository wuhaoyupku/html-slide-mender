# Contributing

Thanks for helping improve HTML Mender.

## Development Setup

```bash
cd extension
npm install
npm run check
```

Browser smoke tests use Playwright, which is not part of the default dependency set:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

Load the extension locally from the `extension/` folder with Chrome's "Load unpacked" flow.

## Pull Request Checklist

- Keep changes focused on one behavior or issue.
- Run `npm run check` before opening a PR.
- Run the Playwright smoke test when touching editor, export, scanner, or browser behavior.
- Update `extension/src/content/content-script-files.js` when adding content modules.
- Rebuild `skills/html-slide-mender/assets/html-slide-mender-runtime.js` after changing extension runtime modules:

```bash
node skills/html-slide-mender/scripts/rebuild-runtime-from-extension.mjs
```

## Scope Notes

The MVP saves by downloading a clean HTML file. Please do not add local overwrite-save, live website writeback, or draft persistence without a design discussion and tests that cover HTML PPT pages with runtime-generated slide navigation.
