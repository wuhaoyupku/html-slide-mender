(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  const { DEFAULT_LANG } = ns.constants;

  class HtmlSlideMender {
    constructor() {
      this.active = false;
      this.showBoxes = true;
      this.collapsed = false;
      this.host = null;
      this.shadow = null;
      this.layer = null;
      this.toolbar = null;
      this.editPopover = null;
      this.toastEl = null;
      this.fileInput = null;
      this.items = new Map();
      this.elementIds = new WeakMap();
      this.nextId = 1;
      this.selectedId = null;
      this.selectedIds = new Set();
      this.editingTextId = null;
      this.textEditRestore = null;
      this.textEditBefore = null;
      this.savedTextRange = null;
      this.lang = DEFAULT_LANG;
      this.exportMode = "basic";
      this.editMode = "content";
      this.layoutToolMode = "moveScale";
      this.colorHistory = [];
      this.colorPickers = new Map();
      this.openCombo = null;
      this.openColorControl = null;
      this.colorTargetId = null;
      this.colorMenuPicker = null;
      this.isSyncingColorControls = false;
      this.imageAdjustments = new Map();
      this.layoutAdjustments = new Map();
      this.pendingImageReplaceId = null;
      this.pendingImageAddAnchor = null;
      this.addedItems = new Map();
      this.originalStates = new Map();
      this.modified = new Map();
      this.undoStack = [];
      this.redoStack = [];
      this.drag = null;
      this.layoutDrag = null;
      this.layoutScaleDrag = null;
      this.layoutResizeDrag = null;
      this.suppressLayoutClickUntil = 0;
      this.scanTimer = 0;
      this.startupScanTimers = [];
      this.removers = [];
    }
  }

  Object.assign(
    HtmlSlideMender.prototype,
    ns.mixins.lifecycle,
    ns.mixins.color,
    ns.mixins.ui,
    ns.mixins.scanner,
    ns.mixins.text,
    ns.mixins.image,
    ns.mixins.insert,
    ns.mixins.layout,
    ns.mixins.history,
    ns.mixins.exporter,
    ns.mixins.draft
  );

  ns.HtmlSlideMender = HtmlSlideMender;
})();
