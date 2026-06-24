(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  ns.mixins = ns.mixins || {};
  const { ROOT_ID, EXCLUDED_SELECTOR } = ns.constants;
  const {
    isRendered,
    isVisibleRect,
    intersectsViewport,
    round,
    clamp,
    sameState,
    restoreAttr
  } = ns.utils;

  const LAYOUT_CUSTOM_PROPS = {
    x: "--hsm-layout-x",
    y: "--hsm-layout-y",
    scale: "--hsm-layout-scale",
    width: "--hsm-layout-width",
    height: "--hsm-layout-height",
    baseTransform: "--hsm-layout-base-transform",
    baseWidth: "--hsm-layout-base-width",
    baseHeight: "--hsm-layout-base-height"
  };
  const IMAGE_FRAME_SELECTOR = "[data-hsm-image-frame]";
  const IMAGE_FRAME_CUSTOM_PROPS = {
    width: "--hsm-frame-width",
    height: "--hsm-frame-height"
  };
  const EMPTY_LAYOUT_STYLE_VALUE = "__hsm_empty__";

  const LAYOUT_TAG_SELECTOR = [
    "[data-layout-editable]",
    "[data-card]",
    "[data-panel]",
    "[data-shape]",
    "figure",
    "article",
    "aside",
    "section",
    "div"
  ].join(",");

  function readLayoutNumber(element, name, fallback = 0) {
    const value = Number.parseFloat(element?.style?.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function normalizedTransform(value) {
    const text = String(value || "").trim();
    return text && text !== "none" ? text : "";
  }

  function encodeLayoutStyleValue(value) {
    return value || EMPTY_LAYOUT_STYLE_VALUE;
  }

  function decodeLayoutStyleValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    if (text === EMPTY_LAYOUT_STYLE_VALUE) {
      return "";
    }
    return text;
  }

  function finiteLayoutNumber(value) {
    return Number.isFinite(value) ? value : null;
  }

  function pixelStyleNumber(element, property, fallback) {
    const value = Number.parseFloat(element?.style?.[property]);
    return Number.isFinite(value) ? value : fallback;
  }

  function hasVisiblePaint(style) {
    const hasBackground = style.backgroundImage !== "none" ||
      !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*0\s*)?\)$/i.test(style.backgroundColor || "") &&
      style.backgroundColor !== "transparent";
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) => {
      const width = Number.parseFloat(style[`border${side}Width`]);
      return Number.isFinite(width) && width > 0 && style[`border${side}Style`] !== "none";
    });
    const hasShadow = style.boxShadow && style.boxShadow !== "none";
    return hasBackground || hasBorder || hasShadow;
  }

  ns.mixins.layout = {
isLayoutMode() {
      return this.editMode === "layout";
    },

toggleLayoutMode() {
      this.setEditorMode(this.isLayoutMode() ? "content" : "layout");
    },

normalizeLayoutToolMode(mode) {
      return mode === "size" ? "size" : "moveScale";
    },

setLayoutToolMode(mode) {
      const nextMode = this.normalizeLayoutToolMode(mode);
      if (this.layoutToolMode === nextMode) {
        this.refreshLayoutToolButtons?.();
        return;
      }
      this.layoutToolMode = nextMode;
      this.refreshLayoutToolButtons?.();
      this.renderBoxes?.();
    },

setEditorMode(mode) {
      const nextMode = mode === "layout" ? "layout" : "content";
      if (this.editMode === nextMode) {
        return;
      }

      this.commitActiveText?.();
      this.editMode = nextMode;
      this.closeOpenMenus?.();
      if (nextMode === "layout" && this.selectedId) {
        this.selectedIds?.add(this.selectedId);
      } else if (nextMode === "content") {
        const selectedId = this.selectedId;
        this.selectedIds?.clear();
        if (selectedId) {
          this.selectedIds?.add(selectedId);
        }
      }
      this.scheduleScan(0);
      this.refreshToolbar?.();
      this.renderBoxes?.();
      this.toast?.(this.t(nextMode === "layout" ? "layoutModeOn" : "layoutModeOff"));
    },

findLayoutItems(textItems = [], imageItems = []) {
      if (!this.isLayoutMode?.()) {
        return [];
      }

      const existing = new Set();
      for (const item of [...textItems, ...imageItems]) {
        if (item.element) {
          existing.add(item.element);
        }
      }

      const items = [];
      for (const element of Array.from(document.body?.querySelectorAll(LAYOUT_TAG_SELECTOR) || [])) {
        if (existing.has(element) || !this.isLayoutCandidate(element)) {
          continue;
        }
        items.push({
          id: this.idFor(element, "layout"),
          type: "layout",
          element,
          frameElement: element,
          positioned: this.isPositionedImage?.(element, element) || false,
          layoutRisk: this.layoutRiskForElement(element)
        });
      }
      return this.filterNestedLayoutItems(items);
    },

isLayoutCandidate(element) {
      if (!this.isPageElement?.(element) || element.matches(EXCLUDED_SELECTOR)) {
        return false;
      }
      if (element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) {
        return false;
      }
      if (element.matches("html,body,script,style,nav,[role='navigation']")) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const viewportArea = Math.max(1, (window.innerWidth || 0) * (window.innerHeight || 0));
      if (!isVisibleRect(rect, 28, 28) || !intersectsViewport(rect) || rect.width * rect.height > viewportArea * 0.7) {
        return false;
      }

      const style = getComputedStyle(element);
      if (!isRendered(style)) {
        return false;
      }

      return element.hasAttribute("data-layout-editable") ||
        element.hasAttribute("data-card") ||
        element.hasAttribute("data-panel") ||
        element.hasAttribute("data-shape") ||
        hasVisiblePaint(style);
    },

layoutRiskForElement(element) {
      const style = getComputedStyle(element);
      const parentDisplay = element.parentElement ? getComputedStyle(element.parentElement).display : "";
      if (style.position === "static" && /^(flex|inline-flex|grid|inline-grid)$/.test(parentDisplay)) {
        return "cautious";
      }
      if (style.position === "static" && !element.hasAttribute("data-layout-editable")) {
        return "cautious";
      }
      return "safe";
    },

filterNestedLayoutItems(items) {
      const byElement = new Set(items.map((item) => item.element));
      return items.filter((item) => {
        let parent = item.element.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          if (byElement.has(parent) && parent.getBoundingClientRect().width === item.element.getBoundingClientRect().width) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      });
    },

layoutTargetForItem(item) {
      if (!item) {
        return null;
      }
      if (item.layoutElement?.isConnected) {
        return item.layoutElement;
      }
      if (item.type === "image" && item.frameElement && item.frameElement !== document.body && item.frameElement !== document.documentElement) {
        return item.frameElement;
      }
      return item.frameElement || item.element;
    },

refreshModeButtons() {
      const active = this.isLayoutMode();
      const contentButton = this.shadow?.querySelector("[data-action='content-mode']");
      const layoutButton = this.shadow?.querySelector("[data-action='layout-mode']");
      contentButton?.classList.toggle("is-active", !active);
      layoutButton?.classList.toggle("is-active", active);
      contentButton?.setAttribute("aria-pressed", active ? "false" : "true");
      layoutButton?.setAttribute("aria-pressed", active ? "true" : "false");
    },

refreshLayoutToolButtons() {
      const activeMode = this.normalizeLayoutToolMode?.(this.layoutToolMode) || "moveScale";
      const modeMap = {
        "layout-tool-move-scale": activeMode === "moveScale",
        "layout-tool-size": activeMode === "size"
      };
      for (const [action, active] of Object.entries(modeMap)) {
        const button = this.shadow?.querySelector(`[data-action='${action}']`);
        if (!button) {
          continue;
        }
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    },

selectedLayoutItemsFor(triggerItem = null) {
      const selected = this.selectedItems?.() || [];
      const group = selected
        .filter((item) => this.layoutTargetForItem(item))
        .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
      if (triggerItem && group.some((item) => item.id === triggerItem.id)) {
        return group;
      }
      return triggerItem && this.layoutTargetForItem(triggerItem) ? [triggerItem] : group;
    },

prepareLayoutInteractionSelection(item) {
      if (!item) {
        return [];
      }
      if (this.isItemSelected?.(item.id) && (this.selectedIds?.size || 0) > 1) {
        this.selectItem(item.id, { preserveGroup: true });
      } else {
        this.selectItem(item.id);
      }
      return this.selectedLayoutItemsFor(item);
    },

layoutInteractionEntries(items) {
      return items.map((item) => {
        const adjustment = this.layoutAdjustmentFor(item);
        const target = adjustment?.target;
        if (!target) {
          return null;
        }
        return {
          item,
          adjustment,
          target,
          before: null,
          startRect: target.getBoundingClientRect(),
          originX: adjustment.x || 0,
          originY: adjustment.y || 0,
          originScale: adjustment.scale || 1
        };
      }).filter(Boolean);
    },

captureLayoutBatchBefore(entries) {
      for (const entry of entries) {
        this.ensureOriginalState(entry.item);
        entry.before = this.captureState(entry.item);
      }
    },

restoreLayoutBatch(entries) {
      for (const entry of entries) {
        if (entry.before) {
          this.restoreState(entry.item, entry.before);
          this.layoutAdjustments.delete(entry.item.id);
        }
      }
      this.renderBoxes?.();
      this.refreshToolbar?.();
    },

finishLayoutBatch(entries, label) {
      const changes = entries
        .filter((entry) => entry.before)
        .map((entry) => ({
          item: entry.item,
          before: entry.before,
          after: this.captureState(entry.item)
        }))
        .filter((entry) => !sameState(entry.before, entry.after));
      if (!changes.length) {
        return;
      }

      this.pushHistoryEntries?.(changes, label);
      for (const { item } of changes) {
        this.markLayoutModified(item);
      }
      this.renderBoxes?.();
      this.refreshToolbar?.();
    },

layoutAdjustmentFor(item) {
      const target = this.layoutTargetForItem(item);
      if (!item || !target) {
        return null;
      }

      const existing = this.layoutAdjustments.get(item.id);
      if (existing?.target === target) {
        return existing;
      }

      const baseTransform = normalizedTransform(
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseTransform) ||
        target.style.transform
      );
      const storedBaseWidth = decodeLayoutStyleValue(target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseWidth));
      const storedBaseHeight = decodeLayoutStyleValue(target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseHeight));
      const width = Number.parseFloat(target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.width));
      const height = Number.parseFloat(target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.height));
      const adjustment = {
        target,
        x: readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.x, 0),
        y: readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.y, 0),
        scale: readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.scale, 1),
        width: finiteLayoutNumber(width),
        height: finiteLayoutNumber(height),
        baseTransform,
        baseTransformOrigin: target.style.transformOrigin || "",
        baseWidthStyle: storedBaseWidth ?? (target.style.width || ""),
        baseHeightStyle: storedBaseHeight ?? (target.style.height || ""),
        hasBaseWidthStyle: storedBaseWidth !== null,
        hasBaseHeightStyle: storedBaseHeight !== null,
        risk: item.layoutRisk || "safe"
      };
      this.layoutAdjustments.set(item.id, adjustment);
      return adjustment;
    },

composeLayoutTransform(adjustment) {
      const base = normalizedTransform(adjustment?.baseTransform);
      const x = Math.round(adjustment?.x || 0);
      const y = Math.round(adjustment?.y || 0);
      const scale = round(clamp(adjustment?.scale || 1, 0.2, 5), 3);
      const movement = x || y ? `translate(${x}px, ${y}px)` : "";
      const resize = scale !== 1 ? `scale(${scale})` : "";
      return [base, movement, resize].filter(Boolean).join(" ");
    },

applyLayoutAdjustment(item, adjustment) {
      const target = adjustment?.target || this.layoutTargetForItem(item);
      if (!target || !adjustment) {
        return;
      }

      adjustment.x = round(clamp(adjustment.x || 0, -4000, 4000));
      adjustment.y = round(clamp(adjustment.y || 0, -4000, 4000));
      adjustment.scale = round(clamp(adjustment.scale || 1, 0.2, 5), 3);
      const hasLayoutAdjustment = adjustment.x || adjustment.y || adjustment.scale !== 1;
      if (hasLayoutAdjustment) {
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.x, String(Math.round(adjustment.x)));
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.y, String(Math.round(adjustment.y)));
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.scale, String(adjustment.scale));
      } else {
        target.style.removeProperty(LAYOUT_CUSTOM_PROPS.x);
        target.style.removeProperty(LAYOUT_CUSTOM_PROPS.y);
        target.style.removeProperty(LAYOUT_CUSTOM_PROPS.scale);
      }
      if (adjustment.baseTransform) {
        if (hasLayoutAdjustment) {
          target.style.setProperty(LAYOUT_CUSTOM_PROPS.baseTransform, adjustment.baseTransform);
        } else {
          target.style.removeProperty(LAYOUT_CUSTOM_PROPS.baseTransform);
        }
      } else {
        target.style.removeProperty(LAYOUT_CUSTOM_PROPS.baseTransform);
      }
      if (adjustment.scale !== 1) {
        target.style.transformOrigin = target.style.transformOrigin || "center center";
      } else if (adjustment.baseTransformOrigin) {
        target.style.transformOrigin = adjustment.baseTransformOrigin;
      } else {
        target.style.removeProperty("transform-origin");
      }
      target.style.transform = this.composeLayoutTransform(adjustment);
      if (!target.style.transform) {
        target.style.removeProperty("transform");
      }
    },

setLayoutDragClass(entries, className, enabled) {
      for (const entry of entries || []) {
        const box = this.shadow?.querySelector(`[data-item-id='${CSS.escape(entry.item.id)}']`);
        box?.classList.toggle(className, enabled);
      }
    },

startLayoutDrag(event, item) {
      if (!item || event.button !== 0) {
        return;
      }

      const items = this.prepareLayoutInteractionSelection(item);
      const entries = this.layoutInteractionEntries(items);
      if (!entries.length) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.closeOpenMenus?.();

      this.layoutDrag = {
        item,
        entries,
        started: false,
        startX: event.clientX,
        startY: event.clientY
      };

      this.setLayoutDragClass(entries, "is-layout-dragging", true);

      const onMove = (moveEvent) => this.handleLayoutDragMove(moveEvent);
      const onUp = () => endDrag(false);
      const onKey = (keyEvent) => {
        if (keyEvent.key !== "Escape") {
          return;
        }
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        endDrag(true);
      };
      const endDrag = (cancelled) => {
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("keydown", onKey, true);
        this.setLayoutDragClass(entries, "is-layout-dragging", false);

        const drag = this.layoutDrag;
        this.layoutDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.started) {
          this.restoreLayoutBatch(drag.entries);
          return;
        }

        if (drag.started) {
          this.finishLayoutBatch(drag.entries, drag.entries.length > 1 ? "Move elements" : "Move element");
        }
      };

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("keydown", onKey, true);
    },

startLayoutScale(event, item, handle) {
      if (!item || event.button !== 0) {
        return;
      }

      const items = this.prepareLayoutInteractionSelection(item);
      const entries = this.layoutInteractionEntries(items);
      const primary = entries.find((entry) => entry.item.id === item.id) || entries[0];
      if (!primary) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.closeOpenMenus?.();

      const rect = primary.target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startDistance = Math.max(12, Math.hypot(event.clientX - centerX, event.clientY - centerY));
      this.layoutScaleDrag = {
        item,
        entries,
        handle,
        started: false,
        centerX,
        centerY,
        startDistance
      };

      this.setLayoutDragClass(entries, "is-layout-scaling", true);

      const onMove = (moveEvent) => this.handleLayoutScaleMove(moveEvent);
      const onUp = () => endScale(false);
      const onKey = (keyEvent) => {
        if (keyEvent.key !== "Escape") {
          return;
        }
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        endScale(true);
      };
      const endScale = (cancelled) => {
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("keydown", onKey, true);
        this.setLayoutDragClass(entries, "is-layout-scaling", false);

        const drag = this.layoutScaleDrag;
        this.layoutScaleDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.started) {
          this.restoreLayoutBatch(drag.entries);
          return;
        }

        if (drag.started) {
          this.finishLayoutBatch(drag.entries, drag.entries.length > 1 ? "Scale elements" : "Scale element");
        }
      };

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("keydown", onKey, true);
    },

handleLayoutScaleMove(event) {
      const drag = this.layoutScaleDrag;
      if (!drag) {
        return;
      }

      const distance = Math.max(4, Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY));
      const ratio = distance / drag.startDistance;
      if (!drag.started && Math.abs(distance - drag.startDistance) < 3) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!drag.started) {
        this.captureLayoutBatchBefore(drag.entries);
        drag.started = true;
      }

      for (const entry of drag.entries) {
        entry.adjustment.scale = clamp(entry.originScale * ratio, 0.2, 5);
        this.applyLayoutAdjustment(entry.item, entry.adjustment);
      }
      this.renderBoxes?.();
    },

startLayoutResize(event, item, handle, options = {}) {
      if (!item || event.button !== 0) {
        return;
      }

      const axes = this.layoutResizeAxes(handle);
      if (!axes.width && !axes.height) {
        return;
      }

      const items = this.prepareLayoutInteractionSelection(item);
      const entries = this.layoutInteractionEntries(items).map((entry) => {
        const rect = entry.target.getBoundingClientRect();
        const style = getComputedStyle(entry.target);
        return {
          ...entry,
          originWidth: Number.parseFloat(style.width) || rect.width,
          originHeight: Number.parseFloat(style.height) || rect.height,
          originRatio: rect.height ? rect.width / rect.height : 1,
          scale: clamp(entry.adjustment.scale || 1, 0.2, 5)
        };
      });
      if (!entries.length) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.closeOpenMenus?.();

      this.layoutResizeDrag = {
        item,
        entries,
        handle,
        axes,
        preserveAspectRatio: Boolean(options.preserveAspectRatio),
        started: false,
        startX: event.clientX,
        startY: event.clientY
      };

      this.setLayoutDragClass(entries, "is-layout-resizing", true);

      const onMove = (moveEvent) => this.handleLayoutResizeMove(moveEvent);
      const onUp = () => endResize(false);
      const onKey = (keyEvent) => {
        if (keyEvent.key !== "Escape") {
          return;
        }
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        endResize(true);
      };
      const endResize = (cancelled) => {
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("keydown", onKey, true);
        this.setLayoutDragClass(entries, "is-layout-resizing", false);

        const drag = this.layoutResizeDrag;
        this.layoutResizeDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.started) {
          this.restoreLayoutBatch(drag.entries);
          return;
        }

        if (drag.started) {
          this.finishLayoutBatch(drag.entries, drag.entries.length > 1 ? "Resize elements" : "Resize element");
        }
      };

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("keydown", onKey, true);
    },

layoutResizeAxes(handle) {
      const name = String(handle || "");
      const x = name.includes("e") ? 1 : (name.includes("w") ? -1 : 0);
      const y = name.includes("s") ? 1 : (name.includes("n") ? -1 : 0);
      return {
        x,
        y,
        width: x !== 0,
        height: y !== 0
      };
    },

ensureLayoutSizeBase(adjustment, axes) {
      const target = adjustment?.target;
      if (!target?.style) {
        return;
      }
      if (axes.width && !adjustment.hasBaseWidthStyle) {
        adjustment.baseWidthStyle = target.style.width || "";
        adjustment.hasBaseWidthStyle = true;
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.baseWidth, encodeLayoutStyleValue(adjustment.baseWidthStyle));
      }
      if (axes.height && !adjustment.hasBaseHeightStyle) {
        adjustment.baseHeightStyle = target.style.height || "";
        adjustment.hasBaseHeightStyle = true;
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.baseHeight, encodeLayoutStyleValue(adjustment.baseHeightStyle));
      }
    },

applyLayoutSizeAdjustment(item, adjustment) {
      const target = adjustment?.target || this.layoutTargetForItem(item);
      if (!target || !adjustment) {
        return;
      }

      if (Number.isFinite(adjustment.width)) {
        adjustment.width = round(clamp(adjustment.width, 8, 8000));
        target.style.width = `${adjustment.width}px`;
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.width, String(adjustment.width));
      }
      if (Number.isFinite(adjustment.height)) {
        adjustment.height = round(clamp(adjustment.height, 8, 8000));
        target.style.height = `${adjustment.height}px`;
        target.style.setProperty(LAYOUT_CUSTOM_PROPS.height, String(adjustment.height));
      }
      this.syncImageFrameLayoutSize(target, adjustment);
    },

syncImageFrameLayoutSize(target, adjustment = {}) {
      if (!target?.matches?.(IMAGE_FRAME_SELECTOR)) {
        return;
      }

      const image = target.querySelector?.("img");
      const writeDimension = (dimension, value) => {
        if (!Number.isFinite(value)) {
          return;
        }
        const rounded = round(clamp(value, 8, 8000));
        const px = `${rounded}px`;
        const customProp = IMAGE_FRAME_CUSTOM_PROPS[dimension];
        target.style.setProperty(dimension, px, "important");
        target.style.setProperty(`min-${dimension}`, px, "important");
        target.style.setProperty(`max-${dimension}`, px, "important");
        target.style.setProperty(customProp, String(rounded));
        image?.style?.setProperty(customProp, String(rounded));
      };

      writeDimension("width", adjustment.width);
      writeDimension("height", adjustment.height);
    },

handleLayoutResizeMove(event) {
      const drag = this.layoutResizeDrag;
      if (!drag) {
        return;
      }

      const rawDeltaX = event.clientX - drag.startX;
      const rawDeltaY = event.clientY - drag.startY;
      const activeDeltaX = drag.axes.width ? rawDeltaX : 0;
      const activeDeltaY = drag.axes.height ? rawDeltaY : 0;
      if (!drag.started && Math.hypot(activeDeltaX, activeDeltaY) < 3) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!drag.started) {
        this.captureLayoutBatchBefore(drag.entries);
        for (const entry of drag.entries) {
          this.ensureLayoutSizeBase(entry.adjustment, drag.axes);
        }
        drag.started = true;
      }

      for (const entry of drag.entries) {
        const deltaX = rawDeltaX / entry.scale;
        const deltaY = rawDeltaY / entry.scale;
        let nextWidth = entry.originWidth;
        let nextHeight = entry.originHeight;
        if (drag.axes.width) {
          const rawWidth = drag.axes.x > 0 ? entry.originWidth + deltaX : entry.originWidth - deltaX;
          nextWidth = clamp(rawWidth, 8, 8000);
        }
        if (drag.axes.height) {
          const rawHeight = drag.axes.y > 0 ? entry.originHeight + deltaY : entry.originHeight - deltaY;
          nextHeight = clamp(rawHeight, 8, 8000);
        }

        if (drag.preserveAspectRatio && drag.axes.width && drag.axes.height) {
          const ratio = Number.isFinite(entry.originRatio) && entry.originRatio > 0 ? entry.originRatio : 1;
          const widthChange = Math.abs((nextWidth - entry.originWidth) / Math.max(1, entry.originWidth));
          const heightChange = Math.abs((nextHeight - entry.originHeight) / Math.max(1, entry.originHeight));
          if (widthChange >= heightChange) {
            nextHeight = clamp(nextWidth / ratio, 8, 8000);
          } else {
            nextWidth = clamp(nextHeight * ratio, 8, 8000);
          }
        }

        if (drag.axes.width) {
          entry.adjustment.width = nextWidth;
          if (drag.axes.x < 0) {
            entry.adjustment.x = entry.originX + (entry.originWidth - nextWidth);
          }
        }
        if (drag.axes.height) {
          entry.adjustment.height = nextHeight;
          if (drag.axes.y < 0) {
            entry.adjustment.y = entry.originY + (entry.originHeight - nextHeight);
          }
        }

        this.applyLayoutSizeAdjustment(entry.item, entry.adjustment);
        this.applyLayoutAdjustment(entry.item, entry.adjustment);
      }
      this.renderBoxes?.();
    },

handleLayoutDragMove(event) {
      const drag = this.layoutDrag;
      if (!drag) {
        return;
      }

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.started && Math.hypot(deltaX, deltaY) < 3) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!drag.started) {
        this.captureLayoutBatchBefore(drag.entries);
        drag.started = true;
      }

      const next = this.clampLayoutGroupDelta(drag.entries, deltaX, deltaY);
      for (const entry of drag.entries) {
        entry.adjustment.x = entry.originX + next.x;
        entry.adjustment.y = entry.originY + next.y;
        this.applyLayoutAdjustment(entry.item, entry.adjustment);
      }
      this.renderBoxes?.();
    },

clampLayoutGroupDelta(entries, deltaX, deltaY) {
      let minDeltaX = -Infinity;
      let maxDeltaX = Infinity;
      let minDeltaY = -Infinity;
      let maxDeltaY = Infinity;
      for (const entry of entries) {
        const bounds = this.layoutDeltaBounds(entry.startRect);
        minDeltaX = Math.max(minDeltaX, bounds.minDeltaX);
        maxDeltaX = Math.min(maxDeltaX, bounds.maxDeltaX);
        minDeltaY = Math.max(minDeltaY, bounds.minDeltaY);
        maxDeltaY = Math.min(maxDeltaY, bounds.maxDeltaY);
      }
      return {
        x: clamp(deltaX, minDeltaX, maxDeltaX),
        y: clamp(deltaY, minDeltaY, maxDeltaY)
      };
    },

layoutDeltaBounds(rect) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const minVisibleX = Math.min(32, Math.max(8, rect.width * 0.18));
      const minVisibleY = Math.min(32, Math.max(8, rect.height * 0.18));
      return {
        minDeltaX: minVisibleX - rect.right,
        maxDeltaX: viewportWidth - minVisibleX - rect.left,
        minDeltaY: minVisibleY - rect.bottom,
        maxDeltaY: viewportHeight - minVisibleY - rect.top
      };
    },

handleLayoutKeydown(event) {
      if (!this.isLayoutMode?.() || this.editingTextId || event.altKey || event.metaKey || event.ctrlKey) {
        return false;
      }

      const deltas = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
      };
      const delta = deltas[event.key];
      if (!delta) {
        return false;
      }

      const item = this.selectedItem();
      if (!item) {
        return false;
      }

      const step = event.shiftKey ? 10 : 1;
      this.moveSelectedLayoutBy(delta[0] * step, delta[1] * step);
      return true;
    },

moveSelectedLayoutBy(deltaX, deltaY) {
      const items = this.selectedLayoutItemsFor();
      if (!items.length) {
        return;
      }

      this.withLayoutMutation(items, () => {
        for (const item of items) {
          const adjustment = this.layoutAdjustmentFor(item);
          if (!adjustment) {
            continue;
          }
          adjustment.x = (adjustment.x || 0) + deltaX;
          adjustment.y = (adjustment.y || 0) + deltaY;
          this.applyLayoutAdjustment(item, adjustment);
        }
      }, items.length > 1 ? "Move elements" : "Move element");
    },

withLayoutMutation(items, mutate, label) {
      const group = (Array.isArray(items) ? items : [items]).filter(Boolean);
      if (!group.length) {
        return;
      }

      for (const item of group) {
        this.ensureOriginalState(item);
      }
      const before = group.map((item) => ({ item, state: this.captureState(item) }));
      mutate();
      const changes = before
        .map(({ item, state }) => ({
          item,
          before: state,
          after: this.captureState(item)
        }))
        .filter((entry) => !sameState(entry.before, entry.after));
      if (changes.length) {
        this.pushHistoryEntries?.(changes, label);
        for (const { item } of changes) {
          this.markLayoutModified(item);
        }
        this.renderBoxes?.();
        this.refreshToolbar?.();
      }
    },

resetSelectedLayout() {
      const items = this.selectedLayoutItemsFor();
      if (!items.length) {
        return;
      }

      this.withLayoutMutation(items, () => {
        for (const item of items) {
          this.clearLayoutAdjustment(item);
        }
      }, "Reset layout");
      for (const item of items) {
        this.clearLayoutModifiedIfClean(item);
      }
      this.toast?.(this.t("layoutReset"));
    },

alignSelectedLayout(kind) {
      const items = this.selectedLayoutItemsFor();
      const primary = this.selectedItem();
      if (!primary || items.length < 2 || !items.some((item) => item.id === primary.id)) {
        return;
      }

      const anchorRect = this.itemBoxElement(primary)?.getBoundingClientRect?.();
      if (!anchorRect) {
        return;
      }

      this.withLayoutMutation(items, () => {
        for (const item of items) {
          if (item.id === primary.id) {
            continue;
          }
          const rect = this.itemBoxElement(item)?.getBoundingClientRect?.();
          const adjustment = this.layoutAdjustmentFor(item);
          if (!rect || !adjustment) {
            continue;
          }
          const delta = this.layoutAlignmentDelta(kind, anchorRect, rect);
          adjustment.x = (adjustment.x || 0) + delta.x;
          adjustment.y = (adjustment.y || 0) + delta.y;
          this.applyLayoutAdjustment(item, adjustment);
        }
      }, "Align elements");
    },

layoutAlignmentDelta(kind, anchorRect, rect) {
      switch (kind) {
        case "left":
          return { x: anchorRect.left - rect.left, y: 0 };
        case "h-center":
          return { x: anchorRect.left + anchorRect.width / 2 - (rect.left + rect.width / 2), y: 0 };
        case "right":
          return { x: anchorRect.right - rect.right, y: 0 };
        case "top":
          return { x: 0, y: anchorRect.top - rect.top };
        case "v-center":
          return { x: 0, y: anchorRect.top + anchorRect.height / 2 - (rect.top + rect.height / 2) };
        case "bottom":
          return { x: 0, y: anchorRect.bottom - rect.bottom };
        default:
          return { x: 0, y: 0 };
      }
    },

matchSelectedLayoutSize(mode) {
      const items = this.selectedLayoutItemsFor();
      const primary = this.selectedItem();
      if (!primary || items.length < 2 || !items.some((item) => item.id === primary.id)) {
        return;
      }

      const anchorRect = this.itemBoxElement(primary)?.getBoundingClientRect?.();
      if (!anchorRect) {
        return;
      }
      const axes = {
        width: mode === "width" || mode === "both",
        height: mode === "height" || mode === "both"
      };

      this.withLayoutMutation(items, () => {
        for (const item of items) {
          if (item.id === primary.id) {
            continue;
          }
          const adjustment = this.layoutAdjustmentFor(item);
          if (!adjustment) {
            continue;
          }
          const scale = clamp(adjustment.scale || 1, 0.2, 5);
          this.ensureLayoutSizeBase(adjustment, axes);
          if (axes.width) {
            adjustment.width = anchorRect.width / scale;
          }
          if (axes.height) {
            adjustment.height = anchorRect.height / scale;
          }
          this.applyLayoutSizeAdjustment(item, adjustment);
          this.applyLayoutAdjustment(item, adjustment);
        }
      }, "Match element size");
    },

clearLayoutAdjustment(item) {
      const adjustment = this.layoutAdjustmentFor(item);
      const target = adjustment?.target;
      if (!target) {
        return;
      }
      restoreAttr(target, "style", this.styleWithoutLayoutAdjustment(target, adjustment));
      if (target.matches?.(IMAGE_FRAME_SELECTOR)) {
        const rect = target.getBoundingClientRect();
        this.syncImageFrameLayoutSize(target, {
          width: pixelStyleNumber(target, "width", rect.width),
          height: pixelStyleNumber(target, "height", rect.height)
        });
      }
      this.layoutAdjustments.delete(item.id);
    },

styleWithoutLayoutAdjustment(target, adjustment) {
      const clone = target.cloneNode(false);
      clone.setAttribute("style", target.getAttribute("style") || "");
      const storedBaseWidth = decodeLayoutStyleValue(clone.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseWidth));
      const storedBaseHeight = decodeLayoutStyleValue(clone.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseHeight));
      const baseWidth = adjustment?.hasBaseWidthStyle ? adjustment.baseWidthStyle : storedBaseWidth;
      const baseHeight = adjustment?.hasBaseHeightStyle ? adjustment.baseHeightStyle : storedBaseHeight;
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.x);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.y);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.scale);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.width);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.height);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.baseTransform);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.baseWidth);
      clone.style.removeProperty(LAYOUT_CUSTOM_PROPS.baseHeight);
      if (baseWidth !== null && baseWidth !== undefined) {
        if (baseWidth) {
          clone.style.width = baseWidth;
        } else {
          clone.style.removeProperty("width");
        }
      }
      if (baseHeight !== null && baseHeight !== undefined) {
        if (baseHeight) {
          clone.style.height = baseHeight;
        } else {
          clone.style.removeProperty("height");
        }
      }
      const base = normalizedTransform(adjustment?.baseTransform);
      if (base) {
        clone.style.transform = base;
      } else {
        clone.style.removeProperty("transform");
      }
      if (adjustment?.baseTransformOrigin) {
        clone.style.transformOrigin = adjustment.baseTransformOrigin;
      } else {
        clone.style.removeProperty("transform-origin");
      }
      return clone.getAttribute("style") || "";
    },

markLayoutModified(item) {
      const existing = this.modified.get(item.id) || {};
      this.modified.set(item.id, {
        type: item.type,
        imageMode: item.imageMode,
        content: existing.content || false,
        layout: true
      });
    },

clearLayoutModifiedIfClean(item) {
      const existing = this.modified.get(item.id);
      if (!existing?.layout) {
        return;
      }
      const original = this.originalStates.get(item.id);
      const current = this.captureState(item);
      if (original && sameState(original, current)) {
        this.modified.delete(item.id);
        return;
      }
      this.modified.set(item.id, {
        ...existing,
        layout: false
      });
    },

layoutOffsetLabel(item) {
      const adjustment = this.layoutAdjustmentFor(item);
      const x = Math.round(adjustment?.x || 0);
      const y = Math.round(adjustment?.y || 0);
      const scale = round(adjustment?.scale || 1, 2);
      const width = Number.isFinite(adjustment?.width) ? Math.round(adjustment.width) : null;
      const height = Number.isFinite(adjustment?.height) ? Math.round(adjustment.height) : null;
      if (!x && !y && scale === 1 && width === null && height === null) {
        return "";
      }
      const position = (x || y) ? ` · x ${x >= 0 ? "+" : ""}${x} / y ${y >= 0 ? "+" : ""}${y}` : "";
      const resize = scale !== 1 ? ` · ${Math.round(scale * 100)}%` : "";
      const sizeParts = [];
      if (width !== null) {
        sizeParts.push(`w ${width}`);
      }
      if (height !== null) {
        sizeParts.push(`h ${height}`);
      }
      const size = sizeParts.length ? ` · ${sizeParts.join(" / ")}` : "";
      return `${position}${resize}${size}`;
    },

isLayoutCurrentlyAdjusted(item) {
      const target = this.layoutTargetForItem(item);
      if (!target?.style) {
        return false;
      }
      const x = readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.x, 0);
      const y = readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.y, 0);
      const scale = readLayoutNumber(target, LAYOUT_CUSTOM_PROPS.scale, 1);
      return Boolean(
        x ||
        y ||
        scale !== 1 ||
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseTransform) ||
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.width) ||
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.height) ||
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseWidth) ||
        target.style.getPropertyValue(LAYOUT_CUSTOM_PROPS.baseHeight)
      );
    },

layoutElementsForExport() {
      const elements = [];
      const seen = new Set();
      for (const [id, state] of this.modified.entries()) {
        if (!state.layout) {
          continue;
        }
        const item = this.items.get(id) || this.itemFromHistoryId(id);
        const element = this.layoutTargetForItem(item);
        if (!element || seen.has(element) || element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) {
          continue;
        }
        seen.add(element);
        elements.push(element);
      }
      return elements;
    }
  };
})();
