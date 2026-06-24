(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  ns.mixins = ns.mixins || {};
  const { uniqueDomId, clamp, round, escapeAttr } = ns.utils;
  const { selectElementContents } = ns.selection;

  ns.mixins.insert = {
addTextBlock() {
      if (!this.active) {
        return;
      }

      this.commitActiveText?.();
      this.setEditorMode?.("content");
      const parent = this.addedElementParent();
      const element = this.createAddedTextElement();
      parent.appendChild(element);

      const item = this.itemForAddedElement(element, "text");
      this.registerAddedItem(item, { parentElement: parent });
      this.pushCreateHistory?.(item, this.addedItems.get(item.id), "Add text");
      this.scan();
      const current = this.items.get(item.id) || item;
      this.selectItem(current.id);
      this.toast?.(this.t("textAdded"));

      requestAnimationFrame(() => {
        const editable = this.items.get(current.id) || current;
        this.enterTextEdit?.(editable);
        requestAnimationFrame(() => {
          selectElementContents(editable.element);
          this.saveCurrentSelection?.();
        });
      });
    },

addImageBlock() {
      if (!this.active || !this.fileInput) {
        return;
      }

      this.commitActiveText?.();
      this.setEditorMode?.("content");
      this.pendingImageReplaceId = null;
      this.pendingImageAddAnchor = {
        parentElement: this.addedElementParent()
      };
      this.fileInput.value = "";
      try {
        if (typeof this.fileInput.showPicker === "function") {
          this.fileInput.showPicker();
          return;
        }
      } catch (_error) {
        // Some extension contexts expose showPicker but reject it at runtime.
      }
      this.fileInput.click();
    },

async insertImageBlock(dataUrl, anchor = {}) {
      const parent = anchor.parentElement?.isConnected ? anchor.parentElement : this.addedElementParent();
      const dimensions = await this.readInsertedImageDimensions(dataUrl);
      const element = this.createAddedImageElement(dataUrl, dimensions);
      parent.appendChild(element);

      const item = this.itemForAddedElement(element, "image");
      this.registerAddedItem(item, { parentElement: parent });
      this.pushCreateHistory?.(item, this.addedItems.get(item.id), "Add image");
      this.scan();
      const current = this.items.get(item.id) || item;
      this.selectItem(current.id);
      this.toast?.(this.t("imageAdded"));
      return current;
    },

addedElementParent() {
      return document.body || document.documentElement;
    },

createAddedTextElement() {
      const rect = this.defaultAddedElementRect("text");
      const element = document.createElement("div");
      element.dataset.hsmAdded = "text";
      element.dataset.hsmAddedId = uniqueDomId("hsm-text");
      element.setAttribute("data-editable", "true");
      element.setAttribute("data-layout-editable", "true");
      element.innerHTML = escapeAttr(this.t("newTextPlaceholder"));
      element.style.cssText = [
        "position:absolute",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        "min-height:48px",
        "z-index:2147483000",
        "box-sizing:border-box",
        "padding:4px 6px",
        "color:#111827",
        "font-family:Inter, Arial, sans-serif",
        "font-size:32px",
        "font-weight:700",
        "line-height:1.18",
        "letter-spacing:0",
        "text-align:left",
        "overflow:visible"
      ].join(";");
      return element;
    },

createAddedImageElement(dataUrl, dimensions = null) {
      const rect = this.defaultAddedElementRect("image", { dimensions });
      const image = document.createElement("img");
      image.dataset.hsmAdded = "image";
      image.dataset.hsmAddedId = uniqueDomId("hsm-image");
      image.setAttribute("data-layout-editable", "true");
      image.alt = "";
      image.src = dataUrl;
      image.style.cssText = [
        "position:absolute",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        "z-index:2147483000",
        "display:block",
        "box-sizing:border-box",
        "object-fit:cover",
        "object-position:center center"
      ].join(";");
      return image;
    },

readInsertedImageDimensions(dataUrl) {
      return new Promise((resolve) => {
        if (!dataUrl) {
          resolve(null);
          return;
        }

        const image = new Image();
        let settled = false;
        const finish = (dimensions) => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          image.onload = null;
          image.onerror = null;
          resolve(dimensions);
        };
        const timeoutId = window.setTimeout(() => finish(null), 3000);
        image.onload = () => {
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          finish(width > 0 && height > 0 ? { width, height } : null);
        };
        image.onerror = () => finish(null);
        image.src = dataUrl;
      });
    },

defaultAddedElementRect(kind, options = {}) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
      let width;
      let height;
      if (kind === "image") {
        const dimensions = options.dimensions || {};
        const rawRatio = Number(dimensions.width) / Number(dimensions.height);
        const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? clamp(rawRatio, 0.12, 8) : (16 / 9);
        const maxWidth = Math.max(48, viewportWidth - 48);
        const maxHeight = Math.max(48, viewportHeight - 120);
        width = clamp(Math.round(viewportWidth * 0.28), 180, Math.min(420, maxWidth));
        height = width / ratio;
        if (height > maxHeight) {
          height = maxHeight;
          width = height * ratio;
        }
        if (width > maxWidth) {
          width = maxWidth;
          height = width / ratio;
        }
        if (width < 48 && 48 / ratio <= maxHeight) {
          width = 48;
          height = width / ratio;
        }
        if (height < 48 && 48 * ratio <= maxWidth) {
          height = 48;
          width = height * ratio;
        }
      } else {
        width = clamp(Math.round(viewportWidth * 0.34), 240, 520);
        height = 64;
      }
      const left = Math.round(window.scrollX + clamp((viewportWidth - width) / 2, 24, Math.max(24, viewportWidth - width - 24)));
      const top = Math.round(window.scrollY + clamp(viewportHeight * 0.44 - height / 2, 84, Math.max(84, viewportHeight - height - 84)));
      return {
        left: round(left),
        top: round(top),
        width: round(width),
        height: round(height)
      };
    },

itemForAddedElement(element, type) {
      return {
        id: this.idFor(element, type),
        type,
        imageMode: type === "image" ? "img" : undefined,
        element,
        frameElement: element,
        positioned: true,
        added: true
      };
    },

registerAddedItem(item, options = {}) {
      if (!item?.element) {
        return;
      }
      const record = {
        id: item.id,
        type: item.type,
        imageMode: item.imageMode,
        element: item.element,
        parentElement: options.parentElement || item.element.parentElement,
        insertBeforeElement: options.insertBeforeElement || null,
        initialState: this.captureState?.(item) || null
      };
      this.addedItems.set(item.id, record);
      this.markAddedItemModified(item);
    },

markAddedItemModified(item) {
      if (!item?.id) {
        return;
      }
      const existing = this.modified.get(item.id) || {};
      this.modified.set(item.id, {
        type: item.type,
        imageMode: item.imageMode,
        content: true,
        layout: existing.layout || false
      });
    },

addedRootForItem(itemOrRecord) {
      const element = itemOrRecord?.element;
      if (!element) {
        return null;
      }
      const frame = element.parentElement?.matches?.("[data-hsm-image-frame]")
        ? element.parentElement
        : null;
      return frame || element;
    }
  };
})();
