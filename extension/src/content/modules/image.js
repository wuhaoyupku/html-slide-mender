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

  const IMAGE_FITS = new Set(["cover", "contain", "fill"]);
  const IMAGE_CUSTOM_PROPS = {
    x: "--hsm-image-x",
    y: "--hsm-image-y",
    scale: "--hsm-image-scale",
    fit: "--hsm-image-fit",
    baseTransform: "--hsm-image-base-transform",
    frameWidth: "--hsm-frame-width",
    frameHeight: "--hsm-frame-height"
  };

  function readCustomNumber(element, name, fallback) {
    const value = Number.parseFloat(element.style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function validFit(value, fallback = "cover") {
    return IMAGE_FITS.has(value) ? value : fallback;
  }

  function setImportantStyle(element, property, value) {
    element.style.setProperty(property, value, "important");
  }

  ns.mixins.image = {
openImagePicker() {
      const item = this.selectedItem();
      if (!item || item.type !== "image" || !this.fileInput) {
        return;
      }

      this.pendingImageReplaceId = item.id;
      this.pendingImageAddAnchor = null;
      this.fileInput.value = "";
      try {
        if (typeof this.fileInput.showPicker === "function") {
          this.fileInput.showPicker();
          return;
        }
      } catch (_error) {
        // Some browsers expose showPicker but still reject it inside extensions.
      }
      this.fileInput.click();
    },

async handleImageFile() {
      const addAnchor = this.pendingImageAddAnchor;
      const item = addAnchor ? null : (this.items.get(this.pendingImageReplaceId) || this.selectedItem());
      const file = this.fileInput.files?.[0];
      this.pendingImageAddAnchor = null;
      this.pendingImageReplaceId = null;
      if ((!addAnchor && (!item || item.type !== "image")) || !file) {
        return;
      }

      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
        this.fileInput.value = "";
        this.toast(this.t("unsupportedImage"));
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      if (addAnchor) {
        await this.insertImageBlock?.(dataUrl, addAnchor);
        this.fileInput.value = "";
        return;
      }

      this.withMutation(item, () => {
        this.applyImageSource(item, dataUrl);
      }, "Replace image");
      this.fileInput.value = "";
      this.toast(this.t("imageReplaced"));
    },

applyImageSource(item, dataUrl) {
      if (item.imageMode === "background") {
        item.element.style.backgroundImage = `url("${dataUrl}")`;
        const adjustment = this.adjustmentFor(item);
        adjustment.x = 0;
        adjustment.y = 0;
        adjustment.scale = 1;
        adjustment.fit = "cover";
        this.applyImageAdjustment(item, adjustment);
        return;
      }

      const frameSize = this.lockImageFrame(item);
      this.applyResponsiveImageSource(item, dataUrl);
      const adjustment = this.adjustmentFor(item);
      adjustment.x = 0;
      adjustment.y = 0;
      adjustment.scale = 1;
      adjustment.fit = "cover";
      this.applyImageAdjustment(item, adjustment, frameSize);
    },

applyImageFit(fit) {
      const item = this.selectedItem();
      if (!item || item.type !== "image" || !IMAGE_FITS.has(fit)) {
        return;
      }

      this.withMutation(item, () => {
        const frameSize = this.lockImageFrame(item);
        const adjustment = this.adjustmentFor(item);
        adjustment.fit = fit;
        adjustment.x = 0;
        adjustment.y = 0;
        adjustment.scale = 1;
        this.applyImageAdjustment(item, adjustment, frameSize);
      }, "Image fit");
    },

zoomImage(delta) {
      const item = this.selectedItem();
      if (!item || item.type !== "image") {
        return;
      }

      this.withMutation(item, () => {
        const frameSize = this.lockImageFrame(item);
        const adjustment = this.adjustmentFor(item);
        adjustment.scale = clamp(adjustment.scale + delta, 0.2, 5);
        adjustment.fit = validFit(adjustment.fit, this.currentImageFit(item));
        this.applyImageAdjustment(item, adjustment, frameSize);
      }, "Image zoom");
    },

startImageContentDrag(event, item) {
      if (!item || item.type !== "image") {
        return;
      }

      const adjustment = this.adjustmentFor(item);
      this.drag = {
        item,
        before: null,
        started: false,
        startX: event.clientX,
        startY: event.clientY,
        originX: adjustment.x,
        originY: adjustment.y
      };

      const box = this.shadow?.querySelector(`[data-item-id='${CSS.escape(item.id)}']`);
      box?.classList.add("is-dragging");

      const onMove = (moveEvent) => {
        if (!this.drag) {
          return;
        }

        const deltaX = moveEvent.clientX - this.drag.startX;
        const deltaY = moveEvent.clientY - this.drag.startY;
        if (!this.drag.started && Math.hypot(deltaX, deltaY) < 3) {
          return;
        }

        moveEvent.preventDefault();
        if (!this.drag.started) {
          this.ensureOriginalState(item);
          this.drag.before = this.captureState(item);
          this.lockImageFrame(item);
          this.drag.started = true;
        }

        const current = this.adjustmentFor(item);
        current.x = clamp(this.drag.originX + deltaX, -2000, 2000);
        current.y = clamp(this.drag.originY + deltaY, -2000, 2000);
        current.fit = validFit(current.fit, this.currentImageFit(item));
        this.applyImageAdjustment(item, current);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        box?.classList.remove("is-dragging");

        const before = this.drag?.before;
        const after = before ? this.captureState(item) : null;
        this.drag = null;
        if (before && after && !sameState(before, after)) {
          this.pushHistory(item, before, after, "Move image content");
          this.markModified(item);
          this.renderBoxes();
          this.refreshToolbar();
        }
      };

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
    },

adjustmentFor(item) {
      const existing = this.imageAdjustments.get(item.id);
      if (existing) {
        return existing;
      }

      const adjustment = {
        x: readCustomNumber(item.element, IMAGE_CUSTOM_PROPS.x, 0),
        y: readCustomNumber(item.element, IMAGE_CUSTOM_PROPS.y, 0),
        scale: readCustomNumber(item.element, IMAGE_CUSTOM_PROPS.scale, 1),
        fit: this.currentImageFit(item),
        baseTransform: item.imageMode === "img"
          ? item.element.style.getPropertyValue(IMAGE_CUSTOM_PROPS.baseTransform) || item.element.style.transform || ""
          : ""
      };
      this.imageAdjustments.set(item.id, adjustment);
      return adjustment;
    },

applyImageAdjustment(item, adjustment, frameSize = null) {
      if (item.imageMode === "background") {
        this.applyBackgroundAdjustment(item, adjustment);
        return;
      }

      this.applyElementImageAdjustment(item, adjustment, frameSize);
    },

applyBackgroundAdjustment(item, adjustment) {
      const fit = validFit(adjustment.fit, "cover");
      const scale = round(clamp(adjustment.scale || 1, 0.2, 5), 2);
      const scalePercent = round(scale * 100, 1);

      item.element.style.backgroundRepeat = "no-repeat";
      item.element.style.backgroundPosition = `calc(50% + ${Math.round(adjustment.x)}px) calc(50% + ${Math.round(adjustment.y)}px)`;
      if (fit === "fill") {
        item.element.style.backgroundSize = scale === 1 ? "100% 100%" : `${scalePercent}% ${scalePercent}%`;
      } else {
        item.element.style.backgroundSize = scale === 1 ? fit : `${scalePercent}% auto`;
      }
      this.writeImageAdjustment(item, adjustment);
    },

applyElementImageAdjustment(item, adjustment, frameSize = null) {
      this.prepareImageContainer(item, frameSize);
      const fit = validFit(adjustment.fit, this.currentImageFit(item));
      const scale = round(clamp(adjustment.scale || 1, 0.2, 5), 2);
      const x = Math.round(adjustment.x || 0);
      const y = Math.round(adjustment.y || 0);
      const transforms = [];
      if (adjustment.baseTransform) {
        transforms.push(adjustment.baseTransform);
      }
      if (x !== 0 || y !== 0 || scale !== 1) {
        transforms.push(`translate(${x}px, ${y}px) scale(${scale})`);
      }

      item.element.style.objectFit = fit;
      item.element.style.objectPosition = "center center";
      item.element.style.transformOrigin = "center center";
      item.element.style.transform = transforms.join(" ");
      this.writeImageAdjustment(item, adjustment);
    },

prepareImageContainer(item, frameSize = null) {
      if (item.imageMode !== "img") {
        return;
      }

      const size = frameSize || this.lockImageFrame(item);
      this.lockImageContent(item, size);
    },

lockImageFrame(item) {
      if (item.imageMode !== "img") {
        return null;
      }

      this.ensureImageFrame(item);
      const frame = item.frameElement;
      if (!frame) {
        return null;
      }

      const rect = frame.getBoundingClientRect();
      const storedWidth = readCustomNumber(item.element, IMAGE_CUSTOM_PROPS.frameWidth, null);
      const storedHeight = readCustomNumber(item.element, IMAGE_CUSTOM_PROPS.frameHeight, null);
      const width = storedWidth || rect.width;
      const height = storedHeight || rect.height;
      if (!width || !height) {
        return null;
      }

      item.element.style.setProperty(IMAGE_CUSTOM_PROPS.frameWidth, String(round(width)));
      item.element.style.setProperty(IMAGE_CUSTOM_PROPS.frameHeight, String(round(height)));
      this.lockFrameElement(frame, width, height);
      return { width, height };
    },

ensureImageFrame(item) {
      if (!item || item.imageMode !== "img") {
        return;
      }

      const image = item.element;
      if (item.frameElement && item.frameElement !== image) {
        return;
      }

      const parent = image.parentElement;
      if (!parent || parent === document.documentElement) {
        return;
      }

      const rect = image.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-hsm-image-frame", "true");
      const imageStyle = getComputedStyle(image);
      wrapper.style.display = imageStyle.display === "block" ? "block" : "inline-block";
      wrapper.style.verticalAlign = imageStyle.verticalAlign;
      wrapper.style.lineHeight = "0";
      wrapper.style.overflow = "hidden";
      wrapper.style.width = `${round(rect.width)}px`;
      wrapper.style.height = `${round(rect.height)}px`;
      this.transferImageLayoutToFrame(image, wrapper, rect, imageStyle);
      parent.insertBefore(wrapper, image);
      wrapper.appendChild(image);
      item.frameElement = wrapper;
    },

transferImageLayoutToFrame(image, frame, rect, imageStyle) {
      frame.style.margin = imageStyle.margin;
      frame.style.zIndex = imageStyle.zIndex;

      if (["absolute", "fixed", "sticky"].includes(imageStyle.position)) {
        frame.style.position = imageStyle.position;
        frame.style.right = "auto";
        frame.style.bottom = "auto";
        if (imageStyle.position === "fixed") {
          frame.style.left = `${round(rect.left)}px`;
          frame.style.top = `${round(rect.top)}px`;
        } else {
          const offsetParent = image.offsetParent;
          const offsetRect = offsetParent?.getBoundingClientRect?.() || { left: 0, top: 0 };
          frame.style.left = `${round(rect.left - offsetRect.left)}px`;
          frame.style.top = `${round(rect.top - offsetRect.top)}px`;
        }
      }

      image.style.setProperty("position", "static", "important");
      image.style.setProperty("inset", "auto", "important");
      image.style.setProperty("left", "auto", "important");
      image.style.setProperty("top", "auto", "important");
      image.style.setProperty("right", "auto", "important");
      image.style.setProperty("bottom", "auto", "important");
      image.style.setProperty("margin", "0", "important");
    },

lockFrameElement(frame, width, height) {
      setImportantStyle(frame, "box-sizing", "border-box");
      setImportantStyle(frame, "display", getComputedStyle(frame).display === "inline" ? "inline-block" : getComputedStyle(frame).display || "block");
      setImportantStyle(frame, "overflow", "hidden");
      setImportantStyle(frame, "width", `${round(width)}px`);
      setImportantStyle(frame, "height", `${round(height)}px`);
      setImportantStyle(frame, "min-width", `${round(width)}px`);
      setImportantStyle(frame, "max-width", `${round(width)}px`);
      setImportantStyle(frame, "min-height", `${round(height)}px`);
      setImportantStyle(frame, "max-height", `${round(height)}px`);
      setImportantStyle(frame, "aspect-ratio", "auto");
      frame.style.setProperty(IMAGE_CUSTOM_PROPS.frameWidth, String(round(width)));
      frame.style.setProperty(IMAGE_CUSTOM_PROPS.frameHeight, String(round(height)));
    },

lockImageContent(item, size) {
      const image = item.element;
      setImportantStyle(image, "position", "static");
      setImportantStyle(image, "inset", "auto");
      setImportantStyle(image, "left", "auto");
      setImportantStyle(image, "top", "auto");
      setImportantStyle(image, "right", "auto");
      setImportantStyle(image, "bottom", "auto");
      setImportantStyle(image, "margin", "0");
      setImportantStyle(image, "display", "block");
      setImportantStyle(image, "width", "100%");
      setImportantStyle(image, "height", "100%");
      setImportantStyle(image, "min-width", "100%");
      setImportantStyle(image, "min-height", "100%");
      setImportantStyle(image, "max-width", "none");
      setImportantStyle(image, "max-height", "none");
      setImportantStyle(image, "aspect-ratio", "auto");
      setImportantStyle(image, "will-change", "transform");
      if (size) {
        image.style.setProperty(IMAGE_CUSTOM_PROPS.frameWidth, String(round(size.width)));
        image.style.setProperty(IMAGE_CUSTOM_PROPS.frameHeight, String(round(size.height)));
      }
    },

currentImageFit(item) {
      if (item.imageMode === "background") {
        const size = item.element.style.backgroundSize || getComputedStyle(item.element).backgroundSize;
        if (size === "contain") {
          return "contain";
        }
        if (size === "100% 100%") {
          return "fill";
        }
        return "cover";
      }

      const saved = item.element.style.getPropertyValue(IMAGE_CUSTOM_PROPS.fit);
      if (IMAGE_FITS.has(saved)) {
        return saved;
      }
      return validFit(item.element.style.objectFit || getComputedStyle(item.element).objectFit, "cover");
    },

writeImageAdjustment(item, adjustment) {
      const element = item.element;
      element.style.setProperty(IMAGE_CUSTOM_PROPS.x, String(Math.round(adjustment.x || 0)));
      element.style.setProperty(IMAGE_CUSTOM_PROPS.y, String(Math.round(adjustment.y || 0)));
      element.style.setProperty(IMAGE_CUSTOM_PROPS.scale, String(round(clamp(adjustment.scale || 1, 0.2, 5), 2)));
      element.style.setProperty(IMAGE_CUSTOM_PROPS.fit, validFit(adjustment.fit, "cover"));
      if (item.imageMode === "img" && adjustment.baseTransform) {
        element.style.setProperty(IMAGE_CUSTOM_PROPS.baseTransform, adjustment.baseTransform);
      }
    },

applyResponsiveImageSource(item, dataUrl) {
      const image = item.element;
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.srcset = "";
      image.sizes = "";
      image.setAttribute("src", dataUrl);
      image.src = dataUrl;

      const picture = image.closest("picture");
      if (!picture || !picture.contains(image)) {
        return;
      }
      for (const source of picture.querySelectorAll("source")) {
        source.setAttribute("srcset", dataUrl);
        source.removeAttribute("sizes");
      }
    },

capturePictureSourceStates(image) {
      const picture = image.closest("picture");
      if (!picture || !picture.contains(image)) {
        return [];
      }

      return Array.from(picture.querySelectorAll("source")).map((source) => ({
        source,
        srcset: source.getAttribute("srcset") || "",
        sizes: source.getAttribute("sizes") || "",
        type: source.getAttribute("type") || "",
        media: source.getAttribute("media") || ""
      }));
    },

restorePictureSourceStates(_image, states = []) {
      for (const state of states) {
        if (!state.source?.isConnected) {
          continue;
        }
        restoreAttr(state.source, "srcset", state.srcset);
        restoreAttr(state.source, "sizes", state.sizes);
        restoreAttr(state.source, "type", state.type);
        restoreAttr(state.source, "media", state.media);
      }
    },

resetSelectedImage() {
      const item = this.selectedItem();
      if (!item || item.type !== "image") {
        return;
      }

      if (this.addedItems?.has(item.id)) {
        this.resetAddedImage(item);
        return;
      }

      const original = this.originalStates.get(item.id);
      if (!original) {
        return;
      }

      this.withMutation(item, () => {
        this.restoreState(item, original);
        this.imageAdjustments.delete(item.id);
      }, "Reset image");
      this.modified.delete(item.id);
      this.toast(this.t("imageReset"));
    },

resetAddedImage(item) {
      const record = this.addedItems?.get(item.id);
      const original = record?.initialState;
      if (!record || !original) {
        return;
      }

      const root = this.addedRootForItem?.(item);
      const image = item.element;
      if (root && root !== image && root.matches?.("[data-hsm-image-frame]")) {
        root.parentElement?.insertBefore(image, root);
        root.remove();
        item.frameElement = image;
      }

      this.withMutation(item, () => {
        this.restoreState(item, original);
        item.frameElement = image;
        record.element = image;
        record.parentElement = image.parentElement || record.parentElement;
        this.imageAdjustments.delete(item.id);
        this.layoutAdjustments?.delete(item.id);
      }, "Reset inserted image");

      this.addedItems.set(item.id, record);
      this.markAddedItemModified?.(item);
      this.scan();
      this.selectItem(item.id);
      this.toast(this.t("imageReset"));
    }
  };
})();
