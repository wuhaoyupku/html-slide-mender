(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  ns.mixins = ns.mixins || {};
  const {
    MESSAGE_NAMESPACE,
    EDITOR_BUILD_ID,
    ROOT_ID,
    TEXT_SELECTOR,
    BLOCK_TEXT_SELECTOR,
    EXCLUDED_SELECTOR,
    FONTS,
    EXPORT_MODE_STORAGE_KEY,
    LANG_STORAGE_KEY,
    DEFAULT_LANG,
    I18N
  } = ns.constants;
  const {
    normalizeText,
    isRendered,
    isVisibleRect,
    intersectsViewport,
    hasTextOverflow,
    round,
    clamp,
    sameState,
    restoreAttr,
    escapeHtml,
    escapeAttr,
    readFileAsDataUrl,
    toHexColor,
    filenameFromTitle,
    normalizeLanguage
  } = ns.utils;
  const {
    placeCaretAtEnd,
    placeCaretFromPoint,
    selectElementContents,
    rangeBelongsTo
  } = ns.selection;
  const { EDITOR_CSS } = ns.ui;

  ns.mixins.lifecycle = {
async handleCommand(command, payload = {}) {
      switch (command) {
        case "start":
          return this.start();
        case "exit":
          return this.exit();
        case "toggleBoxes":
          return this.toggleBoxes();
        case "download":
          return this.download(payload);
        case "setLanguage":
          return this.setLanguage(payload.language);
        case "status":
          return {
            ok: true,
            buildId: EDITOR_BUILD_ID,
            active: this.active,
            message: this.active ? this.t("started") : this.t("notActive")
          };
        default:
          return { ok: false, error: `Unknown editor command: ${command}` };
      }
    },

async start() {
      if (this.active) {
        this.scheduleScan(0);
        return { ok: true, message: this.t("alreadyActive"), summary: this.summaryText() };
      }

      await this.loadLanguage();
      await this.loadExportMode();
      await this.loadColorHistory();
      this.active = true;
      this.installUi();
      this.installEvents();
      this.runStartupScans();
      this.toast(this.t("editingCurrentView"));

      return { ok: true, message: this.t("started"), summary: this.summaryText() };
    },

async exit() {
      if (!this.active) {
        return { ok: true, message: this.t("notActive") };
      }

      this.commitActiveText();
      this.active = false;
      this.selectedId = null;
      this.selectedIds?.clear();
      this.editingTextId = null;
      this.savedTextRange = null;
      this.items.clear();
      this.removeEvents();
      this.removeUi();

      return { ok: true, message: this.t("exited") };
    },

async toggleBoxes() {
      if (!this.active) {
        await this.start();
      }

      this.showBoxes = !this.showBoxes;
      this.renderBoxes();
      this.refreshToolbar();
      return {
        ok: true,
        message: this.showBoxes ? this.t("boxesVisible") : this.t("boxesHidden"),
        summary: this.summaryText()
      };
    },

async loadLanguage() {
      try {
        const stored = await chrome.storage.local.get(LANG_STORAGE_KEY);
        this.lang = normalizeLanguage(stored?.[LANG_STORAGE_KEY]);
      } catch (_error) {
        this.lang = DEFAULT_LANG;
      }
    },

async setLanguage(language) {
      this.lang = normalizeLanguage(language);
      try {
        await chrome.storage.local.set({ [LANG_STORAGE_KEY]: this.lang });
      } catch (_error) {
        // Storage can be unavailable in smoke tests; the in-memory language still applies.
      }

      if (this.active) {
        this.removeUi();
        this.installUi();
        this.renderBoxes();
        this.refreshToolbar();
        this.toast(this.t("languageSet"));
      }

      return { ok: true, message: this.t("languageSet"), language: this.lang };
    },

async loadExportMode() {
      try {
        const stored = await chrome.storage.local.get(EXPORT_MODE_STORAGE_KEY);
        this.exportMode = this.normalizeExportMode(stored?.[EXPORT_MODE_STORAGE_KEY]);
      } catch (_error) {
        this.exportMode = "basic";
      }
    },

setExportMode(mode) {
      this.exportMode = this.normalizeExportMode(mode);
      this.refreshExportModeControl?.();
      try {
        chrome.storage.local.set({ [EXPORT_MODE_STORAGE_KEY]: this.exportMode }).catch?.(() => {});
      } catch (_error) {
        // Storage can be unavailable in smoke tests.
      }
      return this.exportMode;
    },

normalizeExportMode(mode) {
      return mode === "full" ? "full" : "basic";
    },

async toggleLanguage() {
      return this.setLanguage(this.lang === "zh-CN" ? "en" : "zh-CN");
    },

t(key) {
      return I18N[this.lang]?.[key] || I18N.en[key] || key;
    },

installEvents() {
      this.addEvent(window, "resize", () => this.scheduleScan(80), { passive: true });
      this.addEvent(window, "scroll", () => this.scheduleScan(80), { passive: true, capture: true });
      this.addEvent(window, "keyup", () => this.scheduleScan(120), { passive: true });
      this.addEvent(window, "wheel", () => this.scheduleScan(180), { passive: true });
      this.addEvent(window, "touchend", () => this.scheduleScan(180), { passive: true });
      this.addEvent(document, "transitionend", () => this.scheduleScan(80), true);
      this.addEvent(document, "animationend", () => this.scheduleScan(80), true);
      this.addEvent(document, "pointerdown", (event) => this.handleDocumentPointerDown(event), true);
      this.addEvent(document, "keydown", (event) => this.handleDocumentKeydown(event), true);
      this.addEvent(document, "selectionchange", () => {
        this.saveCurrentSelection();
        this.refreshToolbar();
      });
    },

removeEvents() {
      for (const remove of this.removers.splice(0)) {
        remove();
      }
      clearTimeout(this.scanTimer);
      this.clearStartupScanTimers();
    },

addEvent(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.removers.push(() => target.removeEventListener(type, handler, options));
    },

async handleAction(action) {
      const item = this.selectedItem();

      switch (action) {
        case "collapse":
          this.collapsed = !this.collapsed;
          this.toolbar.classList.toggle("is-collapsed", this.collapsed);
          return;
        case "language":
          await this.toggleLanguage();
          return;
        case "rescan":
          this.scheduleScan(0);
          this.toast(this.t("rescanned"));
          return;
        case "toggle-boxes":
          await this.toggleBoxes();
          return;
        case "content-mode":
          this.setEditorMode?.("content");
          return;
        case "layout-mode":
          this.setEditorMode?.("layout");
          return;
        case "layout-tool-move-scale":
          this.setLayoutToolMode?.("moveScale");
          return;
        case "layout-tool-size":
          this.setLayoutToolMode?.("size");
          return;
        case "layout-align-left":
          this.alignSelectedLayout?.("left");
          return;
        case "layout-align-h-center":
          this.alignSelectedLayout?.("h-center");
          return;
        case "layout-align-right":
          this.alignSelectedLayout?.("right");
          return;
        case "layout-align-top":
          this.alignSelectedLayout?.("top");
          return;
        case "layout-align-v-center":
          this.alignSelectedLayout?.("v-center");
          return;
        case "layout-align-bottom":
          this.alignSelectedLayout?.("bottom");
          return;
        case "layout-same-width":
          this.matchSelectedLayoutSize?.("width");
          return;
        case "layout-same-height":
          this.matchSelectedLayoutSize?.("height");
          return;
        case "layout-same-size":
          this.matchSelectedLayoutSize?.("both");
          return;
        case "undo":
          this.undo();
          return;
        case "redo":
          this.redo();
          return;
        case "add-text":
          this.addTextBlock?.();
          return;
        case "add-image":
          this.addImageBlock?.();
          return;
        case "download":
          await this.download();
          return;
        case "save-draft":
          await this.saveDraft?.();
          return;
        case "exit":
          await this.exit();
          return;
        case "bold":
          this.toggleTextStyle("fontWeight", "700", "400");
          return;
        case "italic":
          this.toggleTextStyle("fontStyle", "italic", "normal");
          return;
        case "underline":
          this.toggleUnderline();
          return;
        case "font-size-down":
          this.adjustFontSize(-2);
          return;
        case "font-size-up":
          this.adjustFontSize(2);
          return;
        case "align-left":
          this.applyTextStyle("textAlign", "left");
          return;
        case "align-center":
          this.applyTextStyle("textAlign", "center");
          return;
        case "align-right":
          this.applyTextStyle("textAlign", "right");
          return;
        case "image-replace":
          this.openImagePicker();
          return;
        case "fit-cover":
          this.applyImageFit("cover");
          return;
        case "fit-contain":
          this.applyImageFit("contain");
          return;
        case "fit-fill":
          this.applyImageFit("fill");
          return;
        case "zoom-in":
          this.zoomImage(0.12);
          return;
        case "zoom-out":
          this.zoomImage(-0.12);
          return;
        case "image-reset":
          this.resetSelectedImage();
          return;
        case "layout-reset":
          this.resetSelectedLayout?.();
          return;
        default:
          return;
      }
    },

handleControl(control, value) {
      switch (control) {
        case "fontFamily":
          this.applyTextStyle("fontFamily", value);
          break;
        case "fontSize":
          if (value) {
            this.applyFontSize(value);
          }
          break;
        case "color":
          this.applyTextStyle("color", value);
          break;
        case "highlight":
          this.applyTextStyle("backgroundColor", value);
          break;
        case "lineHeight":
          this.applyLineHeight(value);
          break;
        case "exportMode":
          this.setExportMode(value);
          break;
        default:
          break;
      }
    },

scheduleScan(delay = 100) {
      if (!this.active) {
        return;
      }
      clearTimeout(this.scanTimer);
      this.scanTimer = window.setTimeout(() => this.scan(), delay);
    },

runStartupScans() {
      this.clearStartupScanTimers();
      const delays = [0, 80, 220, 520, 1000];
      for (const delay of delays) {
        const timer = window.setTimeout(() => {
          if (!this.active) {
            return;
          }
          this.scan();
        }, delay);
        this.startupScanTimers.push(timer);
      }

      requestAnimationFrame(() => {
        if (this.active) {
          this.scan();
        }
      });
    },

clearStartupScanTimers() {
      for (const timer of this.startupScanTimers || []) {
        clearTimeout(timer);
      }
      this.startupScanTimers = [];
    },

scan() {
      if (!this.active) {
        return;
      }

      const next = new Map();
      const textItems = this.findTextItems();
      const imageItems = this.findImageItems();
      const layoutItems = this.findLayoutItems?.(textItems, imageItems) || [];

      for (const item of [...textItems, ...imageItems, ...layoutItems]) {
        next.set(item.id, item);
      }

      this.items = next;

      this.syncSelectionAfterScan();

      this.renderBoxes();
      this.refreshToolbar();
    },

selectItem(id, options = {}) {
      if (this.editingTextId && this.editingTextId !== id) {
        this.commitActiveText();
      }

      this.selectedIds = this.selectedIds || new Set();
      const canMultiSelect = this.isLayoutMode?.() && (options.toggle || options.extend || options.preserveGroup);
      if (canMultiSelect) {
        if (options.preserveGroup && this.selectedIds.has(id)) {
          this.selectedId = id;
        } else if ((options.toggle || options.extend) && this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
          this.selectedId = this.selectedId === id ? this.lastSelectedId() : this.selectedId;
        } else if (id) {
          this.selectedIds.add(id);
          this.selectedId = id;
        }

        if (!this.selectedIds.size) {
          this.selectedId = null;
        } else if (!this.selectedId || !this.selectedIds.has(this.selectedId)) {
          this.selectedId = this.lastSelectedId();
        }
      } else {
        this.selectedIds.clear();
        if (id) {
          this.selectedIds.add(id);
        }
        this.selectedId = id;
      }

      this.refreshToolbar();
      this.renderBoxes();
    },

clearSelection() {
      if (this.editingTextId) {
        this.commitActiveText();
      }

      this.selectedId = null;
      this.selectedIds?.clear();
      this.savedTextRange = null;
      this.colorTargetId = null;
      this.closeOpenMenus?.();
      this.refreshToolbar();
      this.renderBoxes();
    },

selectedItem() {
      return this.selectedId ? this.items.get(this.selectedId) : null;
    },

selectedItems() {
      const ids = this.selectedIds?.size
        ? Array.from(this.selectedIds)
        : (this.selectedId ? [this.selectedId] : []);
      return ids
        .map((id) => this.items.get(id) || this.itemFromHistoryId?.(id))
        .filter(Boolean);
    },

isItemSelected(id) {
      return Boolean(id && (this.selectedIds?.has(id) || this.selectedId === id));
    },

lastSelectedId() {
      const ids = Array.from(this.selectedIds || []);
      return ids.length ? ids[ids.length - 1] : null;
    },

isSelectionToggleEvent(event) {
      return Boolean(event?.shiftKey || event?.metaKey || event?.ctrlKey);
    },

syncSelectionAfterScan() {
      this.selectedIds = this.selectedIds || new Set();
      for (const id of Array.from(this.selectedIds)) {
        if (!this.items.has(id) && this.editingTextId !== id) {
          this.selectedIds.delete(id);
        }
      }

      if (this.selectedId && !this.items.has(this.selectedId) && this.editingTextId !== this.selectedId) {
        this.selectedId = this.lastSelectedId();
      }

      if (this.selectedId && this.items.has(this.selectedId)) {
        if (this.isLayoutMode?.()) {
          this.selectedIds.add(this.selectedId);
        } else {
          this.selectedIds.clear();
          this.selectedIds.add(this.selectedId);
        }
      } else if (!this.selectedIds.size) {
        this.selectedId = null;
      } else {
        this.selectedId = this.lastSelectedId();
      }
    },

summaryText() {
      const text = Array.from(this.items.values()).filter((item) => item.type === "text").length;
      const images = Array.from(this.items.values()).filter((item) => item.type === "image").length;
      const stats = this.modifiedStats();
      const changed = stats.total ? ` · ${stats.total} ${this.t("changed")}` : "";
      const layout = stats.layout ? ` · ${stats.layout} ${this.t("layoutUnit")}` : "";
      return `${text} ${this.t("textUnit")} · ${images} ${this.t("imageUnit")}${layout}${changed}`;
    },

    handleDocumentKeydown(event) {
      if (!this.active) {
        return;
      }

      if (this.host && event.composedPath?.().includes(this.host)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if (this.handleLayoutKeydown?.(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (this.editingTextId) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          event.stopImmediatePropagation();
          const item = this.items.get(this.editingTextId) || this.itemFromHistoryId(this.editingTextId);
          if (item) {
            selectElementContents(item.element);
            this.saveCurrentSelection();
          }
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.toggleTextStyle("fontWeight", "700", "400");
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.toggleTextStyle("fontStyle", "italic", "normal");
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.toggleUnderline();
          return;
        }

        event.stopImmediatePropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          this.commitActiveText();
        }
      }
    },

handleDocumentPointerDown(event) {
      if (!this.active || !this.selectedId) {
        return;
      }

      const path = event.composedPath?.() || [];
      if (this.host && path.includes(this.host)) {
        return;
      }

      const target = event.target;
      const selectedItems = this.selectedItems();
      if (selectedItems.some((item) => this.eventTargetsItem(target, item))) {
        return;
      }

      this.clearSelection();
    },

eventTargetsItem(target, item) {
      if (!target || target.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }

      const element = item.element;
      const frame = item.frameElement;
      return Boolean(
        element && (target === element || element.contains(target)) ||
        frame && (target === frame || frame.contains(target))
      );
    }
  };
})();
