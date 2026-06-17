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

startLayoutDrag(event, item) {
      if (!item || event.button !== 0) {
        return;
      }

      const adjustment = this.layoutAdjustmentFor(item);
      const target = adjustment?.target;
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.selectedId = item.id;
      this.refreshToolbar?.();
      this.closeOpenMenus?.();

      const startRect = target.getBoundingClientRect();
      this.layoutDrag = {
        item,
        adjustment,
        before: null,
        started: false,
        startX: event.clientX,
        startY: event.clientY,
        originX: adjustment.x || 0,
        originY: adjustment.y || 0,
        startRect
      };

      const box = this.shadow?.querySelector(`[data-item-id='${CSS.escape(item.id)}']`);
      box?.classList.add("is-layout-dragging");

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
        box?.classList.remove("is-layout-dragging");

        const drag = this.layoutDrag;
        this.layoutDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.before) {
          this.restoreState(drag.item, drag.before);
          this.layoutAdjustments.delete(drag.item.id);
          this.renderBoxes?.();
          this.refreshToolbar?.();
          return;
        }

        const after = drag.before ? this.captureState(drag.item) : null;
        if (drag.before && after && !sameState(drag.before, after)) {
          this.pushHistory(drag.item, drag.before, after, "Move element");
          this.markLayoutModified(drag.item);
          this.renderBoxes?.();
          this.refreshToolbar?.();
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

      const adjustment = this.layoutAdjustmentFor(item);
      const target = adjustment?.target;
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.selectedId = item.id;
      this.refreshToolbar?.();
      this.closeOpenMenus?.();

      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startDistance = Math.max(12, Math.hypot(event.clientX - centerX, event.clientY - centerY));
      this.layoutScaleDrag = {
        item,
        adjustment,
        handle,
        before: null,
        started: false,
        centerX,
        centerY,
        startDistance,
        originScale: adjustment.scale || 1
      };

      const box = this.shadow?.querySelector(`[data-item-id='${CSS.escape(item.id)}']`);
      box?.classList.add("is-layout-scaling");

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
        box?.classList.remove("is-layout-scaling");

        const drag = this.layoutScaleDrag;
        this.layoutScaleDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.before) {
          this.restoreState(drag.item, drag.before);
          this.layoutAdjustments.delete(drag.item.id);
          this.renderBoxes?.();
          this.refreshToolbar?.();
          return;
        }

        const after = drag.before ? this.captureState(drag.item) : null;
        if (drag.before && after && !sameState(drag.before, after)) {
          this.pushHistory(drag.item, drag.before, after, "Scale element");
          this.markLayoutModified(drag.item);
          this.renderBoxes?.();
          this.refreshToolbar?.();
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
        this.ensureOriginalState(drag.item);
        drag.before = this.captureState(drag.item);
        drag.started = true;
      }

      drag.adjustment.scale = clamp(drag.originScale * ratio, 0.2, 5);
      this.applyLayoutAdjustment(drag.item, drag.adjustment);
      this.renderBoxes?.();
    },

startLayoutResize(event, item, handle) {
      if (!item || event.button !== 0) {
        return;
      }

      const axes = this.layoutResizeAxes(handle);
      if (!axes.width && !axes.height) {
        return;
      }

      const adjustment = this.layoutAdjustmentFor(item);
      const target = adjustment?.target;
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.commitActiveText?.();
      this.selectedId = item.id;
      this.refreshToolbar?.();
      this.closeOpenMenus?.();

      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const originWidth = Number.parseFloat(style.width) || rect.width;
      const originHeight = Number.parseFloat(style.height) || rect.height;
      this.layoutResizeDrag = {
        item,
        adjustment,
        handle,
        axes,
        before: null,
        started: false,
        startX: event.clientX,
        startY: event.clientY,
        originX: adjustment.x || 0,
        originY: adjustment.y || 0,
        originWidth,
        originHeight,
        scale: clamp(adjustment.scale || 1, 0.2, 5)
      };

      const box = this.shadow?.querySelector(`[data-item-id='${CSS.escape(item.id)}']`);
      box?.classList.add("is-layout-resizing");

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
        box?.classList.remove("is-layout-resizing");

        const drag = this.layoutResizeDrag;
        this.layoutResizeDrag = null;
        this.suppressLayoutClickUntil = performance.now() + 160;

        if (!drag) {
          return;
        }

        if (cancelled && drag.before) {
          this.restoreState(drag.item, drag.before);
          this.layoutAdjustments.delete(drag.item.id);
          this.renderBoxes?.();
          this.refreshToolbar?.();
          return;
        }

        const after = drag.before ? this.captureState(drag.item) : null;
        if (drag.before && after && !sameState(drag.before, after)) {
          this.pushHistory(drag.item, drag.before, after, "Resize element");
          this.markLayoutModified(drag.item);
          this.renderBoxes?.();
          this.refreshToolbar?.();
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
        this.ensureOriginalState(drag.item);
        drag.before = this.captureState(drag.item);
        this.ensureLayoutSizeBase(drag.adjustment, drag.axes);
        drag.started = true;
      }

      const deltaX = rawDeltaX / drag.scale;
      const deltaY = rawDeltaY / drag.scale;
      if (drag.axes.width) {
        const rawWidth = drag.axes.x > 0 ? drag.originWidth + deltaX : drag.originWidth - deltaX;
        const nextWidth = clamp(rawWidth, 8, 8000);
        drag.adjustment.width = nextWidth;
        if (drag.axes.x < 0) {
          drag.adjustment.x = drag.originX + (drag.originWidth - nextWidth);
        }
      }
      if (drag.axes.height) {
        const rawHeight = drag.axes.y > 0 ? drag.originHeight + deltaY : drag.originHeight - deltaY;
        const nextHeight = clamp(rawHeight, 8, 8000);
        drag.adjustment.height = nextHeight;
        if (drag.axes.y < 0) {
          drag.adjustment.y = drag.originY + (drag.originHeight - nextHeight);
        }
      }

      this.applyLayoutSizeAdjustment(drag.item, drag.adjustment);
      this.applyLayoutAdjustment(drag.item, drag.adjustment);
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
        this.ensureOriginalState(drag.item);
        drag.before = this.captureState(drag.item);
        drag.started = true;
      }

      const next = this.clampLayoutOffset(drag, drag.originX + deltaX, drag.originY + deltaY);
      drag.adjustment.x = next.x;
      drag.adjustment.y = next.y;
      this.applyLayoutAdjustment(drag.item, drag.adjustment);
      this.renderBoxes?.();
    },

clampLayoutOffset(drag, x, y) {
      const rect = drag.startRect;
      const deltaX = x - drag.originX;
      const deltaY = y - drag.originY;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const minVisibleX = Math.min(32, Math.max(8, rect.width * 0.18));
      const minVisibleY = Math.min(32, Math.max(8, rect.height * 0.18));
      const minDeltaX = minVisibleX - rect.right;
      const maxDeltaX = viewportWidth - minVisibleX - rect.left;
      const minDeltaY = minVisibleY - rect.bottom;
      const maxDeltaY = viewportHeight - minVisibleY - rect.top;
      return {
        x: drag.originX + clamp(deltaX, minDeltaX, maxDeltaX),
        y: drag.originY + clamp(deltaY, minDeltaY, maxDeltaY)
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
      const item = this.selectedItem();
      if (!item) {
        return;
      }

      this.withLayoutMutation(item, () => {
        const adjustment = this.layoutAdjustmentFor(item);
        if (!adjustment) {
          return;
        }
        adjustment.x = (adjustment.x || 0) + deltaX;
        adjustment.y = (adjustment.y || 0) + deltaY;
        this.applyLayoutAdjustment(item, adjustment);
      }, "Move element");
    },

withLayoutMutation(item, mutate, label) {
      this.ensureOriginalState(item);
      const before = this.captureState(item);
      mutate();
      const after = this.captureState(item);
      if (!sameState(before, after)) {
        this.pushHistory(item, before, after, label);
        this.markLayoutModified(item);
        this.renderBoxes?.();
        this.refreshToolbar?.();
      }
    },

resetSelectedLayout() {
      const item = this.selectedItem();
      if (!item) {
        return;
      }

      this.withLayoutMutation(item, () => {
        this.clearLayoutAdjustment(item);
      }, "Reset layout");
      this.clearLayoutModifiedIfClean(item);
      this.toast?.(this.t("layoutReset"));
    },

clearLayoutAdjustment(item) {
      const adjustment = this.layoutAdjustmentFor(item);
      const target = adjustment?.target;
      if (!target) {
        return;
      }
      restoreAttr(target, "style", this.styleWithoutLayoutAdjustment(target, adjustment));
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
