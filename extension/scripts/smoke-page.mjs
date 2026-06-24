import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_SCRIPT_FILES } from "../src/content/content-script-files.js";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  if (error?.code === "MODULE_NOT_FOUND") {
    console.error([
      "Playwright is required for the browser smoke test.",
      "Install it from the extension directory:",
      "",
      "  npm install --no-save playwright",
      "  npx playwright install chromium",
      "  npm run smoke"
    ].join("\n"));
    process.exit(1);
  }
  throw error;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = createFixtureServer(root);
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const sampleFixturePath = resolve(root, "fixtures/sample-deck.html");
const sampleSourceHtml = await readFile(sampleFixturePath, "utf8");
const sampleUrl = `http://127.0.0.1:${port}/fixtures/sample-deck.html`;
const contentScriptSources = await Promise.all(
  CONTENT_SCRIPT_FILES.map(async (file) => ({
    file,
    source: await readFile(resolve(root, file), "utf8")
  }))
);
const errors = [];

const executablePath = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].find((candidate) => existsSync(candidate));

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {})
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    window.__hsmRuntimeMessages = [];
    window.chrome = {
      storage: {
        local: {
          async get(key) {
            return { [key]: "zh-CN" };
          },
          async set(value) {
            window.__hsmStored = { ...(window.__hsmStored || {}), ...value };
          }
        }
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            window.__hsmListeners = window.__hsmListeners || [];
            window.__hsmListeners.push(listener);
            window.__hsmListener = listener;
            return true;
          },
          removeListener(listener) {
            window.__hsmListeners = (window.__hsmListeners || []).filter((entry) => entry !== listener);
            if (window.__hsmListener === listener) {
              window.__hsmListener = window.__hsmListeners[window.__hsmListeners.length - 1] || null;
            }
            return true;
          }
        },
        sendMessage(message) {
          window.__hsmRuntimeMessages.push(message);
          return Promise.resolve({ ok: true, downloadId: 1 });
        }
      }
    };
  });

  await page.goto(sampleUrl);
  await page.addScriptTag({
    content: [
      `const skillSourceHtml = ${jsonForInlineScript(sampleSourceHtml)};`,
      "const skillOptions = { lang: \"zh-CN\", exportMode: \"basic\", autoStart: false };"
    ].join("\n")
  });
  await page.evaluate(() => {
    const startupGate = document.createElement("style");
    startupGate.dataset.test = "startup-scan-gate";
    startupGate.textContent = "#deck, .nav { visibility: hidden !important; }";
    document.head.appendChild(startupGate);
    window.setTimeout(() => startupGate.remove(), 180);

    const image = document.createElement("img");
    image.className = "loose-image";
    image.alt = "Loose image without a layout frame";
    image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 240'%3E%3Crect width='640' height='240' fill='%231f6fff'/%3E%3Ccircle cx='120' cy='120' r='76' fill='%23f5c84c'/%3E%3C/svg%3E";
    image.style.cssText = [
      "position:fixed",
      "left:36px",
      "bottom:82px",
      "width:320px",
      "height:auto",
      "z-index:4",
      "display:block"
    ].join(";");
    document.body.appendChild(image);
  });
  for (const script of contentScriptSources) {
    try {
      await page.addScriptTag({ content: script.source });
    } catch (error) {
      throw new Error(`Failed while injecting ${script.file}: ${error.message}`);
    }
  }
  try {
    await page.waitForFunction(() => typeof window.__hsmListener === "function", { timeout: 5000 });
  } catch (error) {
    throw new Error(`Editor listener was not registered. Page errors:\n${errors.join("\n") || "(none)"}`);
  }

  const startResponse = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__hsmListener({
        namespace: "HTML_SLIDE_MENDER",
        type: "EDITOR_COMMAND",
        command: "start"
      }, {}, resolve);
    });
  });

  if (!startResponse?.ok) {
    throw new Error(`Editor did not start: ${startResponse?.error || "unknown error"}`);
  }

  await page.waitForFunction(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return root?.shadowRoot?.querySelectorAll(".box").length >= 3;
  });

  const boxCounts = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const boxes = [...root.shadowRoot.querySelectorAll(".box")];
    return {
      total: boxes.length,
      text: boxes.filter((box) => box.classList.contains("box-text")).length,
      image: boxes.filter((box) => box.classList.contains("box-image")).length
    };
  });

  if (boxCounts.text < 2 || boxCounts.image < 1) {
    throw new Error(`Unexpected editable box counts: ${JSON.stringify(boxCounts)}`);
  }

  const pristineSourceExport = await page.evaluate(() => {
    return window.__htmlSlideMenderBootstrap.editor.serializeSourceBasedHtml(skillSourceHtml);
  });
  if (pristineSourceExport !== sampleSourceHtml) {
    throw new Error("Source-based export rewrote an unchanged HTML file.");
  }

  for (const script of contentScriptSources) {
    await page.addScriptTag({ content: script.source });
  }
  const reinjectionState = await page.evaluate(() => {
    const bootstrap = window.__htmlSlideMenderBootstrap;
    return {
      buildId: bootstrap?.buildId || "",
      active: Boolean(bootstrap?.editor?.active),
      listenerCount: window.__hsmListeners?.length || 0,
      selectedId: bootstrap?.editor?.selectedId || null
    };
  });

  if (!reinjectionState.buildId || !reinjectionState.active || reinjectionState.listenerCount !== 1) {
    throw new Error(`Repeated content-script injection did not reuse the active editor safely: ${JSON.stringify(reinjectionState)}`);
  }

  const toolbarLanguage = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return root.shadowRoot.textContent;
  });

  if (!toolbarLanguage.includes("下载 HTML")) {
    throw new Error("Toolbar did not render in Chinese by default.");
  }
  if (toolbarLanguage.includes("保存草稿")) {
    throw new Error("Skill-injected MVP toolbar should not show draft saving.");
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(80);
  const compactToolbarState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const toolbar = root.shadowRoot.querySelector("[data-role='toolbar']");
    const body = root.shadowRoot.querySelector(".toolbar-body");
    const rect = toolbar.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      viewportWidth: window.innerWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth
    };
  });

  if (compactToolbarState.height > 70 || compactToolbarState.width > compactToolbarState.viewportWidth - 20) {
    throw new Error(`Global toolbar is not compact on narrow viewports: ${JSON.stringify(compactToolbarState)}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(80);

  const brandPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-action='collapse']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.move(brandPoint.x, brandPoint.y);
  const brandHoverStyle = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const button = root.shadowRoot.querySelector("[data-action='collapse']");
    const style = getComputedStyle(button);
    const markStyle = getComputedStyle(button.querySelector(".brand-mark"));
    return {
      color: style.color,
      backgroundImage: style.backgroundImage,
      markColor: markStyle.color,
      markBackground: markStyle.backgroundColor
    };
  });

  if (brandHoverStyle.color !== "rgb(255, 255, 255)" || !brandHoverStyle.backgroundImage.includes("gradient")) {
    throw new Error(`Brand hover style is not readable: ${JSON.stringify(brandHoverStyle)}`);
  }
  if (brandHoverStyle.markColor === brandHoverStyle.markBackground) {
    throw new Error(`Brand mark hover contrast collapsed: ${JSON.stringify(brandHoverStyle)}`);
  }

  const languageResponse = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__hsmListener({
        namespace: "HTML_SLIDE_MENDER",
        type: "EDITOR_COMMAND",
        command: "setLanguage",
        payload: { language: "en" }
      }, {}, resolve);
    });
  });

  if (!languageResponse?.ok) {
    throw new Error(`Language switch failed: ${languageResponse?.error || "unknown error"}`);
  }

  const englishToolbar = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return root.shadowRoot.textContent;
  });

  if (!englishToolbar.includes("Download HTML")) {
    throw new Error("Toolbar did not switch to English.");
  }
  if (englishToolbar.includes("Save draft")) {
    throw new Error("Skill-injected MVP toolbar should not show draft saving after language switch.");
  }

  await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__hsmListener({
        namespace: "HTML_SLIDE_MENDER",
        type: "EDITOR_COMMAND",
        command: "setLanguage",
        payload: { language: "zh-CN" }
      }, {}, resolve);
    });
  });

  const layoutMultiSelectState = await page.evaluate(() => {
    const editor = window.__htmlSlideMenderBootstrap.editor;
    editor.setEditorMode("layout");
    editor.scan();

    function rectFor(id) {
      const item = editor.items.get(id);
      const rect = editor.itemBoxElement(item).getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    const candidates = Array.from(editor.items.values())
      .map((item) => ({ id: item.id, rect: rectFor(item.id) }))
      .filter(({ rect }) => rect.width >= 40 && rect.height >= 20);
    let pair = null;
    for (let index = 0; index < candidates.length && !pair; index += 1) {
      for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex += 1) {
        if (Math.abs(candidates[index].rect.top - candidates[nextIndex].rect.top) >= 20) {
          pair = [candidates[index].id, candidates[nextIndex].id];
          break;
        }
      }
    }
    if (!pair) {
      return { ok: false, reason: "No suitable layout pair", candidates };
    }

    editor.selectItem(pair[0]);
    editor.selectItem(pair[1], { toggle: true });
    const selectedAfterToggle = editor.selectedIds.size;
    const beforeMove = pair.map(rectFor);
    editor.moveSelectedLayoutBy(24, 16);
    const afterMove = pair.map(rectFor);
    editor.undo();
    const afterMoveUndo = pair.map(rectFor);

    editor.selectItem(pair[0]);
    editor.selectItem(pair[1], { toggle: true });
    const primaryBeforeAlign = rectFor(pair[1]);
    editor.alignSelectedLayout("top");
    const aligned = pair.map(rectFor);
    editor.undo();
    const afterAlignUndo = pair.map(rectFor);

    editor.clearSelection();
    editor.setEditorMode("content");
    editor.scan();

    return {
      ok: true,
      pair,
      selectedAfterToggle,
      beforeMove,
      afterMove,
      afterMoveUndo,
      primaryBeforeAlign,
      aligned,
      afterAlignUndo,
      selectedAfterCleanup: editor.selectedIds.size,
      modeAfterCleanup: editor.editMode
    };
  });

  if (!layoutMultiSelectState.ok) {
    throw new Error(`Could not set up layout multi-select smoke test: ${JSON.stringify(layoutMultiSelectState)}`);
  }
  if (layoutMultiSelectState.selectedAfterToggle !== 2) {
    throw new Error(`Layout multi-select did not retain two selected items: ${JSON.stringify(layoutMultiSelectState)}`);
  }
  for (const [index, before] of layoutMultiSelectState.beforeMove.entries()) {
    const after = layoutMultiSelectState.afterMove[index];
    const undone = layoutMultiSelectState.afterMoveUndo[index];
    if (after.left - before.left !== 24 || after.top - before.top !== 16) {
      throw new Error(`Layout group move did not apply the same delta: ${JSON.stringify(layoutMultiSelectState)}`);
    }
    if (Math.abs(undone.left - before.left) > 1 || Math.abs(undone.top - before.top) > 1) {
      throw new Error(`Layout group move did not undo as one operation: ${JSON.stringify(layoutMultiSelectState)}`);
    }
  }
  if (Math.abs(layoutMultiSelectState.aligned[0].top - layoutMultiSelectState.primaryBeforeAlign.top) > 1) {
    throw new Error(`Layout group top alignment did not use the primary selection: ${JSON.stringify(layoutMultiSelectState)}`);
  }
  if (Math.abs(layoutMultiSelectState.afterAlignUndo[0].top - layoutMultiSelectState.afterMoveUndo[0].top) > 1) {
    throw new Error(`Layout group alignment did not undo cleanly: ${JSON.stringify(layoutMultiSelectState)}`);
  }
  if (layoutMultiSelectState.selectedAfterCleanup !== 0 || layoutMultiSelectState.modeAfterCleanup !== "content") {
    throw new Error(`Layout multi-select cleanup left stale editor state: ${JSON.stringify(layoutMultiSelectState)}`);
  }

  const textPoint = await page.evaluate(() => {
    const rect = document.querySelector("p").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  await page.mouse.click(textPoint.x, textPoint.y);
  await page.waitForFunction(() => document.querySelector("p")?.isContentEditable);
  await page.keyboard.press("Control+A");

  const textPopoverState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const toolbar = root.shadowRoot.querySelector("[data-role='toolbar']");
    const popover = root.shadowRoot.querySelector("[data-role='edit-popover']");
    const textBox = root.shadowRoot.querySelector(".box-text.is-selected");
    const popoverRect = popover.getBoundingClientRect();
    const textRect = textBox.getBoundingClientRect();
    const verticalGapAbove = Math.abs(popoverRect.bottom - textRect.top);
    const verticalGapBelow = Math.abs(popoverRect.top - textRect.bottom);
    return {
      hidden: popover.hidden,
      selection: popover.dataset.selection,
      anchored: verticalGapAbove <= 16 || verticalGapBelow <= 16,
      toolbarHasGlobalDownload: Boolean(toolbar.querySelector("[data-action='download']")),
      toolbarHasTextControls: Boolean(toolbar.querySelector("[data-control='fontSize']"))
    };
  });

  if (textPopoverState.hidden || textPopoverState.selection !== "text" || !textPopoverState.anchored) {
    throw new Error(`Text edit popover was not anchored to the selected text: ${JSON.stringify(textPopoverState)}`);
  }
  if (!textPopoverState.toolbarHasGlobalDownload || textPopoverState.toolbarHasTextControls) {
    throw new Error(`Global toolbar changed after selecting text: ${JSON.stringify(textPopoverState)}`);
  }

  const selectedText = await page.evaluate(() => window.getSelection().toString());
  const editableText = await page.evaluate(() => document.querySelector("p").innerText);
  if (selectedText !== editableText) {
    throw new Error(`Control+A selected the wrong text: ${JSON.stringify(selectedText)}`);
  }

  const fontButtonPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const fontButton = shadow.querySelector("[data-combo-trigger='fontFamily']");
    const rect = fontButton.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(fontButtonPoint.x, fontButtonPoint.y);

  const fontMenuStateBeforePick = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const fontButton = shadow.querySelector("[data-combo-trigger='fontFamily']");
    const fontMenu = shadow.querySelector("[data-combo-menu='fontFamily']");
    const buttonRect = fontButton.getBoundingClientRect();
    const fontRect = fontMenu.getBoundingClientRect();
    return {
      visible: !fontMenu.hidden,
      width: Math.round(fontRect.width),
      opensDownward: fontRect.top >= buttonRect.bottom - 1
    };
  });
  await page.mouse.click(fontButtonPoint.x, fontButtonPoint.y);
  const fontMenuStillOpenAfterSecondClick = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return !root.shadowRoot.querySelector("[data-combo-menu='fontFamily']").hidden;
  });

  const fontOptionPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const option = root.shadowRoot.querySelector("[data-combo-menu='fontFamily'] [data-value='Arial, sans-serif']");
    const rect = option.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(fontOptionPoint.x, fontOptionPoint.y);

  const comboControlState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const editable = document.querySelector("p");
    const fontStyled = editable.querySelector("span") || editable;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);

    const sizeInput = shadow.querySelector("[data-control='fontSize']");
    sizeInput.focus();
    sizeInput.opened = true;
    sizeInput.value = "";
    return {
      fontMenuVisibleBeforePick: false,
      fontMenuWidth: 0,
      fontFamily: getComputedStyle(fontStyled).fontFamily,
      sizeInputList: sizeInput.getAttribute("list"),
      sizeControlTag: sizeInput.tagName.toLowerCase(),
      sizeMenuVisibleOnFocus: Boolean(sizeInput.opened),
      nativeSizeMenuVisibleOnFocus: !shadow.querySelector("[data-combo-menu='fontSize']").hidden,
      sizeOptionCount: shadow.querySelectorAll("[data-combo-option='fontSize']").length
    };
  });
  comboControlState.fontMenuVisibleBeforePick = fontMenuStateBeforePick.visible;
  comboControlState.fontMenuWidth = fontMenuStateBeforePick.width;
  comboControlState.fontMenuOpensDownward = fontMenuStateBeforePick.opensDownward;
  comboControlState.fontMenuStillOpenAfterSecondClick = fontMenuStillOpenAfterSecondClick;

  await page.keyboard.press("Escape");
  const sizeTriggerPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-combo-trigger='fontSize']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(sizeTriggerPoint.x, sizeTriggerPoint.y);
  const sizeMenuStateOnTrigger = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const combo = shadow.querySelector("[data-combo='fontSize']");
    const menu = shadow.querySelector("[data-combo-menu='fontSize']");
    const comboRect = combo.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      visible: !menu.hidden,
      opensDownward: menuRect.top >= comboRect.bottom - 1,
      optionCount: menu.querySelectorAll("[data-combo-option='fontSize']").length
    };
  });
  await page.mouse.click(sizeTriggerPoint.x, sizeTriggerPoint.y);
  const sizeMenuStillOpenAfterSecondClick = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return !root.shadowRoot.querySelector("[data-combo-menu='fontSize']").hidden;
  });
  await page.keyboard.press("Escape");

  const sizePoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-control='fontSize']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  await page.mouse.click(sizePoint.x, sizePoint.y);
  const sizeMenuStateOnInputClick = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const combo = shadow.querySelector("[data-combo='fontSize']");
    const menu = shadow.querySelector("[data-combo-menu='fontSize']");
    const comboRect = combo.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      visible: !menu.hidden,
      opensDownward: menuRect.top >= comboRect.bottom - 1
    };
  });
  await page.keyboard.type("6");
  const fontSizeTypingState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const input = shadow.querySelector("[data-control='fontSize']");
    const menu = shadow.querySelector("[data-combo-menu='fontSize']");
    return {
      value: input.value,
      menuVisible: !menu.hidden,
      optionCount: menu.querySelectorAll("[data-combo-option='fontSize']").length,
      selectedSix: Boolean(menu.querySelector("[data-combo-option='fontSize'][data-value='6'].is-selected"))
    };
  });

  if (!comboControlState.fontMenuVisibleBeforePick || comboControlState.fontMenuWidth < 170 || !comboControlState.fontMenuOpensDownward || !comboControlState.fontMenuStillOpenAfterSecondClick) {
    throw new Error(`Font menu did not open as a stable floating menu: ${JSON.stringify(comboControlState)}`);
  }
  if (!comboControlState.fontFamily.toLowerCase().includes("arial")) {
    throw new Error(`Font family option was not applied: ${JSON.stringify(comboControlState)}`);
  }
  if (comboControlState.sizeInputList) {
    throw new Error(`Font size input still uses a native datalist: ${JSON.stringify(comboControlState)}`);
  }
  if (comboControlState.sizeControlTag !== "input") {
    throw new Error(`Font size control should fall back to the stable native input: ${JSON.stringify(comboControlState)}`);
  }
  if (!comboControlState.nativeSizeMenuVisibleOnFocus || !sizeMenuStateOnTrigger.visible || !sizeMenuStateOnTrigger.opensDownward || !sizeMenuStillOpenAfterSecondClick || !sizeMenuStateOnInputClick.visible || !sizeMenuStateOnInputClick.opensDownward || fontSizeTypingState.menuVisible || fontSizeTypingState.optionCount < 20 || fontSizeTypingState.optionCount > 28) {
    throw new Error(`Font size menu did not follow input/dropdown behavior: ${JSON.stringify({ comboControlState, sizeMenuStateOnTrigger, sizeMenuStillOpenAfterSecondClick, sizeMenuStateOnInputClick, fontSizeTypingState })}`);
  }
  if (fontSizeTypingState.value !== "6") {
    throw new Error(`Font size input was not directly editable: ${JSON.stringify(fontSizeTypingState)}`);
  }
  if (!fontSizeTypingState.selectedSix) {
    throw new Error(`Font size presets should include 6px: ${JSON.stringify(fontSizeTypingState)}`);
  }

  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const editable = document.querySelector("p");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const input = root.shadowRoot.querySelector("[data-live-control='color']");
    input.value = "#ff0000";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });

  const colorApplied = await page.evaluate(() => {
    const editable = document.querySelector("p");
    let styled = editable;
    while (styled.firstElementChild) styled = styled.firstElementChild;
    return getComputedStyle(styled).color;
  });

  if (colorApplied !== "rgb(255, 0, 0)") {
    throw new Error(`Text color was not applied: ${colorApplied}`);
  }

  const colorButtonPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-color-button='color']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(colorButtonPoint.x, colorButtonPoint.y);

  const colorOptionPoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const menu = shadow.querySelector("[data-role='color-menu']");
    const option = shadow.querySelector("[data-color-option='#00B050']");
    if (!menu || menu.hidden || !option) {
      return {
        x: null,
        y: null,
        menuVisible: Boolean(menu && !menu.hidden),
        optionCount: shadow.querySelectorAll("[data-color-option]").length
      };
    }
    const rect = option.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      menuVisible: true,
      optionCount: shadow.querySelectorAll("[data-color-option]").length
    };
  });
  if (typeof colorOptionPoint.x === "number" && typeof colorOptionPoint.y === "number") {
    await page.mouse.click(colorOptionPoint.x, colorOptionPoint.y);
  }

  const colorPickerState = await page.evaluate((beforePick) => {
    if (typeof beforePick.x !== "number") {
      return {
        installed: false,
        menuVisible: beforePick.menuVisible,
        optionCount: beforePick.optionCount
      };
    }
    const editable = document.querySelector("p");
    const root = document.querySelector("#html-slide-mender-root");
    let styled = editable;
    while (styled.firstElementChild) styled = styled.firstElementChild;
    return {
      installed: true,
      color: getComputedStyle(styled).color,
      history: window.__hsmStored?.htmlSlideMenderColorHistory || [],
      swatch: root.shadowRoot.querySelector("[data-color-button='color'] [data-role='color-swatch']").style.background
    };
  }, colorOptionPoint);

  if (!colorPickerState.installed) {
    throw new Error(`Office color menu did not open correctly: ${JSON.stringify(colorPickerState)}`);
  }
  if (colorPickerState.color !== "rgb(0, 176, 80)") {
    throw new Error(`Office color menu did not apply text color: ${JSON.stringify(colorPickerState)}`);
  }
  if (!colorPickerState.history.includes("#00B050")) {
    throw new Error(`Color history was not updated: ${JSON.stringify(colorPickerState)}`);
  }

  const h1Point = await page.evaluate(() => {
    const rect = document.querySelector("h1").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const button = root.shadowRoot.querySelector("[data-color-button='color']");
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true }));
    button.click();
  });
  await page.mouse.click(h1Point.x, h1Point.y);
  await page.waitForFunction(() => document.querySelector("h1")?.isContentEditable);

  const colorDidNotLeak = await page.evaluate(() => {
    const headline = document.querySelector("h1");
    const style = getComputedStyle(headline);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      html: headline.innerHTML
    };
  });

  if (colorDidNotLeak.color === "rgb(0, 176, 80)" || colorDidNotLeak.backgroundColor === "rgb(255, 242, 168)") {
    throw new Error(`Remembered colors leaked into another text box: ${JSON.stringify(colorDidNotLeak)}`);
  }

  await page.mouse.click(textPoint.x, textPoint.y);
  await page.waitForFunction(() => document.querySelector("p")?.isContentEditable);
  await page.keyboard.press("Control+A");

  const colorButtonPointForMenu = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-color-button='color']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  const colorMenuWasHidden = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    return root.shadowRoot.querySelector("[data-role='color-menu']")?.hidden;
  });
  await page.mouse.click(colorButtonPointForMenu.x, colorButtonPointForMenu.y);

  const colorMenuBeforeMore = await page.evaluate((wasHidden) => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    const button = shadow.querySelector("[data-color-button='color']");
    const menu = shadow.querySelector("[data-role='color-menu']");
    const recentOption = menu?.querySelector(".history-grid [data-color-option='#00B050']");
    const firstPreset = menu?.querySelector(".preset-grid [data-color-option]");
    const more = menu?.querySelector("[data-color-more]");
    const firstRect = firstPreset?.getBoundingClientRect();
    const beforeAdvanced = Boolean(menu?.querySelector(".pcr-app"));
    return {
      menuVisible: Boolean(menu && !menu.hidden),
      appInstalledBeforeMore: beforeAdvanced,
      recentVisible: Boolean(recentOption),
      swatchWidth: firstRect ? Math.round(firstRect.width) : 0,
      swatchHeight: firstRect ? Math.round(firstRect.height) : 0,
      beforeHidden: wasHidden,
      afterHidden: menu?.hidden,
      buttonExists: Boolean(button),
      moreRect: more ? (() => {
        const rect = more.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      })() : null
    };
  }, colorMenuWasHidden);

  if (colorMenuBeforeMore.moreRect) {
    await page.mouse.click(colorMenuBeforeMore.moreRect.x, colorMenuBeforeMore.moreRect.y);
  }

  const colorMenuState = await page.evaluate((beforeMore) => {
    const root = document.querySelector("#html-slide-mender-root");
    const menu = root.shadowRoot.querySelector("[data-role='color-menu']");
    const advanced = menu?.querySelector(".pcr-app");
    return {
      ...beforeMore,
      appInstalledAfterMore: Boolean(advanced),
      appVisibleAfterMore: Boolean(advanced?.classList.contains("visible")),
      clickResult: true
    };
  }, colorMenuBeforeMore);

  if (!colorMenuState.menuVisible) {
    throw new Error(`Office color menu was not visible: ${JSON.stringify(colorMenuState)}`);
  }
  if (colorMenuState.appInstalledBeforeMore) {
    throw new Error(`Advanced picker should not make the default color menu large: ${JSON.stringify(colorMenuState)}`);
  }
  if (!colorMenuState.appInstalledAfterMore || !colorMenuState.appVisibleAfterMore) {
    throw new Error(`Pickr advanced picker did not open from More colors: ${JSON.stringify(colorMenuState)}`);
  }
  if (!colorMenuState.recentVisible) {
    throw new Error(`Color history was not visible in the menu: ${JSON.stringify(colorMenuState)}`);
  }
  if (colorMenuState.swatchWidth > 18 || colorMenuState.swatchHeight > 18) {
    throw new Error(`Office color swatches are too large: ${JSON.stringify(colorMenuState)}`);
  }

  await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const button = root.shadowRoot.querySelector("[data-color-button='color']");
    button.click();
  });

  await page.evaluate(() => {
    const editable = document.querySelector("p");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const editable = document.querySelector("p");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    function clickAction(action) {
      const button = root.shadowRoot.querySelector(`[data-action='${action}']`);
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true }));
      button.click();
    }
    const size = root.shadowRoot.querySelector("[data-control='fontSize']");
    size.value = "64";
    size.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    clickAction("font-size-up");
    clickAction("font-size-down");
    const highlight = root.shadowRoot.querySelector("[data-live-control='highlight']");
    highlight.value = "#fff2a8";
    highlight.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const line = root.shadowRoot.querySelector("[data-control='lineHeight']");
    line.value = "1.2";
    line.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    line.stepUp();
    line.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });

  const textStyleApplied = await page.evaluate(() => {
    function deepest(element) {
      let current = element;
      while (current.firstElementChild) current = current.firstElementChild;
      return current;
    }

    function styleChain(element, boundary, property) {
      const values = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        values.push(getComputedStyle(current)[property]);
        if (current === boundary) break;
        current = current.parentElement;
      }
      return values;
    }

    const headline = document.querySelector("p");
    const styled = deepest(headline);
    const styledComputed = getComputedStyle(styled);
    const headlineComputed = getComputedStyle(headline);
    return {
      fontWeight: Math.max(...styleChain(styled, headline, "fontWeight").map((value) => Number.parseInt(value, 10) || 0)),
      fontStyle: styleChain(styled, headline, "fontStyle"),
      textDecoration: styleChain(styled, headline, "textDecorationLine"),
      fontSize: styleChain(styled, headline, "fontSize"),
      backgroundColor: styleChain(styled, headline, "backgroundColor"),
      lineHeight: headline.style.lineHeight || headlineComputed.lineHeight
    };
  });

  if (!textStyleApplied.fontSize.includes("64px")) {
    throw new Error(`Font size was not applied: ${JSON.stringify(textStyleApplied)}`);
  }
  if (!textStyleApplied.backgroundColor.includes("rgb(255, 242, 168)")) {
    throw new Error(`Highlight was not applied: ${JSON.stringify(textStyleApplied)}`);
  }
  if (textStyleApplied.lineHeight !== "1.3") {
    throw new Error(`Line height was not applied: ${JSON.stringify(textStyleApplied)}`);
  }

  async function expectToggle(action, readState, expectedOn, expectedOff) {
    await page.evaluate((buttonAction) => {
      const root = document.querySelector("#html-slide-mender-root");
      const button = root.shadowRoot.querySelector(`[data-action='${buttonAction}']`);
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true }));
      button.click();
    }, action);
    const on = await page.evaluate(readState);
    if (!expectedOn(on)) {
      throw new Error(`${action} did not turn on: ${JSON.stringify(on)}`);
    }
    const buttonOn = await page.evaluate((buttonAction) => {
      const root = document.querySelector("#html-slide-mender-root");
      const button = root.shadowRoot.querySelector(`[data-action='${buttonAction}']`);
      return {
        state: button.dataset.state,
        active: button.classList.contains("is-active"),
        mixed: button.classList.contains("is-mixed"),
        ariaPressed: button.getAttribute("aria-pressed")
      };
    }, action);
    if (!buttonOn.active || buttonOn.state !== "active" || buttonOn.ariaPressed !== "true") {
      throw new Error(`${action} button did not show active state: ${JSON.stringify(buttonOn)}`);
    }

    await page.evaluate((buttonAction) => {
      const root = document.querySelector("#html-slide-mender-root");
      const button = root.shadowRoot.querySelector(`[data-action='${buttonAction}']`);
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true }));
      button.click();
    }, action);
    const off = await page.evaluate(readState);
    if (!expectedOff(off)) {
      throw new Error(`${action} did not turn off: ${JSON.stringify(off)}`);
    }
    const buttonOff = await page.evaluate((buttonAction) => {
      const root = document.querySelector("#html-slide-mender-root");
      const button = root.shadowRoot.querySelector(`[data-action='${buttonAction}']`);
      return {
        state: button.dataset.state,
        active: button.classList.contains("is-active"),
        mixed: button.classList.contains("is-mixed"),
        ariaPressed: button.getAttribute("aria-pressed")
      };
    }, action);
    if (buttonOff.active || buttonOff.mixed || buttonOff.state !== "inactive" || buttonOff.ariaPressed !== "false") {
      throw new Error(`${action} button did not clear active state: ${JSON.stringify(buttonOff)}`);
    }
  }

  await expectToggle(
    "bold",
    () => {
      const editable = document.querySelector("p");
      return Math.max(...[editable, ...editable.querySelectorAll("span")]
        .map((node) => Number.parseInt(getComputedStyle(node).fontWeight, 10) || 0));
    },
    (value) => value >= 600,
    (value) => value < 600
  );

  await expectToggle(
    "italic",
    () => {
      const editable = document.querySelector("p");
      return [editable, ...editable.querySelectorAll("span")]
        .map((node) => getComputedStyle(node).fontStyle);
    },
    (value) => value.includes("italic"),
    (value) => !value.includes("italic")
  );

  await expectToggle(
    "underline",
    () => {
      const editable = document.querySelector("p");
      return [editable, ...editable.querySelectorAll("span")]
        .map((node) => getComputedStyle(node).textDecorationLine);
    },
    (value) => value.some((item) => item.includes("underline")),
    (value) => !value.some((item) => item.includes("underline"))
  );

  await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    root.shadowRoot.querySelector("[data-action='align-center']").click();
  });

  const alignApplied = await page.evaluate(() => getComputedStyle(document.querySelector("p")).textAlign);
  if (alignApplied !== "center") {
    throw new Error(`Text alignment was not applied: ${alignApplied}`);
  }

  await page.mouse.click(24, 300);
  const textDismissState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    return {
      popoverHidden: shadow.querySelector("[data-role='edit-popover']").hidden,
      selectedBoxes: shadow.querySelectorAll(".box.is-selected").length,
      paragraphEditable: document.querySelector("p").isContentEditable
    };
  });

  if (!textDismissState.popoverHidden || textDismissState.selectedBoxes !== 0 || textDismissState.paragraphEditable) {
    throw new Error(`Clicking outside text did not dismiss the edit popover: ${JSON.stringify(textDismissState)}`);
  }

  const imagePoint = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image");
    const rect = box.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  await page.mouse.click(imagePoint.x, imagePoint.y);

  const imagePopoverState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const toolbar = root.shadowRoot.querySelector("[data-role='toolbar']");
    const popover = root.shadowRoot.querySelector("[data-role='edit-popover']");
    const imageBox = root.shadowRoot.querySelector(".box-image.is-selected");
    const popoverRect = popover.getBoundingClientRect();
    const imageRect = imageBox.getBoundingClientRect();
    const verticalGapAbove = Math.abs(popoverRect.bottom - imageRect.top);
    const verticalGapBelow = Math.abs(popoverRect.top - imageRect.bottom);
    return {
      hidden: popover.hidden,
      selection: popover.dataset.selection,
      anchored: verticalGapAbove <= 16 || verticalGapBelow <= 16,
      toolbarHasGlobalDownload: Boolean(toolbar.querySelector("[data-action='download']")),
      toolbarHasImageControls: Boolean(toolbar.querySelector("[data-action='image-replace']"))
    };
  });

  if (imagePopoverState.hidden || imagePopoverState.selection !== "image" || !imagePopoverState.anchored) {
    throw new Error(`Image edit popover was not anchored to the selected image: ${JSON.stringify(imagePopoverState)}`);
  }
  if (!imagePopoverState.toolbarHasGlobalDownload || imagePopoverState.toolbarHasImageControls) {
    throw new Error(`Global toolbar changed after selecting image: ${JSON.stringify(imagePopoverState)}`);
  }

  await page.mouse.click(24, 300);
  const imageDismissState = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root.shadowRoot;
    return {
      popoverHidden: shadow.querySelector("[data-role='edit-popover']").hidden,
      selectedBoxes: shadow.querySelectorAll(".box.is-selected").length
    };
  });

  if (!imageDismissState.popoverHidden || imageDismissState.selectedBoxes !== 0) {
    throw new Error(`Clicking outside image did not dismiss the edit popover: ${JSON.stringify(imageDismissState)}`);
  }

  await page.mouse.click(imagePoint.x, imagePoint.y);

  async function clickToolbarAction(action) {
    await page.evaluate((buttonAction) => {
      const root = document.querySelector("#html-slide-mender-root");
      root.shadowRoot.querySelector(`[data-action='${buttonAction}']`).click();
    }, action);
  }

  const imageFrameBefore = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image").getBoundingClientRect();
    const image = document.querySelector("img");
    return {
      transform: image.style.transform,
      objectFit: image.style.objectFit,
      width: image.style.width,
      height: image.style.height,
      parentOverflow: image.parentElement.style.overflow,
      box: { left: box.left, top: box.top, width: box.width, height: box.height }
    };
  });

  await clickToolbarAction("fit-contain");
  let imageFit = await page.evaluate(() => {
    const image = document.querySelector("img");
    return {
      objectFit: image.style.objectFit,
      width: image.style.width,
      height: image.style.height,
      parentOverflow: image.parentElement.style.overflow
    };
  });
  if (imageFit.objectFit !== "contain" || imageFit.width !== "100%" || imageFit.height !== "100%" || imageFit.parentOverflow !== "hidden") {
    throw new Error(`Image contain fit was not applied as a framed edit: ${JSON.stringify(imageFit)}`);
  }

  await clickToolbarAction("fit-fill");
  imageFit = await page.evaluate(() => document.querySelector("img").style.objectFit);
  if (imageFit !== "fill") {
    throw new Error(`Image fill fit was not applied: ${imageFit}`);
  }

  await clickToolbarAction("fit-cover");
  imageFit = await page.evaluate(() => document.querySelector("img").style.objectFit);
  if (imageFit !== "cover") {
    throw new Error(`Image cover fit was not applied: ${imageFit}`);
  }
  const imageFrameAfterFit = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image").getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  });
  if (JSON.stringify(imageFrameBefore.box) !== JSON.stringify(imageFrameAfterFit)) {
    throw new Error(`Image frame changed while applying fit modes: ${JSON.stringify({ before: imageFrameBefore.box, after: imageFrameAfterFit })}`);
  }

  const imageDragBefore = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image").getBoundingClientRect();
    const image = document.querySelector("img");
    return {
      transform: image.style.transform,
      box: { left: box.left, top: box.top, width: box.width, height: box.height }
    };
  });

  await page.mouse.move(imagePoint.x, imagePoint.y);
  await page.mouse.down();
  await page.mouse.move(imagePoint.x + 80, imagePoint.y + 50);
  await page.mouse.up();

  const imageDragAfter = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image").getBoundingClientRect();
    const image = document.querySelector("img");
    return {
      transform: image.style.transform,
      x: image.style.getPropertyValue("--hsm-image-x"),
      y: image.style.getPropertyValue("--hsm-image-y"),
      box: { left: box.left, top: box.top, width: box.width, height: box.height }
    };
  });

  if (!imageDragAfter.transform.includes("translate(80px, 50px)") || imageDragAfter.x !== "80" || imageDragAfter.y !== "50") {
    throw new Error(`Image content drag was not applied: ${JSON.stringify(imageDragAfter)}`);
  }
  if (JSON.stringify(imageDragBefore.box) !== JSON.stringify(imageDragAfter.box)) {
    throw new Error(`Image frame moved during internal drag: ${JSON.stringify({ before: imageDragBefore.box, after: imageDragAfter.box })}`);
  }

  await clickToolbarAction("zoom-in");
  const imageZoom = await page.evaluate(() => document.querySelector("img").style.transform);
  if (!imageZoom.includes("scale(1.12)")) {
    throw new Error(`Image zoom was not applied: ${imageZoom}`);
  }

  const replacePoint = await imageReplaceButtonPoint(page);

  const replacementPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=",
    "base64"
  );
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.mouse.click(replacePoint.x, replacePoint.y);
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: replacementPng
  });
  await page.waitForFunction(() => document.querySelector("img")?.src.startsWith("data:image/png"));

  const replacementApplied = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image").getBoundingClientRect();
    const image = document.querySelector("img");
    return {
      src: image.getAttribute("src") || "",
      srcset: image.getAttribute("srcset") || "",
      objectFit: image.style.objectFit,
      width: image.style.width,
      height: image.style.height,
      x: image.style.getPropertyValue("--hsm-image-x"),
      y: image.style.getPropertyValue("--hsm-image-y"),
      box: { left: box.left, top: box.top, width: box.width, height: box.height }
    };
  });

  if (!replacementApplied.src.startsWith("data:image/png")) {
    throw new Error(`Image replacement did not update src: ${JSON.stringify(replacementApplied)}`);
  }
  if (replacementApplied.srcset) {
    throw new Error(`Image replacement did not clear srcset: ${JSON.stringify(replacementApplied)}`);
  }
  if (replacementApplied.objectFit !== "cover" || replacementApplied.width !== "100%" || replacementApplied.height !== "100%") {
    throw new Error(`Image replacement did not preserve the framed editing mode: ${JSON.stringify(replacementApplied)}`);
  }
  if (replacementApplied.x !== "0" || replacementApplied.y !== "0") {
    throw new Error(`Image replacement did not recenter content: ${JSON.stringify(replacementApplied)}`);
  }
  if (JSON.stringify(imageDragBefore.box) !== JSON.stringify(replacementApplied.box)) {
    throw new Error(`Image frame changed after replacement: ${JSON.stringify({ before: imageDragBefore.box, after: replacementApplied.box })}`);
  }

  const loosePoint = await page.evaluate(() => {
    const rect = document.querySelector(".loose-image").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  await page.mouse.click(loosePoint.x, loosePoint.y);

  const looseFrameBefore = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image.is-selected").getBoundingClientRect();
    const image = document.querySelector(".loose-image");
    const rect = image.getBoundingClientRect();
    return {
      box: {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height)
      },
      image: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  });

  const looseReplacePoint = await imageReplaceButtonPoint(page);

  const looseFileChooserPromise = page.waitForEvent("filechooser");
  await page.mouse.click(looseReplacePoint.x, looseReplacePoint.y);
  const looseChooser = await looseFileChooserPromise;
  await looseChooser.setFiles({
    name: "loose-replacement.png",
    mimeType: "image/png",
    buffer: replacementPng
  });
  await page.waitForFunction(() => document.querySelector(".loose-image")?.src.startsWith("data:image/png"));

  const looseReplacementApplied = await page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const box = root.shadowRoot.querySelector(".box-image.is-selected").getBoundingClientRect();
    const image = document.querySelector(".loose-image");
    const frame = image.parentElement;
    const frameRect = frame.getBoundingClientRect();
    return {
      src: image.getAttribute("src") || "",
      width: image.style.width,
      height: image.style.height,
      frameDataset: frame.getAttribute("data-hsm-image-frame") || "",
      box: {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height)
      },
      frame: {
        left: Math.round(frameRect.left),
        top: Math.round(frameRect.top),
        width: Math.round(frameRect.width),
        height: Math.round(frameRect.height)
      }
    };
  });

  if (!looseReplacementApplied.src.startsWith("data:image/png")) {
    throw new Error(`Loose image replacement did not update src: ${JSON.stringify(looseReplacementApplied)}`);
  }
  if (looseReplacementApplied.frameDataset !== "true") {
    throw new Error(`Loose image was not wrapped in a stable frame: ${JSON.stringify(looseReplacementApplied)}`);
  }
  if (looseReplacementApplied.width !== "100%" || looseReplacementApplied.height !== "100%") {
    throw new Error(`Loose image content was not constrained to its frame: ${JSON.stringify(looseReplacementApplied)}`);
  }
  if (JSON.stringify(looseFrameBefore.box) !== JSON.stringify(looseReplacementApplied.box)) {
    throw new Error(`Loose image overlay changed after replacement: ${JSON.stringify({ before: looseFrameBefore, after: looseReplacementApplied })}`);
  }

  await page.evaluate(() => {
    window.__htmlSlideMenderBootstrap.editor.addTextBlock();
  });
  await page.waitForFunction(() => document.querySelector("[data-hsm-added='text']")?.isContentEditable);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Inserted smoke text");
  await page.keyboard.press("Escape");

  const insertedAspectImage = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='600' viewBox='0 0 300 600'><rect width='300' height='600' fill='#1f6fff'/><circle cx='150' cy='160' r='92' fill='#f5c84c'/></svg>"
  );
  await page.evaluate(async (dataUrl) => {
    await window.__htmlSlideMenderBootstrap.editor.insertImageBlock(dataUrl);
  }, insertedAspectImage);
  await page.waitForFunction(() => document.querySelector("[data-hsm-added='image']")?.src.startsWith("data:image/svg+xml"));
  const insertedImageAspect = await page.evaluate(() => {
    const image = document.querySelector("[data-hsm-added='image']");
    const rect = image.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      ratio: rect.width / rect.height
    };
  });
  if (Math.abs(insertedImageAspect.ratio - 0.5) > 0.03) {
    throw new Error(`Inserted image frame did not preserve source aspect ratio: ${JSON.stringify(insertedImageAspect)}`);
  }

  await page.evaluate(() => {
    const editor = window.__htmlSlideMenderBootstrap.editor;
    const addedImage = document.querySelector("[data-hsm-added='image']");
    const item = Array.from(editor.items.values()).find((candidate) => candidate.element === addedImage);
    editor.selectItem(item.id);
    editor.resetSelectedImage();
  });
  const addImageReplacePoint = await imageReplaceButtonPoint(page);
  const addImageReplaceChooserPromise = page.waitForEvent("filechooser");
  await page.mouse.click(addImageReplacePoint.x, addImageReplacePoint.y);
  const addImageReplaceChooser = await addImageReplaceChooserPromise;
  await addImageReplaceChooser.setFiles({
    name: "inserted-replacement.png",
    mimeType: "image/png",
    buffer: replacementPng
  });
  const addedReplacementState = await page.waitForFunction(() => {
    const image = document.querySelector("[data-hsm-added='image']");
    if (!image?.src.startsWith("data:image/png")) {
      return false;
    }
    const rect = image.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8 ? {
      src: image.getAttribute("src") || "",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: getComputedStyle(image).display !== "none"
    } : false;
  }).then((handle) => handle.jsonValue());

  if (!addedReplacementState.visible) {
    throw new Error(`Inserted image disappeared after reset + replace: ${JSON.stringify(addedReplacementState)}`);
  }

  const addedImageResizeState = await page.evaluate(() => {
    const editor = window.__htmlSlideMenderBootstrap.editor;
    const image = document.querySelector("[data-hsm-added='image']");
    const item = Array.from(editor.items.values()).find((candidate) => candidate.element === image);
    editor.selectItem(item.id);
    editor.setEditorMode("layout");
    const adjustment = editor.layoutAdjustmentFor(item);
    const target = adjustment.target;
    const before = target.getBoundingClientRect();
    editor.ensureLayoutSizeBase(adjustment, { width: true, height: true });
    adjustment.width = before.width + 48;
    adjustment.height = before.height + 24;
    editor.applyLayoutSizeAdjustment(item, adjustment);
    const after = target.getBoundingClientRect();
    target.style.left = "24px";
    target.style.top = "16px";
    editor.setEditorMode("content");
    return {
      before: { width: Math.round(before.width), height: Math.round(before.height) },
      after: { width: Math.round(after.width), height: Math.round(after.height) },
      minWidth: target.style.minWidth,
      maxWidth: target.style.maxWidth,
      frameWidth: image.style.getPropertyValue("--hsm-frame-width"),
      frameHeight: image.style.getPropertyValue("--hsm-frame-height")
    };
  });

  if (
    addedImageResizeState.after.width <= addedImageResizeState.before.width ||
    addedImageResizeState.after.height <= addedImageResizeState.before.height
  ) {
    throw new Error(`Inserted image frame resize did not apply: ${JSON.stringify(addedImageResizeState)}`);
  }

  const addedElementState = await page.evaluate(() => {
    const editor = window.__htmlSlideMenderBootstrap.editor;
    editor.undo();
    editor.scan();
    const imageAfterUndo = Boolean(document.querySelector("[data-hsm-added='image']"));
    editor.redo();
    editor.scan();
    const text = document.querySelector("[data-hsm-added='text']");
    const image = document.querySelector("[data-hsm-added='image']");
    const stats = editor.modifiedStats();
    return {
      text: text?.textContent || "",
      imageRestored: Boolean(image?.isConnected),
      imageAfterUndo,
      addedItems: editor.addedItems.size,
      changed: stats.total
    };
  });

  if (!addedElementState.text.includes("Inserted smoke text") || !addedElementState.imageRestored || !addedElementState.imageAfterUndo) {
    throw new Error(`Added text/image creation or undo/redo failed: ${JSON.stringify(addedElementState)}`);
  }
  if (addedElementState.addedItems < 2 || addedElementState.changed < 2) {
    throw new Error(`Added elements were not tracked as exportable changes: ${JSON.stringify(addedElementState)}`);
  }

  await page.evaluate(() => {
    const image = document.querySelector("[data-hsm-added='image']");
    const root = image?.parentElement?.matches?.("[data-hsm-image-frame]") ? image.parentElement : image;
    if (root) {
      root.style.left = "24px";
      root.style.top = "16px";
    }
  });

  await page.evaluate(() => {
    document.querySelector("[data-go='1']")?.click();
  });

  const runtimeDeckState = await page.evaluate(() => ({
    transform: document.querySelector("#deck")?.style.transform || "",
    generatedDotCount: document.querySelectorAll("#generated-dots button").length
  }));

  if (!runtimeDeckState.transform.includes("translateX") || runtimeDeckState.generatedDotCount !== 3) {
    throw new Error(`Fixture did not enter runtime slide state before export: ${JSON.stringify(runtimeDeckState)}`);
  }

  const downloadResponse = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__hsmListener({
        namespace: "HTML_SLIDE_MENDER",
        type: "EDITOR_COMMAND",
        command: "download"
      }, {}, resolve);
    });
  });

  if (!downloadResponse?.ok) {
    throw new Error(`Download command failed: ${downloadResponse?.error || "unknown error"}`);
  }

  const exported = await page.evaluate(() => {
    const message = window.__hsmRuntimeMessages.find((item) => item.type === "DOWNLOAD_HTML");
    return message?.payload?.html || "";
  });

  if (!exported.includes("<!doctype html>") && !exported.includes("<!DOCTYPE html>")) {
    throw new Error("Export did not include a doctype.");
  }

  if (/<[^>]+id=["']html-slide-mender-root["']/i.test(exported)) {
    throw new Error("Export leaked the editor root.");
  }

  if (exported.includes("--hsm-external-css")) {
    throw new Error("Basic export unexpectedly inlined external CSS.");
  }

  if (!/rel=["']stylesheet["'][^>]+external-deck\.css/i.test(exported)) {
    throw new Error("Basic export did not keep the original external stylesheet link.");
  }

  if (!exported.includes("data:image/png")) {
    throw new Error("Basic export did not include the replacement image from the edited source content.");
  }

  if (!exported.includes("Inserted smoke text")) {
    throw new Error("Basic export did not include newly inserted text.");
  }

  if (!/body[\s\S]*<img[^>]+src=["']data:image\/png/i.test(exported)) {
    throw new Error("Basic export did not include the newly inserted image in source HTML.");
  }

  if (/data-hsm-added|data-hsm-added-id|data-hsm-image-frame/i.test(exported)) {
    throw new Error("Basic export leaked editor-only inserted-element markers.");
  }

  if (/id=["']generated-dots["'][\s\S]*?<button/i.test(exported)) {
    throw new Error("Basic export saved runtime-generated slide navigation buttons.");
  }

  if (/id=["']deck["'][^>]*style=["'][^"']*translateX/i.test(exported)) {
    throw new Error("Basic export saved the current slide transform runtime state.");
  }

  const exportedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await exportedPage.setContent(exported, { waitUntil: "domcontentloaded" });
    const exportedDeckBefore = await exportedPage.evaluate(() => ({
      hasEditorRoot: Boolean(document.querySelector("#html-slide-mender-root")),
      slideCount: document.querySelectorAll("#deck > .slide").length,
      generatedDotCount: document.querySelectorAll("#generated-dots button").length,
      initialTransform: document.querySelector("#deck")?.style.transform || "",
      paragraphLineHeight: document.querySelector("p")?.style.lineHeight || "",
      insertedText: document.body.textContent.includes("Inserted smoke text"),
      dataPngImages: document.querySelectorAll("img[src^='data:image/png']").length
    }));

    if (
      exportedDeckBefore.hasEditorRoot ||
      exportedDeckBefore.slideCount !== 3 ||
      exportedDeckBefore.generatedDotCount !== 3 ||
      exportedDeckBefore.initialTransform
    ) {
      throw new Error(`Downloaded HTML did not reopen as a clean one-page deck: ${JSON.stringify(exportedDeckBefore)}`);
    }
    if (exportedDeckBefore.paragraphLineHeight !== "1.3") {
      throw new Error(`Downloaded HTML did not keep edited text styles: ${JSON.stringify(exportedDeckBefore)}`);
    }
    if (!exportedDeckBefore.insertedText || exportedDeckBefore.dataPngImages < 2) {
      throw new Error(`Downloaded HTML did not keep inserted text/image elements: ${JSON.stringify(exportedDeckBefore)}`);
    }

    await exportedPage.click("[data-go='1']");
    const exportedDeckAfter = await exportedPage.evaluate(() => ({
      transform: document.querySelector("#deck")?.style.transform || "",
      activeDotCount: document.querySelectorAll("#generated-dots button.active").length
    }));
    if (!exportedDeckAfter.transform.includes("translateX(-100vw)") || exportedDeckAfter.activeDotCount !== 1) {
      throw new Error(`Downloaded one-page deck could not advance slides: ${JSON.stringify(exportedDeckAfter)}`);
    }
  } finally {
    await exportedPage.close();
  }

  const fullDownloadResponse = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__hsmListener({
        namespace: "HTML_SLIDE_MENDER",
        type: "EDITOR_COMMAND",
        command: "download",
        payload: { mode: "full" }
      }, {}, resolve);
    });
  });

  if (!fullDownloadResponse?.ok) {
    throw new Error(`Full download command failed: ${fullDownloadResponse?.error || "unknown error"}`);
  }

  const fullExported = await page.evaluate(() => {
    const messages = window.__hsmRuntimeMessages.filter((item) => item.type === "DOWNLOAD_HTML");
    return messages[messages.length - 1]?.payload?.html || "";
  });

  if (!fullExported.includes("--hsm-external-css")) {
    throw new Error(`Full export did not inline accessible external CSS: ${fullExported.match(/external-deck[^"'<\n]*/i)?.[0] || "no external-deck reference"}`);
  }

  if (/rel=["']stylesheet["'][^>]+external-deck\.css/i.test(fullExported)) {
    throw new Error("Full export kept an accessible external stylesheet link instead of inlining it.");
  }

  if (!/src=["']data:image\/png/i.test(fullExported)) {
    throw new Error("Full export did not keep replacement images bundled as data URLs.");
  }

  if (errors.length) {
    throw new Error(`Page errors:\n${errors.join("\n")}`);
  }

  console.log(`Smoke test passed: ${boxCounts.text} text boxes, ${boxCounts.image} image boxes.`);
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

function createFixtureServer(rootDir) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }
      const requested = decodeURIComponent(url.pathname === "/" ? "/fixtures/sample-deck.html" : url.pathname);
      const filePath = resolve(rootDir, `.${requested}`);
      if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch (_error) {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function contentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html;charset=utf-8";
    case ".css":
      return "text/css;charset=utf-8";
    case ".js":
      return "text/javascript;charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function imageReplaceButtonPoint(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const shadow = root?.shadowRoot;
    const popover = shadow?.querySelector("[data-role='edit-popover']");
    const button = shadow?.querySelector("[data-action='image-replace']");
    const rect = button?.getBoundingClientRect();
    return Boolean(
      popover &&
      button &&
      !popover.hidden &&
      popover.dataset.selection === "image" &&
      rect &&
      rect.width > 0 &&
      rect.height > 0
    );
  });

  return page.evaluate(() => {
    const root = document.querySelector("#html-slide-mender-root");
    const rect = root.shadowRoot.querySelector("[data-action='image-replace']").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
}

function jsonForInlineScript(value) {
  return JSON.stringify(String(value || ""))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
