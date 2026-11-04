# Changelog

All notable changes to Flashcard Canvas are recorded here. Versions follow [Semantic Versioning](https://semver.org/).

## 0.3.0 — 2026-11-04

### New

- **Colors follow the tree.** A box added with Tab takes its parent's color, and one added with Enter the color of the box you pressed it on. Arrows take the color of the box they leave from. Recoloring a box from the canvas's color menu recolors the boxes below it in the tree, and their arrows.

## 0.2.0 — 2026-11-03

A general mindmap plugin now, with callouts as a mode.

### Changed

- **The mindmap works on every canvas and every kind of box.** Fitting the height (text boxes), Tab and Enter (from any box but a group), and Tidy layout and Keep tidy (all boxes but groups and what's inside them) no longer need callout cards.
- **Callout mode is set per canvas**, with a new button in the canvas controls and a command. New boxes start as a callout card, title clicks fold the card, and fold all, unfold all and study mode are there only in callout mode. Outside it, new boxes are empty text boxes, as in a plain canvas.
- **Keep tidy starts off in canvases that already have boxes**, and on (by default) in new ones, so the plugin never rearranges an existing canvas by itself.
- **Boxes are fitted only after their text or width changes**, so opening a canvas doesn't resize boxes you sized by hand.
- Settings from 0.1.0 carry over: canvases with a Keep tidy setting keep it and get callout mode.

## 0.1.0 — 2026-10-27

First version, for testing.

- New text boxes start as a foldable callout card, with the question selected.
- Clicking a card's title folds or unfolds it and saves the `+`/`-`.
- Cards resize to fit what they show.
- Tab adds a child card, Enter a sibling.
- Tidy layout arranges the cards as a tree; Keep tidy (per canvas, on by default) does it after every change.
- Fold all and unfold all.
- Study mode hides every answer; click a card or press N to reveal. The file keeps the layout from before study mode.
