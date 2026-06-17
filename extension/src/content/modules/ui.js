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
    FONT_SIZES,
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

  ns.mixins.ui = {
installUi() {
      const existing = document.getElementById(ROOT_ID);
      if (existing) {
        existing.remove();
      }

      this.host = document.createElement("div");
      this.host.id = ROOT_ID;
      Object.assign(this.host.style, {
        all: "initial",
        position: "fixed",
        inset: "0",
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: "2147483647"
      });

      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.innerHTML = this.template();
      document.documentElement.appendChild(this.host);
      this.installVendorStyles();

      this.layer = this.shadow.querySelector("[data-role='layer']");
      this.toolbar = this.shadow.querySelector("[data-role='toolbar']");
      this.editPopover = this.shadow.querySelector("[data-role='edit-popover']");
      this.toastEl = this.shadow.querySelector("[data-role='toast']");
      this.fileInput = this.shadow.querySelector("[data-role='file-input']");
      this.bindUiEvents();
      this.populateFonts();
      this.populateFontSizes();
      this.refreshExportModeControl();
      this.installColorPickers();
      this.refreshToolbar();
    },

removeUi() {
      this.host?.remove();
      this.host = null;
      this.shadow = null;
      this.layer = null;
      this.toolbar = null;
      this.editPopover = null;
      this.toastEl = null;
      this.fileInput = null;
      this.colorMenuPicker?.destroyAndRemove?.();
      this.colorMenuPicker = null;
      this.colorPickers?.clear();
      this.fontSizeCombo?.destroy?.();
      this.fontSizeCombo = null;
    },

installVendorStyles() {
      const css = ns.vendor?.PICKR_NANO_CSS;
      if (!css || !this.shadow || this.shadow.querySelector("[data-role='pickr-style']")) {
        return;
      }

      const style = document.createElement("style");
      style.dataset.role = "pickr-style";
      style.textContent = css;
      this.shadow.appendChild(style);
    },

bindUiEvents() {
      this.shadow.addEventListener("click", (event) => {
        const comboOption = event.target.closest("[data-combo-option]");
        if (comboOption) {
          event.preventDefault();
          event.stopPropagation();
          this.handleComboOption(comboOption);
          return;
        }

        const fontSizeInput = event.target.closest("[data-control='fontSize']");
        if (fontSizeInput && fontSizeInput.dataset.uiKit !== "combo") {
          event.stopPropagation();
          this.openComboMenu("fontSize", fontSizeInput);
          return;
        }

        const comboTrigger = event.target.closest("[data-combo-trigger]");
        if (comboTrigger) {
          event.preventDefault();
          event.stopPropagation();
          this.openComboMenu(comboTrigger.dataset.comboTrigger, comboTrigger);
          return;
        }

        const colorOption = event.target.closest("[data-color-option]");
        if (colorOption) {
          event.preventDefault();
          event.stopPropagation();
          this.applyColorMenuOption(colorOption);
          return;
        }

        const colorMore = event.target.closest("[data-color-more]");
        if (colorMore) {
          event.preventDefault();
          event.stopPropagation();
          this.saveCurrentSelection();
          this.toggleAdvancedColorPicker?.(colorMore.dataset.colorMore || this.openColorControl, colorMore);
          return;
        }

        if (event.target.closest("[data-role='color-menu']")) {
          event.stopPropagation();
          return;
        }

        const colorButton = event.target.closest("[data-color-button]");
        if (colorButton) {
          event.preventDefault();
          event.stopPropagation();
          this.toggleColorMenu(colorButton.dataset.colorButton, colorButton);
          return;
        }

        const button = event.target.closest("[data-action]");
        if (!button) {
          this.closeOpenMenus();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.handleAction(button.dataset.action, button);
      });

      this.shadow.addEventListener("pointerdown", (event) => {
        const button = event.target.closest("button[data-action]");
        const control = event.target.closest("[data-control], [data-live-control]");
        const colorButton = event.target.closest("[data-color-button]");
        const menuControl = event.target.closest("[data-combo-trigger], [data-combo-option], [data-color-option], [data-color-more]");
        const colorMenuSurface = event.target.closest("[data-role='color-menu']");
        if (control || menuControl || colorMenuSurface) {
          this.saveCurrentSelection();
          this.keepUiInteractionAlive();
        }
        if (colorButton) {
          this.saveCurrentSelection();
          this.keepUiInteractionAlive();
          event.preventDefault();
        }
        if (button && button.dataset.action !== "image-replace") {
          this.saveCurrentSelection();
          event.preventDefault();
        }
      });

      this.shadow.addEventListener("focusin", (event) => {
        if (event.target.closest("[data-control], [data-live-control]")) {
          this.saveCurrentSelection();
          this.keepUiInteractionAlive();
        }

        const fontSize = event.target.closest("[data-control='fontSize']");
        if (fontSize && fontSize.dataset.uiKit !== "combo") {
          this.openComboMenu("fontSize", fontSize);
        }
      });

      this.shadow.addEventListener("change", (event) => {
        const control = event.target.closest("[data-control]");
        if (!control) {
          return;
        }
        if (control.dataset.uiKit === "combo") {
          return;
        }
        event.stopPropagation();
        this.handleControl(control.dataset.control, control.value);
      });

      this.shadow.addEventListener("input", (event) => {
        const fontSize = event.target.closest("[data-control='fontSize']");
        if (fontSize?.dataset.uiKit === "combo") {
          return;
        }
        if (fontSize) {
          event.stopPropagation();
          this.keepUiInteractionAlive();
          this.refreshFontSizeOptions(fontSize.value);
          this.closeComboMenu("fontSize");
          return;
        }

        const control = event.target.closest("[data-live-control], [data-control='lineHeight']");
        if (!control) {
          return;
        }
        event.stopPropagation();
        this.handleControl(control.dataset.liveControl || control.dataset.control, control.value);
      });

      this.shadow.addEventListener("keydown", (event) => {
        const fontSize = event.target.closest("[data-control='fontSize']");
        if (!fontSize || fontSize.dataset.uiKit === "combo") {
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          this.handleControl("fontSize", fontSize.value);
          this.closeComboMenu("fontSize");
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          this.openComboMenu("fontSize", fontSize);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.closeComboMenu("fontSize");
        }
      });

      this.layer.addEventListener("click", (event) => {
        const box = event.target.closest("[data-item-id]");
        if (!box) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const item = this.items.get(box.dataset.itemId);
        if (!item) {
          return;
        }
        this.closeOpenMenus();
        this.selectItem(item.id);
        if (this.isLayoutMode?.()) {
          if (performance.now() < (this.suppressLayoutClickUntil || 0)) {
            return;
          }
          return;
        }
        if (item.type === "text") {
          this.enterTextEdit(item, event);
        }
      });

      this.layer.addEventListener("pointerdown", (event) => {
        const box = event.target.closest("[data-item-id]");
        if (!box) {
          return;
        }
        const item = this.items.get(box.dataset.itemId);
        if (this.isLayoutMode?.()) {
          if (!item) {
            return;
          }
          const resizeHandle = event.target.closest("[data-layout-resize-handle]");
          if (resizeHandle) {
            this.startLayoutResize?.(event, item, resizeHandle.dataset.layoutResizeHandle);
            return;
          }
          const scaleHandle = event.target.closest("[data-layout-scale-handle]");
          if (scaleHandle) {
            this.startLayoutScale?.(event, item, scaleHandle.dataset.layoutScaleHandle);
            return;
          }
          if ((this.normalizeLayoutToolMode?.(this.layoutToolMode) || "moveScale") === "size") {
            event.preventDefault();
            event.stopPropagation();
            this.closeOpenMenus();
            this.selectItem(item.id);
            return;
          }
          this.startLayoutDrag?.(event, item);
          return;
        }
        if (!item || item.type !== "image") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.closeOpenMenus();
        this.selectItem(item.id);
        this.startImageContentDrag(event, item);
      });

      this.fileInput.addEventListener("change", () => this.handleImageFile());
    },

populateFonts() {
      const menu = this.shadow.querySelector("[data-combo-menu='fontFamily']");
      const button = this.shadow.querySelector("[data-combo-trigger='fontFamily']");
      if (!menu || !button) {
        return;
      }

      menu.innerHTML = FONTS.map((font) => {
        const label = font.value ? font.label : (this.lang === "zh-CN" ? "默认" : font.label);
        return `
          <button type="button" class="combo-option" data-combo-option="fontFamily" data-value="${escapeAttr(font.value)}">
            ${escapeHtml(label)}
          </button>
        `;
      }).join("");
      this.setFontFamilyControl("");
    },

    populateFontSizes() {
      const menu = this.shadow.querySelector("[data-combo-menu='fontSize']");
      if (!menu) {
        return;
      }

      menu.innerHTML = FONT_SIZES.map((size) => {
        return `<button type="button" class="combo-option compact" data-combo-option="fontSize" data-value="${size}">${size}</button>`;
      }).join("");
    },

renderBoxes() {
      if (!this.layer) {
        return;
      }

      if (!this.showBoxes) {
        this.layer.innerHTML = "";
        return;
      }

      const entries = [];
      for (const item of this.items.values()) {
        const rect = this.itemBoxElement(item).getBoundingClientRect();
        if (!intersectsViewport(rect)) {
          continue;
        }
        const selected = item.id === this.selectedId;
        const editing = item.id === this.editingTextId;
        const overflow = item.type === "text" && hasTextOverflow(item.element);
        entries.push({ item, rect, selected, editing, overflow });
      }

      if (this.isLayoutMode?.()) {
        entries.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
      }

      const boxes = entries.map(({ item, rect, selected, editing, overflow }) => (
        this.boxTemplate(item, rect, selected, editing, overflow)
      ));
      this.layer.innerHTML = boxes.join("");
    },

boxTemplate(item, rect, selected, editing, overflow) {
      const layoutMode = this.isLayoutMode?.() || item.type === "layout";
      const typeLabel = layoutMode
        ? this.t("layoutLabel")
        : (item.type === "text" ? this.t("textLabel") : this.t("imageLabel"));
      const positionLabel = item.positioned ? ` · ${this.t("positioned")}` : "";
      const offsetLabel = layoutMode ? this.layoutOffsetLabel?.(item) || "" : "";
      const className = [
        "box",
        layoutMode ? "box-layout" : (item.type === "text" ? "box-text" : "box-image"),
        layoutMode && (this.normalizeLayoutToolMode?.(this.layoutToolMode) || "moveScale") === "size" ? "is-layout-size-mode" : "",
        item.positioned ? "is-positioned" : "",
        selected ? "is-selected" : "",
        editing ? "is-editing" : "",
        overflow ? "has-overflow" : ""
      ].filter(Boolean).join(" ");

      return `
        <div class="${className}"
          data-item-id="${escapeAttr(item.id)}"
          style="left:${round(rect.left)}px;top:${round(rect.top)}px;width:${round(rect.width)}px;height:${round(rect.height)}px">
          <span class="box-label">${typeLabel}${positionLabel}${offsetLabel}${overflow ? ` ${this.t("overflow")}` : ""}</span>
          ${layoutMode && selected ? this.layoutHandlesTemplate() : ""}
        </div>
      `;
    },

layoutHandlesTemplate() {
      return (this.normalizeLayoutToolMode?.(this.layoutToolMode) || "moveScale") === "size"
        ? this.layoutResizeHandlesTemplate()
        : this.layoutScaleHandlesTemplate();
    },

layoutScaleHandlesTemplate() {
      return `
        <button class="layout-handle handle-nw" type="button" data-layout-scale-handle="nw" aria-label="${escapeAttr(this.t("scaleLayout"))}"></button>
        <button class="layout-handle handle-ne" type="button" data-layout-scale-handle="ne" aria-label="${escapeAttr(this.t("scaleLayout"))}"></button>
        <button class="layout-handle handle-se" type="button" data-layout-scale-handle="se" aria-label="${escapeAttr(this.t("scaleLayout"))}"></button>
        <button class="layout-handle handle-sw" type="button" data-layout-scale-handle="sw" aria-label="${escapeAttr(this.t("scaleLayout"))}"></button>
      `;
    },

layoutResizeHandlesTemplate() {
      const label = escapeAttr(this.t("resizeLayout"));
      return `
        <button class="layout-handle layout-resize-handle handle-nw" type="button" data-layout-resize-handle="nw" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-n" type="button" data-layout-resize-handle="n" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-ne" type="button" data-layout-resize-handle="ne" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-e" type="button" data-layout-resize-handle="e" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-se" type="button" data-layout-resize-handle="se" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-s" type="button" data-layout-resize-handle="s" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-sw" type="button" data-layout-resize-handle="sw" aria-label="${label}"></button>
        <button class="layout-handle layout-resize-handle handle-w" type="button" data-layout-resize-handle="w" aria-label="${label}"></button>
      `;
    },

itemBoxElement(item) {
      if (this.isLayoutMode?.()) {
        return this.layoutTargetForItem?.(item) || item?.frameElement || item?.element;
      }
      return item?.frameElement || item?.element;
    },

refreshToolbar() {
      if (!this.toolbar) {
        return;
      }

      const item = this.selectedItem();
      this.shadow.querySelector("[data-role='summary']").textContent = this.summaryText();
      this.refreshExportModeControl();
      this.refreshModeButtons?.();
      this.refreshLayoutToolButtons?.();
      this.refreshBoxesButton();

      if (item?.type === "text") {
        const style = this.toolbarTextStyle(item);
        const fontSize = parseFloat(style.fontSize);
        if (!this.shouldPreserveControlInput("fontFamily")) {
          this.setFontFamilyControl(this.matchFontFamily(style.fontFamily));
        }
        const textColor = toHexColor(style.color) || "#111827";
        const highlightColor = toHexColor(style.backgroundColor) || "#fff2a8";
        if (!this.shouldPreserveControlInput("fontSize")) {
          this.setFontSizeControl(Number.isFinite(fontSize) ? String(Math.round(fontSize)) : "");
        }
        if (!this.openColorControl) {
          this.shadow.querySelector("[data-live-control='color']").value = textColor;
          this.shadow.querySelector("[data-live-control='highlight']").value = highlightColor;
          this.refreshColorButtons({ color: textColor, highlight: highlightColor });
        }
        if (!this.shouldPreserveControlInput("lineHeight")) {
          this.shadow.querySelector("[data-control='lineHeight']").value = this.displayLineHeight(item);
        }
        this.refreshTextFormatButtons(item);
      } else {
        this.refreshTextFormatButtons(null);
      }

      this.positionEditPopover(item);
      this.repositionOpenFloatingControls();
    },

refreshBoxesButton() {
      const button = this.shadow?.querySelector("[data-action='toggle-boxes']");
      if (!button) {
        return;
      }
      button.textContent = this.showBoxes ? this.t("boxesOn") : this.t("boxesOff");
      button.classList.toggle("is-active", this.showBoxes);
      button.setAttribute("aria-pressed", this.showBoxes ? "true" : "false");
    },

handleComboOption(option) {
      const control = option.dataset.comboOption;
      const value = option.dataset.value || "";
      this.closeComboMenu(control);
      if (control === "fontFamily") {
        this.setFontFamilyControl(value);
      }
      if (control === "fontSize") {
        this.setFontSizeControl(value, { force: true });
      }
      this.handleControl(control, value);
    },

toggleComboMenu(control, trigger) {
      this.openComboMenu(control, trigger);
    },

    openComboMenu(control, trigger = null) {
      this.closeColorMenu();
      const target = trigger || this.shadow.querySelector(`[data-combo-trigger='${control}']`);
      for (const menu of this.shadow.querySelectorAll("[data-combo-menu]")) {
        const isTarget = menu.dataset.comboMenu === control;
        menu.hidden = !isTarget;
        this.shadow.querySelector(`[data-combo='${menu.dataset.comboMenu}']`)?.classList.toggle("is-open", isTarget);
        if (isTarget) {
          this.positionComboMenu(menu, target);
          this.scrollComboSelectionIntoView(menu);
        }
      }
      this.openCombo = control;
      this.shadow.querySelector(`[data-combo-trigger='${control}']`)?.setAttribute("aria-expanded", "true");
    },

    closeComboMenu(control = this.openCombo) {
      if (!control) {
        for (const menu of this.shadow?.querySelectorAll("[data-combo-menu]") || []) {
          menu.hidden = true;
          this.shadow.querySelector(`[data-combo='${menu.dataset.comboMenu}']`)?.classList.remove("is-open");
        }
        for (const trigger of this.shadow?.querySelectorAll("[data-combo-trigger]") || []) {
          trigger.setAttribute("aria-expanded", "false");
        }
        this.openCombo = null;
        return;
      }
      const menu = this.shadow?.querySelector(`[data-combo-menu='${control}']`);
      menu && (menu.hidden = true);
      this.shadow?.querySelector(`[data-combo='${control}']`)?.classList.remove("is-open");
      this.shadow?.querySelector(`[data-combo-trigger='${control}']`)?.setAttribute("aria-expanded", "false");
      if (this.openCombo === control) {
        this.openCombo = null;
      }
    },

    closeOpenMenus() {
      this.closeComboMenu();
      this.closeColorMenu?.();
      this.fontSizeCombo?.close?.();
    },

    positionComboMenu(menu, anchor) {
      const control = menu?.dataset.comboMenu;
      const combo = control ? this.shadow?.querySelector(`[data-combo='${control}']`) : null;
      const anchorRect = combo?.getBoundingClientRect?.() || anchor?.getBoundingClientRect?.();
      const rect = anchorRect;
      if (!rect || !menu) {
        return;
      }

      const margin = 10;
      const gap = 4;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const minWidth = control === "fontFamily" ? 178 : 82;
      const width = Math.max(minWidth, rect.width);
      const availableBelow = Math.max(96, viewportHeight - rect.bottom - gap - margin);

      menu.style.visibility = "hidden";
      menu.style.width = `${round(width)}px`;
      menu.style.maxHeight = `${round(Math.min(260, availableBelow))}px`;
      menu.style.left = "0px";
      menu.style.top = "0px";

      const menuRect = menu.getBoundingClientRect();
      const below = rect.bottom + gap;
      const left = clamp(rect.left, margin, Math.max(margin, viewportWidth - menuRect.width - margin));

      menu.style.left = `${round(left)}px`;
      menu.style.top = `${round(below)}px`;
      menu.style.visibility = "";
    },

    scrollComboSelectionIntoView(menu) {
      const selected = menu?.querySelector(".combo-option.is-selected");
      selected?.scrollIntoView?.({ block: "nearest" });
    },

    repositionOpenFloatingControls() {
      if (this.openCombo) {
        const menu = this.shadow?.querySelector(`[data-combo-menu='${this.openCombo}']`);
        const anchor = this.shadow?.activeElement?.closest?.(`[data-combo='${this.openCombo}']`)
          ? this.shadow.activeElement
          : this.shadow?.querySelector(`[data-combo-trigger='${this.openCombo}']`);
        if (menu && !menu.hidden) {
          this.positionComboMenu(menu, anchor);
        }
      }
      this.repositionColorMenu?.();
    },

    keepUiInteractionAlive() {
      this.uiInteractionUntil = performance.now() + 500;
    },

    isUiInteractionActive() {
      const active = this.shadow?.activeElement;
      const activeInPopover = Boolean(active?.closest?.("[data-role='edit-popover'], [data-role='color-menu']"));
      return Boolean(this.openCombo || this.openColorControl || activeInPopover || performance.now() < (this.uiInteractionUntil || 0));
    },

    shouldPreserveControlInput(control) {
      if (this.openCombo === control) {
        return true;
      }
      const active = this.shadow?.activeElement;
      if (!active) {
        return false;
      }
      if (control === "fontFamily") {
        return Boolean(active.closest?.("[data-combo='fontFamily']"));
      }
      return Boolean(active.closest?.(`[data-control='${control}']`));
    },

setFontFamilyControl(value) {
      const normalized = value || "";
      const button = this.shadow?.querySelector("[data-combo-trigger='fontFamily']");
      const label = FONTS.find((font) => font.value === normalized)?.label || (this.lang === "zh-CN" ? "默认" : "Default");
      if (button) {
        button.dataset.value = normalized;
        button.querySelector("[data-role='combo-label']").textContent = normalized ? label : (this.lang === "zh-CN" ? "默认" : label);
      }

      for (const option of this.shadow?.querySelectorAll("[data-combo-option='fontFamily']") || []) {
        option.classList.toggle("is-selected", option.dataset.value === normalized);
      }
    },

matchFontFamily(computedValue) {
      const current = this.normalizedFontName(computedValue);
      const match = FONTS.find((font) => font.value && this.normalizedFontName(font.value) === current);
      return match?.value || "";
    },

normalizedFontName(value) {
      return String(value || "")
        .split(",")[0]
        .replace(/^["']|["']$/g, "")
        .trim()
        .toLowerCase();
    },

refreshExportModeControl() {
      const select = this.shadow?.querySelector("[data-control='exportMode']");
      if (select) {
        select.value = this.normalizeExportMode?.(this.exportMode) || "basic";
      }
    },

    positionEditPopover(item) {
      if (!this.editPopover) {
        return;
      }

      const selectionType = item && this.isLayoutMode?.() ? "layout" : (item?.type || "none");
      this.editPopover.dataset.selection = selectionType;

      if (!item || !["text", "image", "layout"].includes(selectionType)) {
        this.editPopover.hidden = true;
        delete this.editPopover.dataset.itemId;
        return;
      }

      if (!this.editPopover.hidden && this.editPopover.dataset.itemId === item.id && this.isUiInteractionActive()) {
        return;
      }

      const anchor = this.itemBoxElement(item);
      const rect = anchor?.getBoundingClientRect?.();
      if (!rect || !isVisibleRect(rect, 4, 4) || !intersectsViewport(rect)) {
        this.editPopover.hidden = true;
        return;
      }

      this.editPopover.hidden = false;
      this.editPopover.dataset.itemId = item.id;
      this.editPopover.style.visibility = "hidden";
      this.editPopover.style.left = "0px";
      this.editPopover.style.top = "0px";

      const popoverRect = this.editPopover.getBoundingClientRect();
      const gap = 8;
      const margin = 10;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const toolbarRect = this.toolbar?.getBoundingClientRect?.();
      const safeTop = Math.max(margin, toolbarRect ? toolbarRect.bottom + gap : margin);
      const aboveTop = rect.top - popoverRect.height - gap;
      const belowTop = rect.bottom + gap;
      const fitsAbove = aboveTop >= safeTop;
      const fitsBelow = belowTop + popoverRect.height <= viewportHeight - margin;
      const spaceAbove = Math.max(0, rect.top - safeTop - gap);
      const spaceBelow = Math.max(0, viewportHeight - margin - rect.bottom - gap);
      const placement = fitsAbove ? "top" : (fitsBelow || spaceBelow >= spaceAbove ? "bottom" : "top");
      const rawTop = placement === "top" ? aboveTop : belowTop;
      const maxTop = Math.max(safeTop, viewportHeight - popoverRect.height - margin);
      const top = clamp(rawTop, safeTop, maxTop);
      const rawLeft = rect.left + rect.width / 2 - popoverRect.width / 2;
      const maxLeft = Math.max(margin, viewportWidth - popoverRect.width - margin);
      const left = clamp(rawLeft, margin, maxLeft);

      this.editPopover.dataset.placement = placement;
      this.editPopover.style.left = `${round(left)}px`;
      this.editPopover.style.top = `${round(top)}px`;
      this.editPopover.style.visibility = "";
    },

    setFontSizeControl(value, options = {}) {
      const input = this.shadow?.querySelector("[data-control='fontSize']");
      if (!input) {
        return;
      }

      const normalized = String(value || "");
      if (options.force || !this.shouldPreserveControlInput("fontSize")) {
        input.value = normalized;
      }
      this.refreshFontSizeOptions(normalized);
    },

    refreshFontSizeOptions(value) {
      const normalized = String(value || "");
      for (const option of this.shadow?.querySelectorAll("[data-combo-option='fontSize']") || []) {
        option.classList.toggle("is-selected", option.dataset.value === normalized);
      }
    },

refreshTextFormatButtons(item) {
      const states = item?.type === "text"
        ? {
            bold: this.textStyleState(item, "fontWeight", "700"),
            italic: this.textStyleState(item, "fontStyle", "italic"),
            underline: this.textStyleState(item, "textDecorationLine", "underline")
          }
        : {};

      for (const action of ["bold", "italic", "underline"]) {
        const button = this.shadow.querySelector(`[data-action='${action}']`);
        if (!button) {
          continue;
        }
        const state = states[action] || "inactive";
        button.classList.toggle("is-active", state === "active");
        button.classList.toggle("is-mixed", state === "mixed");
        button.setAttribute("aria-pressed", state === "active" ? "true" : "false");
        button.dataset.state = state;
      }
    },

toolbarTextStyle(item) {
      const range = this.savedTextRange && rangeBelongsTo(this.savedTextRange, item.element)
        ? this.savedTextRange
        : null;
      const node = range && this.styleNodeForRange
        ? this.styleNodeForRange(range, item.element)
        : item.element;
      return getComputedStyle(node || item.element);
    },

toast(message) {
      if (!this.toastEl) {
        return;
      }
      this.toastEl.textContent = message;
      this.toastEl.classList.add("is-visible");
      clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => {
        this.toastEl?.classList.remove("is-visible");
      }, 2200);
    },

template() {
      return `
        <style>${EDITOR_CSS}</style>
        <div class="toolbar" data-role="toolbar">
          <button class="collapse" type="button" data-action="collapse" title="${escapeAttr(this.t("collapseTitle"))}">
            <span class="brand-mark" aria-hidden="true">P</span>
            <span class="brand-text">${escapeHtml(this.t("appName"))}</span>
          </button>
          <div class="toolbar-body">
            <div class="summary" data-role="summary">${escapeHtml(this.t("ready"))}</div>

            <div class="mode-switch" role="group" aria-label="${escapeAttr(this.t("layoutMode"))}">
              <button type="button" data-action="content-mode">${escapeHtml(this.t("contentMode"))}</button>
              <button type="button" data-action="layout-mode">${escapeHtml(this.t("layoutMode"))}</button>
            </div>

            <div class="group group-default">
              <button type="button" data-action="undo">${escapeHtml(this.t("undo"))}</button>
              <button type="button" data-action="redo">${escapeHtml(this.t("redo"))}</button>
              <button type="button" data-action="rescan">${escapeHtml(this.t("rescan"))}</button>
              <button type="button" data-action="toggle-boxes" aria-pressed="${this.showBoxes ? "true" : "false"}">${escapeHtml(this.showBoxes ? this.t("boxesOn") : this.t("boxesOff"))}</button>
              <button type="button" data-action="language">${escapeHtml(this.t("language"))}</button>
              <label class="save-mode">${escapeHtml(this.t("saveMode"))}
                <select data-control="exportMode" title="${escapeAttr(this.t("saveMode"))}">
                  <option value="basic">${escapeHtml(this.t("basicHtml"))}</option>
                  <option value="full">${escapeHtml(this.t("fullHtml"))}</option>
                </select>
              </label>
              ${this.isDraftEnabled?.() ? `<button type="button" data-action="save-draft">${escapeHtml(this.t("saveDraft"))}</button>` : ""}
              <button class="primary" type="button" data-action="download">${escapeHtml(this.t("download"))}</button>
              <button type="button" data-action="exit">${escapeHtml(this.t("exit"))}</button>
            </div>
          </div>
        </div>

        <div class="edit-popover" data-role="edit-popover" data-selection="none" hidden>
            <div class="group group-text">
              <div class="text-row text-row-primary">
                <div class="combo font-combo" data-combo="fontFamily">
                  <button class="combo-trigger" type="button" data-combo-trigger="fontFamily" aria-haspopup="listbox" aria-expanded="false">
                    <span data-role="combo-label">${this.lang === "zh-CN" ? "默认" : "Default"}</span>
                    <span class="combo-caret" aria-hidden="true">⌄</span>
                  </button>
                </div>
                <label class="size-label">${escapeHtml(this.t("size"))}
                  <span class="size-combo" data-combo="fontSize">
                    <input class="size-input" data-control="fontSize" type="text" inputmode="numeric" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="none">
                    <button class="size-trigger" type="button" data-combo-trigger="fontSize" aria-haspopup="listbox" aria-expanded="false">⌄</button>
                  </span>
                  <span class="unit">px</span>
                </label>
                <button type="button" data-action="font-size-down" title="${escapeAttr(this.t("sizeDown"))}">A-</button>
                <button type="button" data-action="font-size-up" title="${escapeAttr(this.t("sizeUp"))}">A+</button>
                <button type="button" data-action="bold"><strong>B</strong></button>
                <button type="button" data-action="italic"><em>I</em></button>
                <button type="button" data-action="underline"><span class="underline">U</span></button>
                <label>${escapeHtml(this.t("line"))} <input data-control="lineHeight" type="number" min="0.7" max="4" step="0.1"></label>
              </div>
              <div class="text-row text-row-secondary">
                <button class="color-button" type="button" data-color-button="color"><span class="color-swatch" data-role="color-swatch"></span>${escapeHtml(this.t("textColor"))}</button>
                <input data-live-control="color" type="hidden" value="#111827">
                <button class="color-button" type="button" data-color-button="highlight"><span class="color-swatch" data-role="color-swatch"></span>${escapeHtml(this.t("highlight"))}</button>
                <input data-live-control="highlight" type="hidden" value="#fff2a8">
                <button type="button" data-action="align-left">${escapeHtml(this.t("left"))}</button>
                <button type="button" data-action="align-center">${escapeHtml(this.t("center"))}</button>
                <button type="button" data-action="align-right">${escapeHtml(this.t("right"))}</button>
              </div>
            </div>

            <div class="group group-image">
              <button class="primary" type="button" data-action="image-replace">${escapeHtml(this.t("replace"))}</button>
              <button type="button" data-action="fit-cover">${escapeHtml(this.t("cover"))}</button>
              <button type="button" data-action="fit-contain">${escapeHtml(this.t("contain"))}</button>
              <button type="button" data-action="fit-fill">${escapeHtml(this.t("fill"))}</button>
              <button type="button" data-action="zoom-out">${escapeHtml(this.t("zoomOut"))}</button>
              <button type="button" data-action="zoom-in">${escapeHtml(this.t("zoomIn"))}</button>
              <button type="button" data-action="image-reset">${escapeHtml(this.t("reset"))}</button>
            </div>

            <div class="group group-layout">
              <button type="button" data-action="layout-tool-move-scale" aria-pressed="${this.layoutToolMode === "moveScale" ? "true" : "false"}">${escapeHtml(this.t("moveScaleMode"))}</button>
              <button type="button" data-action="layout-tool-size" aria-pressed="${this.layoutToolMode === "size" ? "true" : "false"}">${escapeHtml(this.t("sizeMode"))}</button>
              <button type="button" data-action="layout-reset">${escapeHtml(this.t("resetLayout"))}</button>
            </div>
        </div>
        <div class="combo-menu font-menu" data-combo-menu="fontFamily" role="listbox" hidden></div>
        <div class="combo-menu size-menu" data-combo-menu="fontSize" role="listbox" hidden></div>
        <div class="layer" data-role="layer"></div>
        <div class="picker-layer" data-role="picker-layer"></div>
        <div class="color-menu" data-role="color-menu" hidden></div>
        <div class="toast" data-role="toast" aria-live="polite"></div>
        <input class="file-input" data-role="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
      `;
    }
  };
})();
