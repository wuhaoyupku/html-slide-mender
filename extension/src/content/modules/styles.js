(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  ns.ui = ns.ui || {};
  const EDITOR_CSS = `
    :host, * {
      box-sizing: border-box;
    }

    .toolbar {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      width: fit-content;
      max-width: min(1180px, calc(100vw - 28px));
      min-height: 48px;
      max-height: 52px;
      border: 1px solid rgba(148, 163, 184, 0.34);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.92);
      color: #172033;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: auto;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 4;
      overflow: hidden;
    }

    .toolbar * {
      flex-shrink: 0;
    }

    .toolbar.is-collapsed .toolbar-body {
      display: none;
    }

    .collapse {
      min-width: 168px;
      min-height: 48px;
      border: 0;
      border-right: 1px solid rgba(148, 163, 184, 0.34);
      border-radius: 0;
      background: linear-gradient(135deg, #102a56, #0f766e);
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 750;
      padding: 0 14px 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      white-space: nowrap;
    }

    .collapse:hover {
      border-color: rgba(148, 163, 184, 0.34);
      background: linear-gradient(135deg, #12356f, #10867d);
      color: #ffffff;
    }

    .brand-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      background: #ffffff;
      color: #0f5fba;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0;
    }

    .brand-text {
      line-height: 1;
    }

    .toolbar-body {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      min-width: 0;
      max-width: max(0px, calc(100vw - 196px));
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .toolbar-body::-webkit-scrollbar {
      display: none;
    }

    .summary {
      min-width: 86px;
      max-width: 156px;
      color: #647084;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mode-switch {
      display: inline-flex;
      align-items: center;
      min-width: max-content;
      padding: 3px;
      border: 1px solid #cfd8e6;
      border-radius: 8px;
      background: #f8fafc;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
    }

    .mode-switch button {
      min-height: 30px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #475569;
      padding: 0 10px;
    }

    .mode-switch button:hover {
      background: #eef4ff;
      color: #1553c7;
    }

    .mode-switch button.is-active {
      background: #1f6fff;
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(31, 111, 255, 0.22);
    }

    .group {
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
    }

    .group-default {
      display: flex;
      flex-wrap: nowrap;
      min-width: max-content;
    }

    .edit-popover {
      position: fixed;
      left: 0;
      top: 0;
      max-width: min(860px, calc(100vw - 20px));
      padding: 8px;
      border: 1px solid rgba(148, 163, 184, 0.42);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.96);
      color: #172033;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: auto;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 3;
    }

    .edit-popover[hidden] {
      display: none;
    }

    .edit-popover .group {
      display: none;
    }

    .edit-popover[data-selection="image"] .group-image {
      display: flex;
    }

    .edit-popover[data-selection="layout"] .group-layout {
      display: flex;
    }

    .edit-popover[data-selection="text"] .group-text {
      display: grid;
    }

    .group-text {
      gap: 6px;
    }

    .text-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
    }

    button, select, input {
      font: inherit;
    }

    button, select, label {
      min-height: 32px;
      border: 1px solid #d6deea;
      border-radius: 7px;
      background: #ffffff;
      color: #172033;
      font-size: 12px;
      font-weight: 650;
    }

    button {
      padding: 0 10px;
      cursor: pointer;
    }

    button:hover {
      border-color: #aebacc;
      background: #f8fafc;
    }

    button.is-active {
      border-color: #1f6fff;
      background: #e8f0ff;
      color: #1553c7;
      box-shadow: inset 0 0 0 1px rgba(31, 111, 255, 0.28);
    }

    button.is-mixed {
      border-color: #8aa7d8;
      background: linear-gradient(135deg, #e8f0ff 0 50%, #ffffff 50% 100%);
      color: #1553c7;
      box-shadow: inset 0 0 0 1px rgba(31, 111, 255, 0.16);
    }

    button.primary {
      border-color: #1f6fff;
      background: #1f6fff;
      color: #ffffff;
    }

    button.primary:hover {
      border-color: #155bd8;
      background: #155bd8;
      color: #ffffff;
    }

    select {
      max-width: 150px;
      padding: 0 8px;
    }

    .combo {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .combo-trigger {
      min-width: 154px;
      justify-content: space-between;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 8px;
    }

    .combo-caret,
    .size-trigger {
      color: #647084;
      font-size: 11px;
      line-height: 1;
    }

    .combo-menu {
      position: fixed;
      left: 0;
      top: 0;
      min-width: 112px;
      max-height: 260px;
      overflow: auto;
      padding: 3px;
      border: 1px solid #cfd8e6;
      border-radius: 6px;
      background: #ffffff;
      box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
      pointer-events: auto;
      z-index: 8;
    }

    .combo-menu[hidden] {
      display: none;
    }

    .combo-option {
      width: 100%;
      min-height: 30px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      border: 0;
      border-radius: 4px;
      padding: 0 10px;
      background: transparent;
      color: #172033;
      white-space: nowrap;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
    }

    .combo-option:hover,
    .combo-option.is-selected {
      background: #edf4ff;
      color: #1553c7;
    }

    .size-label {
      padding-right: 6px;
    }

    .size-combo {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-left: 1px solid #e4ebf5;
      padding-left: 6px;
    }

    .size-trigger {
      min-width: 22px;
      min-height: 24px;
      border: 0;
      padding: 0;
      background: transparent;
    }

    .size-menu {
      min-width: 82px;
    }

    .size-menu[hidden] {
      display: none;
    }

    .size-menu .combo-option {
      justify-content: flex-start;
      min-height: 30px;
    }

    .save-mode select {
      max-width: 118px;
      border: 0;
      min-height: 28px;
      padding: 0 2px;
      background: transparent;
    }

    .size-input {
      width: 44px;
    }

    .color-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .color-swatch {
      width: 18px;
      height: 18px;
      border: 1px solid rgba(82, 96, 113, 0.36);
      border-radius: 4px;
      background: #111827;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
    }

    label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      color: #526071;
    }

    .unit {
      color: #7b8797;
      font-size: 11px;
      font-weight: 700;
    }

    input[type="number"] {
      width: 56px;
      border: 0;
      outline: 0;
      color: #172033;
      background: transparent;
    }

    input[type="text"] {
      width: 72px;
      border: 0;
      outline: 0;
      color: #172033;
      background: transparent;
    }

    input[type="color"] {
      width: 24px;
      height: 24px;
      border: 0;
      padding: 0;
      background: transparent;
    }

    .file-input {
      position: fixed;
      left: -10000px;
      top: -10000px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .underline {
      text-decoration: underline;
    }

    .layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }

    .picker-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 6;
    }

    .picker-layer .pcr-app {
      pointer-events: auto;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .color-menu {
      position: fixed;
      width: 178px;
      padding: 7px;
      border: 1px solid rgba(148, 163, 184, 0.42);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.98);
      color: #172033;
      box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: auto;
      z-index: 7;
    }

    .color-menu[hidden] {
      display: none;
    }

    .color-section + .color-section {
      margin-top: 6px;
    }

    .color-heading {
      margin-bottom: 4px;
      color: #647084;
      font-size: 10px;
      font-weight: 750;
      line-height: 1;
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(10, 13px);
      gap: 2px;
      min-height: 13px;
    }

    .history-grid {
      grid-template-columns: repeat(10, 13px);
      padding: 3px;
      border: 1px solid #edf2f8;
      border-radius: 5px;
      background: #fbfdff;
    }

    .color-option {
      width: 13px;
      min-width: 13px;
      height: 13px;
      min-height: 13px;
      padding: 0;
      border: 1px solid rgba(15, 23, 42, 0.22);
      border-radius: 2px;
      background: var(--hsm-swatch);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.36);
    }

    .color-option:hover,
    .color-option.is-selected {
      border-color: #1f6fff;
      box-shadow: 0 0 0 2px rgba(31, 111, 255, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.42);
    }

    .color-placeholder {
      width: 13px;
      height: 13px;
      border: 1px dashed #d8e0eb;
      border-radius: 2px;
      background: #ffffff;
    }

    .color-more {
      width: 100%;
      margin-top: 7px;
      min-height: 26px;
      border-radius: 6px;
      font-size: 11px;
    }

    .color-menu .pcr-app {
      width: 162px;
      margin-top: 6px;
      position: static !important;
      box-shadow: none;
      border: 1px solid #d8e0eb;
      border-radius: 7px;
    }

    .color-menu .pcr-app:not(.visible) {
      display: none;
    }

    .color-menu .pcr-app[data-theme=nano] .pcr-selection {
      height: 7.8em;
      grid-gap: .4em;
    }

    .color-menu .pcr-app .pcr-swatches {
      display: none;
    }

    .box {
      position: fixed;
      border: 1.5px dashed #1f6fff;
      border-radius: 4px;
      background: rgba(31, 111, 255, 0.035);
      pointer-events: auto;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }

    .box:hover,
    .box.is-selected {
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(31, 111, 255, 0.14);
    }

    .box-image {
      border-color: #16a34a;
      background: rgba(22, 163, 74, 0.04);
    }

    .box-image:hover,
    .box-image.is-selected {
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.14);
    }

    .box-image.is-selected {
      cursor: grab;
    }

    .box-image.is-dragging {
      cursor: grabbing;
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
    }

    .box-image.is-positioned {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.055);
    }

    .box-image.is-positioned:hover,
    .box-image.is-positioned.is-selected {
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
    }

    .box-layout {
      border-color: #7c3aed;
      background: rgba(124, 58, 237, 0.045);
      cursor: grab;
    }

    .box-layout.is-layout-size-mode {
      cursor: default;
    }

    .box-layout:hover,
    .box-layout.is-selected {
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.16);
    }

    .box-layout.is-layout-dragging {
      cursor: grabbing;
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.24);
    }

    .box-layout.is-layout-scaling,
    .box-layout.is-layout-resizing {
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.24);
    }

    .layout-handle {
      position: absolute;
      width: 12px;
      min-width: 12px;
      height: 12px;
      min-height: 12px;
      padding: 0;
      border: 2px solid #ffffff;
      border-radius: 999px;
      background: #7c3aed;
      box-shadow: 0 1px 6px rgba(15, 23, 42, 0.26);
      pointer-events: auto;
    }

    .layout-handle:hover {
      background: #5b21b6;
      border-color: #ffffff;
    }

    .layout-resize-handle {
      background: #0f766e;
    }

    .layout-resize-handle:hover {
      background: #0b5f59;
    }

    .handle-nw {
      left: -7px;
      top: -7px;
      cursor: nwse-resize;
    }

    .handle-ne {
      right: -7px;
      top: -7px;
      cursor: nesw-resize;
    }

    .handle-se {
      right: -7px;
      bottom: -7px;
      cursor: nwse-resize;
    }

    .handle-sw {
      left: -7px;
      bottom: -7px;
      cursor: nesw-resize;
    }

    .handle-n {
      left: 50%;
      top: -7px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }

    .handle-e {
      right: -7px;
      top: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }

    .handle-s {
      left: 50%;
      bottom: -7px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }

    .handle-w {
      left: -7px;
      top: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }

    .box.is-editing {
      pointer-events: none;
      border-style: solid;
    }

    .box.has-overflow {
      border-color: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
    }

    .box-label {
      position: absolute;
      top: -22px;
      left: 0;
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 6px;
      border-radius: 5px;
      background: #172033;
      color: #ffffff;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    .box-image .box-label {
      background: #166534;
    }

    .box-image.is-positioned .box-label {
      background: #b45309;
    }

    .box-layout .box-label {
      background: #5b21b6;
    }

    .box.has-overflow .box-label {
      background: #b45309;
    }

    .toast {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translate(-50%, 12px);
      max-width: min(520px, calc(100vw - 32px));
      padding: 10px 12px;
      border-radius: 9px;
      background: rgba(23, 32, 51, 0.94);
      color: #ffffff;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.25);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-size: 12px;
      z-index: 5;
    }

    .toast.is-visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  `;

  ns.ui.EDITOR_CSS = EDITOR_CSS;
})();
