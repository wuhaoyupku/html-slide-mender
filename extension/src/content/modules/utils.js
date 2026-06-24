(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  const { DEFAULT_LANG } = ns.constants;

  function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function isRendered(style) {
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0.02;
  }

  function isVisibleRect(rect, minWidth, minHeight) {
    return rect.width >= minWidth &&
      rect.height >= minHeight &&
      rect.width * rect.height >= minWidth * minHeight;
  }

  function intersectsViewport(rect) {
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const right = Math.min(rect.right, window.innerWidth);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    return right - left > 2 && bottom - top > 2;
  }

  function hasTextOverflow(element) {
    return element.scrollWidth > element.clientWidth + 2 ||
      element.scrollHeight > element.clientHeight + 2;
  }

  function round(value, precision = 1) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sameState(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function restoreAttr(element, name, value) {
    if (value === null || value === undefined || value === "") {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("\"", "&quot;");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  function toHexColor(value) {
    const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
    if (!match || match[4] === "0") {
      return "";
    }
    return `#${[match[1], match[2], match[3]]
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function filenameFromTitle(title) {
    const safe = normalizeText(title || "edited-html-slide")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .slice(0, 90);
    return `${safe || "edited-html-slide"}-edited.html`;
  }

  function normalizeLanguage(language) {
    return language === "en" ? "en" : DEFAULT_LANG;
  }

  function uniqueDomId(prefix = "hsm-added") {
    const safePrefix = String(prefix || "hsm-added").replace(/[^a-zA-Z0-9_-]/g, "-");
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const token = window.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const id = `${safePrefix}-${token}`;
      const selector = `[data-hsm-added-id="${window.CSS?.escape ? CSS.escape(id) : id}"]`;
      if (!document.querySelector(selector)) {
        return id;
      }
    }
    return `${safePrefix}-${Date.now().toString(36)}`;
  }

  ns.utils = {
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
    normalizeLanguage,
    uniqueDomId
  };
})();
