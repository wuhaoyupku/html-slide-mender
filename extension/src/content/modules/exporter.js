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

  ns.mixins.exporter = {
async download(options = {}) {
      if (!this.active) {
        await this.start();
      }

      const mode = this.setExportMode?.(options.mode || options.exportMode || this.exportMode) || "basic";
      this.commitActiveText();
      const html = await this.serializeCleanHtml(mode);
      const filename = filenameFromTitle(document.title);
      const stats = this.modifiedStats();

      try {
        const response = await chrome.runtime.sendMessage({
          namespace: MESSAGE_NAMESPACE,
          type: "DOWNLOAD_HTML",
          payload: { html, filename }
        });

        if (!response?.ok) {
          throw new Error(response?.code || response?.error || "Download failed.");
        }
      } catch (error) {
        this.fallbackDownload(html, filename);
      }

      const layoutSummary = stats.layout ? ` · ${stats.layout} ${this.t("layoutUnit")}` : "";
      this.toast(`${this.t("htmlReady")} ${stats.text} ${this.t("textUnit")} · ${stats.images} ${this.t("imageUnit")}${layoutSummary}`);
      return {
        ok: true,
        message: this.t("downloadStarted"),
        summary: `${stats.text} ${this.t("textUnit")} · ${stats.images} ${this.t("imageUnit")}${layoutSummary}`
      };
    },

async serializeCleanHtml(mode = "basic") {
      const exportMode = this.normalizeExportMode?.(mode) || "basic";
      const sourceHtmlForExport = typeof skillSourceHtml === "string" ? skillSourceHtml : "";
      if (exportMode === "basic" && sourceHtmlForExport.trim()) {
        return this.serializeSourceBasedHtml(sourceHtmlForExport);
      }

      const styleEntries = exportMode === "full"
        ? await this.collectExportStyleEntries()
        : [];
      const clone = document.documentElement.cloneNode(true);
      this.clearExportStyleMarkers(styleEntries);
      const editorRoot = clone.querySelector(`#${ROOT_ID}`);
      editorRoot?.remove();
      this.sanitizeSerializedClone?.(clone);

      for (const element of clone.querySelectorAll("[data-hsm-editor]")) {
        element.remove();
      }
      this.removeSkillInjectionComments(clone);

      if (exportMode === "full") {
        this.inlineExportStyles(clone, styleEntries);
        await this.bundleExportResources(clone);
        this.normalizeExportUrls(clone);
      }

      const doctype = document.doctype
        ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ""}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ""}>`
        : "<!doctype html>";

      return `${doctype}\n${clone.outerHTML}`;
    },

serializeSourceBasedHtml(sourceHtml) {
      const sourceText = String(sourceHtml || "");
      const sourceDocument = new DOMParser().parseFromString(sourceText, "text/html");
      const patches = this.createSourceExportPatches(sourceDocument);
      if (!patches.length) {
        return sourceText;
      }

      const sourcePatchedHtml = this.serializeSourceStringWithPatches(sourceText, patches);
      if (sourcePatchedHtml) {
        return sourcePatchedHtml;
      }

      for (const patch of patches) {
        this.applySourceExportPatch(sourceDocument, patch);
      }

      const doctype = sourceDocument.doctype
        ? `<!DOCTYPE ${sourceDocument.doctype.name}${sourceDocument.doctype.publicId ? ` PUBLIC "${sourceDocument.doctype.publicId}"` : ""}${sourceDocument.doctype.systemId ? ` "${sourceDocument.doctype.systemId}"` : ""}>`
        : (sourceText.match(/^\s*<!doctype[^>]*>/i)?.[0] || "<!doctype html>");

      return `${doctype}\n${sourceDocument.documentElement.outerHTML}`;
    },

createSourceExportPatches(sourceDocument) {
      const patches = this.createInsertedElementPatches(sourceDocument);
      for (const element of this.exportTextElements()) {
        const patch = this.createSourceExportPatch(element, "text", sourceDocument);
        if (patch) {
          patches.push(patch);
        }
      }

      for (const image of this.exportImageElements()) {
        const patch = this.createSourceExportPatch(image, "img", sourceDocument);
        if (patch) {
          patches.push(patch);
        }
      }

      for (const element of this.exportBackgroundElements()) {
        const patch = this.createSourceExportPatch(element, "background", sourceDocument);
        if (patch) {
          patches.push(patch);
        }
      }

      for (const element of this.exportLayoutElements()) {
        const patch = this.createSourceExportPatch(element, "layout", sourceDocument);
        if (patch) {
          patches.push(patch);
        }
      }

      return patches;
    },

createInsertedElementPatches(sourceDocument) {
      const patches = [];
      for (const record of this.addedItems?.values?.() || []) {
        const patch = this.createInsertedElementPatch(record, sourceDocument);
        if (patch) {
          patches.push(patch);
        }
      }
      return patches;
    },

createInsertedElementPatch(record, sourceDocument) {
      const element = record?.element;
      if (!element?.isConnected) {
        return null;
      }

      const root = this.addedRootForItem?.(record) || element;
      if (!root?.isConnected) {
        return null;
      }

      const parentElement = root.parentElement || record.parentElement || document.body;
      const sourceParent = this.resolveSourceElementForLiveElement(parentElement, sourceDocument) ||
        sourceDocument.body ||
        sourceDocument.documentElement;
      const parentSourcePath = this.sourcePathForElement(sourceParent);
      const html = this.serializeInsertedElementHtml(root);
      if (!parentSourcePath.length || !html) {
        return null;
      }

      return {
        kind: record.type === "image" ? "insert-image" : "insert-text",
        parentSourcePath,
        html
      };
    },

resolveSourceElementForLiveElement(element, sourceDocument) {
      if (!element || !sourceDocument) {
        return null;
      }
      const selector = this.selectorForDraftElement?.(element) || this.selectorForExportElement(element);
      if (!selector) {
        return null;
      }
      const sourceElement = sourceDocument.querySelector(selector);
      return sourceElement?.tagName === element.tagName ? sourceElement : null;
    },

serializeInsertedElementHtml(element) {
      const clone = element.cloneNode(true);
      this.sanitizeInsertedElementClone(clone);
      return clone.outerHTML || "";
    },

sanitizeInsertedElementClone(root) {
      const elements = [root, ...Array.from(root.querySelectorAll?.("*") || [])]
        .filter((element) => element?.nodeType === Node.ELEMENT_NODE);
      for (const element of elements) {
        element.removeAttribute("data-hsm-added");
        element.removeAttribute("data-hsm-added-id");
        element.removeAttribute("data-hsm-image-frame");
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
      }
    },

createSourceExportPatch(element, kind, sourceDocument) {
      if (this.isAddedElementForExport(element)) {
        return null;
      }

      const selector = this.selectorForDraftElement?.(element) || this.selectorForExportElement(element);
      if (!selector) {
        return null;
      }

      const sourceElement = sourceDocument.querySelector(selector);
      if (!sourceElement || sourceElement.tagName !== element.tagName) {
        return null;
      }
      const sourcePath = this.sourcePathForElement(sourceElement);
      if (!sourcePath.length) {
        return null;
      }

      if (kind === "text") {
        const modified = this.isExportElementModified(element, "text");
        if (!modified) {
          return null;
        }
        const html = element.innerHTML;
        const style = element.getAttribute("style") || "";
        const patch = { selector, sourcePath, kind, html };
        if (style !== (sourceElement.getAttribute("style") || "")) {
          patch.style = style;
        }
        if (html === sourceElement.innerHTML && patch.style === undefined) {
          return null;
        }
        return patch;
      }

      if (kind === "background") {
        const modified = this.isExportElementModified(element, "background");
        const style = element.getAttribute("style") || "";
        if (!modified || style === (sourceElement.getAttribute("style") || "")) {
          return null;
        }
        return { selector, sourcePath, kind, style };
      }

      if (kind === "layout") {
        const style = element.getAttribute("style") || "";
        if (style === (sourceElement.getAttribute("style") || "")) {
          return null;
        }
        return { selector, sourcePath, kind, style };
      }

      const src = element.getAttribute("src") || "";
      const srcset = element.getAttribute("srcset") || "";
      const style = element.getAttribute("style") || "";
      const modified = this.isExportElementModified(element, "image");
      if (!modified) {
        return null;
      }
      const patch = { selector, sourcePath, kind, src, srcset };
      if (style !== (sourceElement.getAttribute("style") || "")) {
        patch.style = style;
      }
      const sourcePictureSources = Array.from(sourceElement.closest("picture")?.querySelectorAll("source") || []);
      const currentPictureSources = Array.from(element.closest("picture")?.querySelectorAll("source") || []);
      const pictureSources = currentPictureSources.map((source) => ({
        srcset: source.getAttribute("srcset") || "",
        sizes: source.getAttribute("sizes") || "",
        type: source.getAttribute("type") || "",
        media: source.getAttribute("media") || ""
      }));
      if (JSON.stringify(pictureSources) !== JSON.stringify(sourcePictureSources.map((source) => ({
        srcset: source.getAttribute("srcset") || "",
        sizes: source.getAttribute("sizes") || "",
        type: source.getAttribute("type") || "",
        media: source.getAttribute("media") || ""
      })))) {
        patch.pictureSources = pictureSources;
        patch.pictureSourcePaths = sourcePictureSources.map((source) => this.sourcePathForElement(source));
      }
      if (
        src === (sourceElement.getAttribute("src") || "") &&
        srcset === (sourceElement.getAttribute("srcset") || "") &&
        patch.style === undefined &&
        patch.pictureSources === undefined
      ) {
        return null;
      }
      return patch;
    },

sourcePathForElement(element) {
      const path = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.tagName.toLowerCase();
        let index = 1;
        let sibling = current;
        while ((sibling = sibling.previousElementSibling)) {
          if (sibling.tagName === current.tagName) {
            index += 1;
          }
        }
        path.unshift({ tag, index });
        current = current.parentElement;
      }
      return path;
    },

serializeSourceStringWithPatches(sourceHtml, patches) {
      const tree = this.parseHtmlSourceForExport(sourceHtml);
      if (!tree) {
        return "";
      }

      const edits = [];
      for (const patch of patches) {
        if (patch.kind === "insert-text" || patch.kind === "insert-image") {
          const parentNode = this.findSourceNodeByPath(tree, patch.parentSourcePath);
          if (!parentNode || parentNode.endTagStart == null) {
            return "";
          }
          edits.push({
            start: parentNode.endTagStart,
            end: parentNode.endTagStart,
            text: `\n${patch.html}`
          });
          continue;
        }

        const node = this.findSourceNodeByPath(tree, patch.sourcePath);
        if (!node) {
          return "";
        }

        if (patch.kind === "text") {
          if (node.endTagStart == null) {
            return "";
          }
          if (patch.style !== undefined) {
            this.addSourceAttributeEdit(sourceHtml, edits, node, { style: patch.style });
          }
          edits.push({
            start: node.startTagEnd,
            end: node.endTagStart,
            text: patch.html
          });
          continue;
        }

        if (patch.kind === "background" || patch.kind === "layout") {
          this.addSourceAttributeEdit(sourceHtml, edits, node, { style: patch.style });
          continue;
        }

        const attrs = {
          src: patch.src,
          srcset: patch.srcset
        };
        if (patch.style !== undefined) {
          attrs.style = patch.style;
        }
        this.addSourceAttributeEdit(sourceHtml, edits, node, attrs);

        if (Array.isArray(patch.pictureSources) && Array.isArray(patch.pictureSourcePaths)) {
          for (const [index, state] of patch.pictureSources.entries()) {
            const sourceNode = this.findSourceNodeByPath(tree, patch.pictureSourcePaths[index]);
            if (!sourceNode) {
              return "";
            }
            this.addSourceAttributeEdit(sourceHtml, edits, sourceNode, {
              srcset: state.srcset || "",
              sizes: state.sizes || "",
              type: state.type || "",
              media: state.media || ""
            });
          }
        }
      }

      return this.applySourceStringEdits(sourceHtml, edits);
    },

addSourceAttributeEdit(sourceHtml, edits, node, attrs) {
      let tag = sourceHtml.slice(node.startTagStart, node.startTagEnd);
      for (const [name, value] of Object.entries(attrs)) {
        tag = this.setSourceTagAttribute(tag, name, value);
      }
      edits.push({
        start: node.startTagStart,
        end: node.startTagEnd,
        text: tag
      });
    },

applySourceStringEdits(sourceHtml, edits) {
      let result = sourceHtml;
      let nextStart = sourceHtml.length + 1;
      const ordered = edits
        .map((edit, order) => edit ? ({ ...edit, order }) : edit)
        .filter((edit) => edit && edit.start <= edit.end && edit.start >= 0 && edit.end <= sourceHtml.length)
        .sort((a, b) => (b.start - a.start) || (b.order - a.order));

      if (ordered.length !== edits.length) {
        return "";
      }

      for (const edit of ordered) {
        if (edit.end > nextStart) {
          return "";
        }
        result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
        nextStart = edit.start;
      }
      return result;
    },

setSourceTagAttribute(startTag, name, value) {
      const serializedValue = value == null ? "" : String(value);
      const range = this.findSourceTagAttribute(startTag, name);
      if (!serializedValue) {
        if (!range) {
          return startTag;
        }
        return startTag.slice(0, range.removeStart) + startTag.slice(range.end);
      }

      const attr = `${name}="${escapeAttr(serializedValue)}"`;
      if (range) {
        return startTag.slice(0, range.start) + attr + startTag.slice(range.end);
      }

      const insertAt = this.sourceTagAttributeInsertIndex(startTag);
      return `${startTag.slice(0, insertAt)} ${attr}${startTag.slice(insertAt)}`;
    },

findSourceTagAttribute(startTag, name) {
      const wanted = String(name || "").toLowerCase();
      let index = 1;
      while (index < startTag.length && /[^\s/>]/.test(startTag[index])) {
        index += 1;
      }

      while (index < startTag.length) {
        while (index < startTag.length && /\s/.test(startTag[index])) {
          index += 1;
        }
        if (index >= startTag.length || startTag[index] === ">" || startTag[index] === "/") {
          return null;
        }

        const start = index;
        while (index < startTag.length && /[^\s=/>]/.test(startTag[index])) {
          index += 1;
        }
        const attrName = startTag.slice(start, index);
        while (index < startTag.length && /\s/.test(startTag[index])) {
          index += 1;
        }
        if (startTag[index] === "=") {
          index += 1;
          while (index < startTag.length && /\s/.test(startTag[index])) {
            index += 1;
          }
          const quote = startTag[index] === "\"" || startTag[index] === "'" ? startTag[index++] : "";
          if (quote) {
            while (index < startTag.length && startTag[index] !== quote) {
              index += 1;
            }
            if (startTag[index] === quote) {
              index += 1;
            }
          } else {
            while (index < startTag.length && /[^\s>]/.test(startTag[index])) {
              index += 1;
            }
          }
        }

        const end = index;
        if (attrName.toLowerCase() === wanted) {
          let removeStart = start;
          while (removeStart > 0 && /\s/.test(startTag[removeStart - 1])) {
            removeStart -= 1;
          }
          return { start, end, removeStart };
        }
      }
      return null;
    },

sourceTagAttributeInsertIndex(startTag) {
      let index = startTag.length - 1;
      while (index > 0 && /\s/.test(startTag[index - 1])) {
        index -= 1;
      }
      if (startTag[index - 1] === "/") {
        index -= 1;
        while (index > 0 && /\s/.test(startTag[index - 1])) {
          index -= 1;
        }
      }
      return Math.max(1, index);
    },

parseHtmlSourceForExport(sourceHtml) {
      const source = String(sourceHtml || "");
      const root = { tag: "#document", children: [] };
      const stack = [root];
      let index = 0;
      while (index < source.length) {
        const start = source.indexOf("<", index);
        if (start < 0) {
          break;
        }
        if (source.startsWith("<!--", start)) {
          const end = source.indexOf("-->", start + 4);
          index = end < 0 ? source.length : end + 3;
          continue;
        }
        if (/^<!\[CDATA\[/i.test(source.slice(start, start + 10))) {
          const end = source.indexOf("]]>", start + 9);
          index = end < 0 ? source.length : end + 3;
          continue;
        }
        if (/^<!|^<\?/i.test(source.slice(start, start + 2))) {
          const end = this.findSourceTagEnd(source, start);
          index = end < 0 ? source.length : end;
          continue;
        }
        if (source[start + 1] === "/") {
          const end = this.findSourceTagEnd(source, start);
          const match = source.slice(start, end < 0 ? source.length : end).match(/^<\s*\/\s*([a-zA-Z][^\s/>]*)/);
          if (match) {
            const tag = match[1].toLowerCase();
            for (let stackIndex = stack.length - 1; stackIndex > 0; stackIndex -= 1) {
              if (stack[stackIndex].tag === tag) {
                while (stack.length - 1 >= stackIndex) {
                  const node = stack.pop();
                  if (node.endTagStart == null) {
                    node.endTagStart = start;
                    node.endTagEnd = end;
                  }
                }
                break;
              }
            }
          }
          index = end < 0 ? source.length : end;
          continue;
        }

        const end = this.findSourceTagEnd(source, start);
        if (end < 0) {
          return null;
        }
        const tagMatch = source.slice(start, end).match(/^<\s*([a-zA-Z][^\s/>]*)/);
        if (!tagMatch) {
          index = end;
          continue;
        }

        const tag = tagMatch[1].toLowerCase();
        const parent = stack[stack.length - 1];
        const node = {
          tag,
          parent,
          children: [],
          startTagStart: start,
          startTagEnd: end,
          endTagStart: null,
          endTagEnd: null
        };
        parent.children.push(node);

        if (this.isVoidSourceTag(tag) || /\/\s*>$/.test(source.slice(start, end))) {
          node.endTagStart = end;
          node.endTagEnd = end;
          index = end;
          continue;
        }

        if (this.isRawTextSourceTag(tag)) {
          const close = this.findRawTextSourceClose(source, tag, end);
          if (close) {
            node.endTagStart = close.start;
            node.endTagEnd = close.end;
            index = close.end;
          } else {
            index = end;
          }
          continue;
        }

        stack.push(node);
        index = end;
      }
      return root;
    },

findSourceNodeByPath(tree, path = []) {
      let node = tree;
      for (const segment of path) {
        if (!node?.children) {
          return null;
        }
        const matches = node.children.filter((child) => child.tag === segment.tag);
        node = matches[(segment.index || 1) - 1];
        if (!node) {
          return null;
        }
      }
      return node;
    },

sourceDomElementByPath(sourceDocument, path = []) {
      let current = sourceDocument;
      for (const segment of path) {
        const children = current.nodeType === Node.DOCUMENT_NODE
          ? [current.documentElement].filter(Boolean)
          : Array.from(current.children || []);
        const matches = children.filter((child) => child.tagName?.toLowerCase() === segment.tag);
        current = matches[(segment.index || 1) - 1];
        if (!current) {
          return null;
        }
      }
      return current?.nodeType === Node.ELEMENT_NODE ? current : null;
    },

findSourceTagEnd(source, start) {
      let quote = "";
      for (let index = start + 1; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
          if (char === quote) {
            quote = "";
          }
          continue;
        }
        if (char === "\"" || char === "'") {
          quote = char;
          continue;
        }
        if (char === ">") {
          return index + 1;
        }
      }
      return -1;
    },

findRawTextSourceClose(source, tag, fromIndex) {
      const pattern = new RegExp(`</\\s*${tag}\\s*>`, "i");
      const match = pattern.exec(source.slice(fromIndex));
      if (!match) {
        return null;
      }
      const start = fromIndex + match.index;
      return {
        start,
        end: start + match[0].length
      };
    },

isVoidSourceTag(tag) {
      return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag);
    },

isRawTextSourceTag(tag) {
      return /^(script|style|textarea|title)$/i.test(tag);
    },

applySourceExportPatch(sourceDocument, patch) {
      if (patch.kind === "insert-text" || patch.kind === "insert-image") {
        const parent = this.sourceDomElementByPath(sourceDocument, patch.parentSourcePath) ||
          sourceDocument.body ||
          sourceDocument.documentElement;
        parent?.insertAdjacentHTML?.("beforeend", patch.html || "");
        return;
      }

      const element = sourceDocument.querySelector(patch.selector);
      if (!element) {
        return;
      }

      if (patch.kind === "text") {
        element.innerHTML = patch.html;
        if (patch.style !== undefined) {
          restoreAttr(element, "style", patch.style);
        }
        return;
      }

      if (patch.kind === "background") {
        restoreAttr(element, "style", patch.style);
        return;
      }

      if (patch.kind === "layout") {
        restoreAttr(element, "style", patch.style);
        return;
      }

      restoreAttr(element, "src", patch.src);
      restoreAttr(element, "srcset", patch.srcset);
      if (patch.style !== undefined) {
        restoreAttr(element, "style", patch.style);
      }
      if (Array.isArray(patch.pictureSources)) {
        const sources = Array.from(element.closest("picture")?.querySelectorAll("source") || []);
        for (const [index, state] of patch.pictureSources.entries()) {
          const source = sources[index];
          if (!source) {
            continue;
          }
          restoreAttr(source, "srcset", state.srcset || "");
          restoreAttr(source, "sizes", state.sizes || "");
          restoreAttr(source, "type", state.type || "");
          restoreAttr(source, "media", state.media || "");
        }
      }
    },

exportTextElements() {
      const raw = Array.from(document.querySelectorAll(TEXT_SELECTOR))
        .filter((element) => this.isExportTextElement(element));
      return this.filterNestedText?.(raw) || raw;
    },

isExportTextElement(element) {
      if (!this.isExportPageElement(element) || element.matches(EXCLUDED_SELECTOR)) {
        return false;
      }
      const isAddedText = element.dataset.hsmAdded === "text";
      const text = normalizeText(element.innerText || element.textContent || "");
      if (!isAddedText && text.length < 2) {
        return false;
      }
      const tag = element.tagName.toLowerCase();
      if (!element.matches(BLOCK_TEXT_SELECTOR) && element.querySelector(BLOCK_TEXT_SELECTOR)) {
        return false;
      }
      if (tag === "div" && !element.hasAttribute("data-editable") && !isAddedText) {
        if (element.querySelector(BLOCK_TEXT_SELECTOR)) {
          return false;
        }
      }
      return true;
    },

exportImageElements() {
      return Array.from(document.querySelectorAll("img, picture img"))
        .filter((element) => this.isExportPageElement(element));
    },

exportBackgroundElements() {
      return Array.from(document.body?.querySelectorAll("*") || [])
        .filter((element) => {
          if (!this.isExportPageElement(element) || element.matches(EXCLUDED_SELECTOR)) {
            return false;
          }
          const inline = element.getAttribute("style") || "";
          const computed = getComputedStyle(element).backgroundImage || "";
          return /background-image\s*:/i.test(inline) || /url\(/i.test(computed) || element.hasAttribute("data-image-slot");
        });
    },

exportLayoutElements() {
      return (this.layoutElementsForExport?.() || [])
        .filter((element) => this.isExportPageElement(element));
    },

isExportPageElement(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      if (element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) {
        return false;
      }
      if (element.closest?.("[data-hsm-editor]")) {
        return false;
      }
      return element.ownerDocument === document;
    },

isAddedElementForExport(element) {
      if (!element?.matches) {
        return false;
      }
      return Boolean(
        element.matches("[data-hsm-added]") ||
        element.closest("[data-hsm-added]") ||
        element.matches("[data-hsm-image-frame]") && element.querySelector("[data-hsm-added]")
      );
    },

sanitizeSerializedClone(clone) {
      for (const element of clone.querySelectorAll("[data-hsm-added], [data-hsm-added-id], [data-hsm-image-frame]")) {
        element.removeAttribute("data-hsm-added");
        element.removeAttribute("data-hsm-added-id");
        element.removeAttribute("data-hsm-image-frame");
      }
    },

isExportElementModified(element, kind) {
      if (!element || !this.elementIds?.has(element)) {
        return false;
      }
      return this.modified?.has(this.idFor(element, kind)) || false;
    },

selectorForExportElement(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE || element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) {
        return "";
      }

      const escapedId = element.id ? this.escapeCssForExport(element.id) : "";
      if (escapedId) {
        const selector = `#${escapedId}`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }

      const segments = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document) {
        const tag = current.tagName.toLowerCase();
        if (current === document.documentElement) {
          segments.unshift(tag);
          break;
        }
        let index = 1;
        let sibling = current;
        while ((sibling = sibling.previousElementSibling)) {
          if (sibling.tagName === current.tagName) {
            index += 1;
          }
        }
        segments.unshift(`${tag}:nth-of-type(${index})`);
        current = current.parentElement;
      }
      return segments.join(" > ");
    },

escapeCssForExport(value) {
      if (window.CSS?.escape) {
        return window.CSS.escape(value);
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
    },

removeSkillInjectionComments(clone) {
      const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
      const comments = [];
      while (walker.nextNode()) {
        const value = walker.currentNode.nodeValue || "";
        if (/html-slide-mender-skill:(?:start|end)/i.test(value)) {
          comments.push(walker.currentNode);
        }
      }
      for (const comment of comments) {
        comment.remove();
      }
    },

async collectExportStyleEntries() {
      const entries = [];
      const seen = new Set();
      let index = 0;

      for (const sheet of Array.from(document.styleSheets || [])) {
        if (!sheet || seen.has(sheet)) {
          continue;
        }
        seen.add(sheet);

        const ownerNode = sheet.ownerNode;
        if (ownerNode?.nodeType === Node.ELEMENT_NODE && ownerNode.closest?.(`#${ROOT_ID}`)) {
          continue;
        }

        const marker = `hsm-export-style-${index++}`;
        const href = sheet.href || ownerNode?.getAttribute?.("href") || "";
        const baseHref = sheet.href || ownerNode?.baseURI || document.baseURI;
        if (ownerNode?.nodeType === Node.ELEMENT_NODE) {
          ownerNode.setAttribute("data-hsm-export-style-id", marker);
        }

        const cssText = this.readStylesheetText(sheet, baseHref, new Set()) ||
          await this.fetchStylesheetText(href, baseHref);

        entries.push({
          marker,
          ownerNode,
          href,
          media: ownerNode?.getAttribute?.("media") || "",
          disabled: Boolean(sheet.disabled || ownerNode?.disabled),
          cssText
        });
      }

      for (const sheet of Array.from(document.adoptedStyleSheets || [])) {
        if (!sheet || seen.has(sheet)) {
          continue;
        }
        seen.add(sheet);
        entries.push({
          marker: `hsm-export-adopted-${index++}`,
          ownerNode: null,
          href: "",
          media: "",
          disabled: false,
          cssText: this.readStylesheetText(sheet, document.baseURI, new Set())
        });
      }

      return entries;
    },

async fetchStylesheetText(href, baseHref) {
      const absolute = this.absoluteUrl(href, baseHref);
      if (!absolute || this.isNonPortableUrl(absolute)) {
        return null;
      }

      try {
        const response = await fetch(absolute, {
          credentials: "omit",
          cache: "force-cache"
        });
        if (!response.ok) {
          return null;
        }
        return this.rewriteCssUrls(await response.text(), absolute);
      } catch (_error) {
        return null;
      }
    },

clearExportStyleMarkers(entries) {
      for (const entry of entries) {
        entry.ownerNode?.removeAttribute?.("data-hsm-export-style-id");
      }
    },

readStylesheetText(sheet, baseHref, seen) {
      if (!sheet || seen.has(sheet)) {
        return "";
      }
      seen.add(sheet);

      let rules;
      try {
        rules = Array.from(sheet.cssRules || []);
      } catch (_error) {
        return null;
      }

      return rules.map((rule) => {
        if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
          const imported = this.readStylesheetText(rule.styleSheet, rule.href || baseHref, seen);
          if (imported) {
            const media = rule.media?.mediaText;
            return media ? `@media ${media} {\n${imported}\n}` : imported;
          }
        }
        return this.rewriteCssUrls(rule.cssText || "", baseHref);
      }).join("\n");
    },

inlineExportStyles(clone, entries) {
      const head = clone.querySelector("head") || clone;
      for (const entry of entries) {
        const target = entry.ownerNode
          ? clone.querySelector(`[data-hsm-export-style-id="${entry.marker}"]`)
          : null;

        if (entry.disabled || !entry.cssText) {
          if (target) {
            target.removeAttribute("data-hsm-export-style-id");
          }
          continue;
        }

        const style = clone.ownerDocument.createElement("style");
        style.setAttribute("data-hsm-export-source", entry.href ? this.absoluteUrl(entry.href, document.baseURI) : "inline");
        if (entry.media) {
          style.setAttribute("media", entry.media);
        }
        style.textContent = entry.cssText;

        if (target) {
          target.replaceWith(style);
        } else {
          head.appendChild(style);
        }
      }
    },

async bundleExportResources(clone) {
      const cache = new Map();
      const imageAttributes = [
        ["img", "src"],
        ["input", "src"],
        ["source", "src"],
        ["video", "poster"],
        ["image", "href"]
      ];

      for (const [selector, attr] of imageAttributes) {
        for (const element of clone.querySelectorAll(`${selector}[${attr}]`)) {
          const dataUrl = await this.resourceAsDataUrl(element.getAttribute(attr), document.baseURI, cache);
          if (dataUrl) {
            element.setAttribute(attr, dataUrl);
          }
        }
      }

      for (const element of clone.querySelectorAll("image")) {
        const href = element.getAttribute("xlink:href");
        const dataUrl = await this.resourceAsDataUrl(href, document.baseURI, cache);
        if (dataUrl) {
          element.setAttribute("xlink:href", dataUrl);
        }
      }

      for (const element of clone.querySelectorAll("[srcset]")) {
        element.setAttribute("srcset", await this.bundleSrcset(element.getAttribute("srcset"), document.baseURI, cache));
      }

      for (const element of clone.querySelectorAll("[style]")) {
        element.setAttribute("style", await this.bundleCssUrls(element.getAttribute("style"), document.baseURI, cache));
      }

      for (const style of clone.querySelectorAll("style")) {
        style.textContent = await this.bundleCssUrls(style.textContent || "", document.baseURI, cache);
      }
    },

async bundleSrcset(value, baseHref, cache) {
      const candidates = [];
      for (const candidate of String(value || "").split(",")) {
        const parts = candidate.trim().split(/\s+/);
        if (!parts[0]) {
          continue;
        }
        const dataUrl = await this.resourceAsDataUrl(parts[0], baseHref, cache);
        candidates.push([dataUrl || this.absoluteUrl(parts[0], baseHref), ...parts.slice(1)].join(" "));
      }
      return candidates.join(", ");
    },

async bundleCssUrls(cssText, baseHref, cache) {
      const text = String(cssText || "");
      const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
      let result = "";
      let lastIndex = 0;

      for (const match of text.matchAll(pattern)) {
        result += text.slice(lastIndex, match.index);
        const rawUrl = match[2];
        const url = String(rawUrl || "").trim();
        if (!url || this.isNonPortableUrl(url)) {
          result += match[0];
        } else {
          const dataUrl = await this.resourceAsDataUrl(url, baseHref, cache);
          const nextUrl = dataUrl || this.absoluteUrl(url, baseHref);
          result += `url("${this.escapeCssUrl(nextUrl)}")`;
        }
        lastIndex = match.index + match[0].length;
      }

      return result + text.slice(lastIndex);
    },

async resourceAsDataUrl(value, baseHref, cache) {
      const absolute = this.absoluteUrl(value, baseHref);
      if (!absolute || this.isNonPortableUrl(absolute)) {
        return absolute && absolute.startsWith("data:") ? absolute : null;
      }

      if (cache.has(absolute)) {
        return cache.get(absolute);
      }

      try {
        const response = await fetch(absolute, {
          credentials: "omit",
          cache: "force-cache"
        });
        if (!response.ok) {
          cache.set(absolute, null);
          return null;
        }
        const dataUrl = await this.blobToDataUrl(await response.blob());
        cache.set(absolute, dataUrl);
        return dataUrl;
      } catch (_error) {
        cache.set(absolute, null);
        return null;
      }
    },

blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Failed to bundle resource."));
        reader.readAsDataURL(blob);
      });
    },

normalizeExportUrls(clone) {
      const base = clone.querySelector("base[href]");
      if (base) {
        base.setAttribute("href", this.absoluteUrl(base.getAttribute("href"), document.baseURI));
      }

      const urlAttributes = [
        ["a", "href"],
        ["area", "href"],
        ["link", "href"],
        ["script", "src"],
        ["img", "src"],
        ["image", "href"],
        ["source", "src"],
        ["video", "src"],
        ["audio", "src"],
        ["track", "src"],
        ["iframe", "src"],
        ["embed", "src"],
        ["object", "data"],
        ["form", "action"]
      ];

      for (const [selector, attr] of urlAttributes) {
        for (const element of clone.querySelectorAll(`${selector}[${attr}]`)) {
          element.setAttribute(attr, this.absoluteUrl(element.getAttribute(attr), document.baseURI));
        }
      }

      for (const element of clone.querySelectorAll("image")) {
        const href = element.getAttribute("xlink:href");
        if (href) {
          element.setAttribute("xlink:href", this.absoluteUrl(href, document.baseURI));
        }
      }

      for (const element of clone.querySelectorAll("[srcset]")) {
        element.setAttribute("srcset", this.absoluteSrcset(element.getAttribute("srcset"), document.baseURI));
      }

      for (const element of clone.querySelectorAll("[style]")) {
        element.setAttribute("style", this.rewriteCssUrls(element.getAttribute("style"), document.baseURI));
      }

      for (const style of clone.querySelectorAll("style")) {
        style.textContent = this.rewriteCssUrls(style.textContent || "", document.baseURI);
      }
    },

absoluteSrcset(value, baseHref) {
      return String(value || "").split(",").map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        if (!parts[0]) {
          return "";
        }
        return [this.absoluteUrl(parts[0], baseHref), ...parts.slice(1)].join(" ");
      }).filter(Boolean).join(", ");
    },

rewriteCssUrls(cssText, baseHref) {
      return String(cssText || "").replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, rawUrl) => {
        const url = String(rawUrl || "").trim();
        if (!url || this.isNonPortableUrl(url)) {
          return `url(${rawUrl})`;
        }
        return `url("${this.escapeCssUrl(this.absoluteUrl(url, baseHref))}")`;
      });
    },

absoluteUrl(value, baseHref) {
      const url = String(value || "").trim();
      if (!url || this.isNonPortableUrl(url)) {
        return url;
      }
      try {
        return new URL(url, baseHref || document.baseURI).href;
      } catch (_error) {
        return url;
      }
    },

isNonPortableUrl(value) {
      return /^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:|about:|chrome:|chrome-extension:)/i.test(String(value || "").trim());
    },

escapeCssUrl(value) {
      return String(value || "").replace(/["\\\n\r\f]/g, (char) => `\\${char}`);
    },

fallbackDownload(html, filename) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.documentElement.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
})();
