# Changelog

## 0.1.13

- Added content-mode direct layout handles for selected text and image elements.
- Users can now drag the selected border or label to move an element, drag side handles to resize width/height, and drag corner handles to resize proportionally.
- Default image dragging now moves the image frame; hold Option/Alt to adjust the image content inside the frame.
- Content mode now supports multi-select with Shift / Cmd / Ctrl and exposes alignment / same-size controls for mixed text-image selections.
- Improved overlapping box hit order so smaller text/image elements are easier to select when layouts overlap.
- Moved the edit popover to the side when top/bottom placement would cover large-element handles.
- Removed the top-level Text/Image vs. Move layout switch from the toolbar.
- Shortened the toolbar status to "Ready" / "N changed" so it fits in narrow spaces.
- Fixed Ctrl/Cmd+Z when focus is on editor UI such as image handles or popover controls.
- Fixed first-drag undo for images whose frame originally had no inline style, and covered sequential image drags so they do not snap back.
- Added a movable cursor when hovering a selected text box's draggable border or label.

## 0.1.12

- Added toolbar actions for inserting new text blocks and new images.
- Source-based `basic` export now writes inserted text/images back into the original HTML.

## 0.1.11

- Renamed the public ClawHub listing, skill title, and visible descriptions to HTML Mender.

## 0.1.10

- Added temporary multi-selection in layout mode using `Shift` / `Cmd` / `Ctrl` click.
- Added group movement, safe scaling, real resize, reset, alignment, and same-size layout actions for the current multi-selection.
- Added batch undo/redo so one group layout operation reverts as a single step.

## 0.1.9

- Fixed local injection for complex HTML files that include embedded `</body>` strings inside JavaScript data.
- Changed clean export to return the original source unchanged when there are no edits.
- Limited source-based export patches to editor-modified elements and applied those patches directly to the source string before falling back to DOM serialization.

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

- Published the initial HTML Mender skill and browser-extension workflow.
- Supported local HTML deck injection, visual text editing, image replacement, and clean source-based HTML export.
