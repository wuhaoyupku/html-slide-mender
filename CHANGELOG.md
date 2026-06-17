# Changelog

## 0.1.8

- Added safe visual scaling in `Move layout` mode using `transform: scale(...)` instead of real width/height changes.
- Added four-corner scale handles for selected layout elements.
- Added a `Resize` sub-mode for writing real `width` / `height` when users need non-proportional width-only, height-only, or freeform size changes.
- Added a compact `Move/scale | Resize | Reset` layout popover so users can choose between safe visual edits and real box sizing.
- Improved reset behavior so movement, scale, and editor-added sizing can be restored together while preserving original transforms and original inline dimensions.

## 0.1.7

- Added a visible `Text/Image` and `Move layout` mode switch in the editor toolbar.
- Added layout micro-adjustment mode for moving visible text, image, card, and block elements by dragging or using arrow keys.
- Preserved layout adjustments in clean source-based export while still removing editor UI and runtime scripts.
- Improved nested layout selection so smaller inner elements remain selectable when larger layout boxes overlap them.
- Added explicit edit-box state feedback: `Boxes on` / `Boxes off`.

## 0.1.6

- Published the initial HTML Slide Mender skill and browser-extension workflow.
- Supported local HTML deck injection, visual text editing, image replacement, and clean source-based HTML export.
