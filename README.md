# Flashcard Canvas

**Mindmaps on Obsidian's canvas, with an optional flashcard mode.**

On any canvas, Flashcard Canvas makes boxes fit their text, lets you add connected boxes with Tab and Enter, and arranges the boxes as a tree along the arrows between them, keeping it tidy as you work.

Turn on **callout mode** for a canvas and its boxes become flashcards written as foldable callouts: the title is the question, the body the answer. Click the title to fold or unfold a card, and use study mode to hide every answer until you reveal it.

Everything stays in the `.canvas` file, as plain JSON Canvas boxes and arrows. Without the plugin, the canvas still opens in Obsidian as it was.

A sibling of [Flashcard Bank](https://github.com/jcesguerram/flashcard-bank), which keeps flashcards in your notes instead.

## The mindmap, on every canvas

### Boxes fit their text

A text box grows and shrinks to fit what it shows, after you edit it, change its width, or (in callout mode) fold or unfold it. Only the height changes.

- **Boxes you haven't touched keep their size.** Opening a canvas never resizes anything; a box is fitted only after its text or width changes.
- **Only text boxes.** Notes, images, PDFs and web pages keep the size you give them.
- You can still make a box taller by dragging its bottom edge; it's fitted again only when its text or width changes.

### Adding connected boxes

With a box selected (not being edited):

| Key | Adds |
|-----|------|
| **Tab** | A child: a new text box to its right, with an arrow from the selected box |
| **Enter** | A sibling: a new text box right below it, under the same parent. A box without a parent gets a new box below it, unconnected. |

The new box opens for editing. Any kind of box can be the parent: a text box, a note, an image. Both keys can be turned off in the settings, and both are commands too (*Add a child box*, *Add a sibling box*), so you can give them other hotkeys.

Turning the keys on means Enter no longer starts editing the selected box, as it does in a plain canvas. Double-click the box instead.

### Layout

**Tidy layout** (the network icon in the canvas controls) arranges the boxes as a tree that follows the arrows: each box's children in a column to its right, stacked top to bottom and centered on it, and separate trees stacked below each other. Arrows from a box to its children are redrawn from its right side to their left side.

- Siblings keep the top-to-bottom order they have, so dragging a box above its sibling and tidying swaps them.
- A box with arrows from two parents is placed under one of them; the other arrow is drawn across.
- The first tree's root stays where it is, so the map doesn't jump.
- **Groups stay where they are, and so does everything entirely inside a group.** Moving those boxes would take them out of their group. A box that only partly overlaps a group is arranged like any other.

**Keep tidy** (the magnet icon) runs the same arrangement after every change: resizing, adding, deleting, linking, or dropping a dragged box. This is what makes the map reflow when a box's size changes. With it on, a box you drag elsewhere goes back into the tree; only its order among its siblings sticks. Turn it off to place boxes freely, and use **Tidy layout** when you want a cleanup.

Keep tidy is set per canvas. It starts **on in new canvases** (ones with no boxes when the plugin first opens them) and **off in canvases that already have boxes**, so installing the plugin never rearranges your existing canvases.

## Callout mode

Turned on per canvas with the callout button (a square with a chevron) in the canvas controls, or the command *Toggle callout mode for this canvas*.

### What counts as a card

A text box whose first line opens a foldable callout:

```markdown
> [!pregunta]+ What is present value?
> The value today of money you will receive in the future.
```

- **The `+` or `-`** after the type is what makes it a card: `+` means open (answer showing), `-` folded.
- **Any callout type works.** New cards use the type from the settings (`pregunta` by default).
- Other boxes on the canvas (plain text, notes, images) stay ordinary boxes, and take part in the layout as usual.

### New cards

In callout mode, every new text box starts as a card, with the question placeholder selected so you can type straight away:

```markdown
> [!pregunta]+ p
> a
```

That goes for boxes made by double-clicking the canvas, dragging a card from the bottom bar, or with Tab and Enter. Boxes you paste text into, and boxes already on the canvas, are not changed.

### Folding

Click a card's title to fold or unfold it. The `+`/`-` in the card's text changes, so the folding is saved with the canvas, and the box resizes to fit. **Fold all cards** and **Unfold all cards** in the canvas controls (or the command palette) do it for every card on the canvas.

### Study mode

**Study mode** (the graduation cap) hides every answer.

- **Click a card** to reveal it, and again to hide it.
- **N**, or the **Next card** button, reveals the next hidden card, following the arrows from the first box, level by level. Cards inside groups come last.
- A badge at the top shows how many cards are revealed.

Study mode doesn't change the file. Cards shrink while their answers are hidden (and the map reflows if Keep tidy is on), but the canvas keeps saving the layout from before study mode, and leaving study mode puts every box back where it was. Folding, Tab and Enter, and the layout buttons are off while studying.

### Colors

Box colors work as usual: the canvas colors the box's border and background, and the callout keeps its own color.

## Commands

| Command | Does |
|---------|------|
| Tidy layout | Arranges the boxes once |
| Toggle keep tidy for this canvas | |
| Add a child box / Add a sibling box | Same as Tab and Enter |
| Toggle callout mode for this canvas | |
| Fold all cards / Unfold all cards | Sets `-` or `+` on every card (callout mode) |
| Toggle study mode | Callout mode |
| Reveal the next card | In study mode |

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| Add boxes with the keyboard | On | Tab and Enter add child and sibling boxes |
| Keep tidy in new canvases | On | Keep tidy for canvases with no boxes when the plugin first opens them. Canvases that already had boxes start with it off |
| **Callout mode** | | |
| Callout type | `pregunta` | The type in `> [!type]+` |
| Question placeholder | `p` | The title of a new card |
| Answer placeholder | `a` | The body of a new card |
| New cards start open | On | New cards start with `+` (on) or `-` (off) |

Callout mode and Keep tidy for each canvas are kept in the plugin's settings, by file path, and follow the canvas when you rename or move it.

The callout type has no special look unless your theme or a CSS snippet gives it one; otherwise Obsidian shows it like a plain note callout.

## Installation

Not in Obsidian's community plugins yet. Build it (below), then copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/flashcard-canvas/` and enable **Flashcard Canvas** in Settings → Community plugins.

It requires Obsidian 1.7.2 or later. It makes no network requests.

## How it works

Obsidian's canvas has no public API for plugins, so this plugin works with the canvas's internal objects, the way other canvas plugins do. It checks for each internal method before using it, so if a future Obsidian version changes them, a feature stops working instead of the canvas breaking. If something stops working after an Obsidian update, that's the likely reason.

| File | Role |
|------|------|
| `src/callout.ts` | Pure card logic, no Obsidian imports: recognizing a card, its fold marker, the template, where the title is. |
| `src/layout.ts` | Pure layout logic, no Obsidian imports: which boxes are arranged, the tree from the arrows, tidy positions, study order, arrow sides. |
| `src/board.ts` | Everything on one open canvas: fitting boxes, Tab and Enter, Tidy layout and Keep tidy, callout mode (folding, study mode), the canvas controls. |
| `src/main.ts` | Plugin entry: hooks into the canvas (new boxes, saves, loading), commands, per-canvas preferences. |
| `src/internals.ts` | The parts of the canvas's internal objects the plugin uses. |
| `src/settings.ts` | Settings and their tab. |

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run dev     # rebuild main.js on every change
npm run build   # typecheck, then a production build of main.js
npm run lint    # ESLint with Obsidian's plugin rules
npm test        # unit tests for src/callout.ts and src/layout.ts
```

To release, bump the version (`npm version patch`, or `minor` / `major`) and push with `git push --follow-tags`. The release workflow builds the plugin and attaches `main.js`, `manifest.json` and `styles.css` to a draft release.

## License

[MIT](LICENSE)
