(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  ns.mixins = ns.mixins || {};
  const {
    MESSAGE_NAMESPACE,
    ROOT_ID,
    TEXT_SELECTOR,
    BLOCK_TEXT_SELECTOR,
    EXCLUDED_SELECTOR,
    FONTS,
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

  ns.mixins.history = {
withMutation(item, mutate, label) {
      this.ensureOriginalState(item);
      const before = this.captureState(item);
      mutate();
      const after = this.captureState(item);
      if (!sameState(before, after)) {
        this.pushHistory(item, before, after, label);
        this.markModified(item);
        this.renderBoxes();
        this.refreshToolbar();
      }
    },

ensureOriginalState(item) {
      if (!this.originalStates.has(item.id)) {
        this.originalStates.set(item.id, this.captureState(item));
      }
    },

captureState(item) {
      const element = item.element;
      if (item.type === "layout") {
        return {
          kind: "layout",
          style: element.getAttribute("style") || ""
        };
      }

      if (item.type === "text") {
        return {
          kind: "text",
          html: element.innerHTML,
          style: element.getAttribute("style") || ""
        };
      }

      if (item.imageMode === "background") {
        return {
          kind: "background",
          style: element.getAttribute("style") || ""
        };
      }

      return {
        kind: "img",
        src: element.getAttribute("src") || "",
        srcset: element.getAttribute("srcset") || "",
        pictureSources: this.capturePictureSourceStates?.(element) || [],
        style: element.getAttribute("style") || "",
        parentStyle: element.parentElement?.getAttribute("style") || null
      };
    },

restoreState(item, state) {
      const element = item.element;
      if (state.kind === "layout") {
        restoreAttr(element, "style", state.style);
        this.layoutAdjustments?.delete(item.id);
        return;
      }

      if (state.kind === "text") {
        element.innerHTML = state.html;
        restoreAttr(element, "style", state.style);
        this.layoutAdjustments?.delete(item.id);
        return;
      }

      if (state.kind === "background") {
        restoreAttr(element, "style", state.style);
        this.imageAdjustments?.delete(item.id);
        this.layoutAdjustments?.delete(item.id);
        return;
      }

      restoreAttr(element, "src", state.src);
      restoreAttr(element, "srcset", state.srcset);
      this.restorePictureSourceStates?.(element, state.pictureSources);
      restoreAttr(element, "style", state.style);
      if (element.parentElement && state.parentStyle !== null) {
        restoreAttr(element.parentElement, "style", state.parentStyle);
      }
      this.imageAdjustments?.delete(item.id);
      this.layoutAdjustments?.delete(item.id);
    },

pushHistory(item, before, after, label) {
      this.undoStack.push({
        id: item.id,
        type: item.type,
        imageMode: item.imageMode,
        element: item.element,
        frameElement: item.frameElement,
        layoutElement: this.layoutTargetForItem?.(item),
        before,
        after,
        label
      });
      this.redoStack = [];
      this.trimHistory();
    },

pushHistoryEntries(entries, label) {
      const normalized = (entries || []).filter((entry) => entry?.item && entry.before && entry.after);
      if (!normalized.length) {
        return;
      }
      if (normalized.length === 1) {
        const [{ item, before, after }] = normalized;
        this.pushHistory(item, before, after, label);
        return;
      }

      this.undoStack.push({
        label,
        items: normalized.map(({ item, before, after }) => ({
          id: item.id,
          type: item.type,
          imageMode: item.imageMode,
          element: item.element,
          frameElement: item.frameElement,
          layoutElement: this.layoutTargetForItem?.(item),
          before,
          after
        }))
      });
      this.redoStack = [];
      this.trimHistory();
    },

pushCreateHistory(item, record, label) {
      if (!item?.element || !record) {
        return;
      }
      this.undoStack.push({
        action: "create",
        id: item.id,
        type: item.type,
        imageMode: item.imageMode,
        element: item.element,
        frameElement: item.frameElement,
        rootElement: this.addedRootForItem?.(item) || item.element,
        record,
        label
      });
      this.redoStack = [];
      this.trimHistory();
    },

trimHistory() {
      if (this.undoStack.length > 80) {
        this.undoStack.splice(0, this.undoStack.length - 80);
      }
    },

undo() {
      const entry = this.undoStack.pop();
      if (!entry) {
        this.toast(this.t("nothingUndo"));
        return;
      }
      for (const historyItem of this.historyItemsForEntry(entry)) {
        if (this.applyCreateHistoryEntry(historyItem, false)) {
          continue;
        }
        const item = this.itemFromHistory(historyItem);
        this.restoreState(item, historyItem.before);
        this.updateModifiedFromCurrent(item);
      }
      this.redoStack.push(entry);
      this.scheduleScan(0);
      this.toast(this.t("undone"));
    },

redo() {
      const entry = this.redoStack.pop();
      if (!entry) {
        this.toast(this.t("nothingRedo"));
        return;
      }
      for (const historyItem of this.historyItemsForEntry(entry)) {
        if (this.applyCreateHistoryEntry(historyItem, true)) {
          continue;
        }
        const item = this.itemFromHistory(historyItem);
        this.restoreState(item, historyItem.after);
        this.updateModifiedFromCurrent(item);
      }
      this.undoStack.push(entry);
      this.scheduleScan(0);
      this.toast(this.t("redone"));
    },

historyItemsForEntry(entry) {
      return Array.isArray(entry?.items) ? entry.items : [entry];
    },

applyCreateHistoryEntry(entry, shouldExist) {
      if (entry?.action !== "create") {
        return false;
      }
      if (shouldExist) {
        this.restoreCreatedItem(entry);
      } else {
        this.removeCreatedItem(entry);
      }
      return true;
    },

removeCreatedItem(entry) {
      const item = this.itemFromHistory(entry);
      const root = this.addedRootForItem?.(item) || entry.rootElement || item.element;
      if (root?.isConnected) {
        entry.rootElement = root;
        root.remove();
      }
      this.addedItems?.delete(entry.id);
      this.modified.delete(entry.id);
      this.originalStates.delete(entry.id);
      this.imageAdjustments?.delete(entry.id);
      this.layoutAdjustments?.delete(entry.id);
      this.items.delete(entry.id);
      if (this.selectedId === entry.id) {
        this.selectedId = null;
      }
      this.selectedIds?.delete(entry.id);
    },

restoreCreatedItem(entry) {
      const record = entry.record || {};
      const parent = record.parentElement?.isConnected
        ? record.parentElement
        : (document.body || document.documentElement);
      const before = record.insertBeforeElement?.isConnected ? record.insertBeforeElement : null;
      const root = entry.rootElement || this.addedRootForItem?.(record) || record.element || entry.element;
      if (!root || !parent) {
        return;
      }
      if (!root.isConnected) {
        parent.insertBefore(root, before);
      }

      const element = record.element || entry.element || (entry.type === "image" ? root.querySelector?.("img") : root);
      entry.element = element;
      entry.frameElement = entry.type === "image" && root !== element ? root : element;
      record.element = element;
      record.parentElement = parent;
      this.addedItems?.set(entry.id, record);
      const item = this.itemFromHistory(entry);
      this.items.set(entry.id, item);
      this.markAddedItemModified?.(item);
    },

itemFromHistory(entry) {
      return {
        id: entry.id,
        type: entry.type,
        imageMode: entry.imageMode,
        element: entry.element,
        frameElement: entry.frameElement,
        layoutElement: entry.layoutElement
      };
    },

itemFromHistoryId(id) {
      for (const entry of [...this.undoStack, ...this.redoStack]) {
        const historyItem = this.historyItemsForEntry(entry).find((item) => item.id === id);
        if (historyItem) {
          return this.itemFromHistory(historyItem);
        }
      }
      return null;
    },

markModified(item) {
      const existing = this.modified.get(item.id) || {};
      this.modified.set(item.id, {
        type: item.type,
        imageMode: item.imageMode,
        content: true,
        layout: existing.layout || false
      });
      this.updateModifiedFromCurrent(item);
    },

updateModifiedFromCurrent(item) {
      if (this.addedItems?.has(item.id)) {
        this.markAddedItemModified?.(item);
        this.refreshToolbar();
        return;
      }
      const original = this.originalStates.get(item.id);
      if (!original) {
        return;
      }
      const current = this.captureState(item);
      if (sameState(original, current)) {
        this.modified.delete(item.id);
      } else {
        const existing = this.modified.get(item.id) || {};
        const layout = this.isLayoutCurrentlyAdjusted?.(item) || false;
        this.modified.set(item.id, {
          type: item.type,
          imageMode: item.imageMode,
          content: existing.content !== undefined ? existing.content : true,
          layout
        });
      }
      this.refreshToolbar();
    },

modifiedStats() {
      let text = 0;
      let images = 0;
      let layout = 0;
      for (const item of this.modified.values()) {
        if (item.layout) {
          layout += 1;
        }
        if (item.content === false) {
          continue;
        }
        if (item.type === "text") {
          text += 1;
        } else if (item.type === "image") {
          images += 1;
        }
      }
      return { text, images, layout, total: text + images + layout };
    }
  };
})();
