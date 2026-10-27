# Flashcard Canvas

**Flashcards that live on an Obsidian canvas, arranged as a mindmap.**

Every box on the canvas is a flashcard written as a foldable callout: the callout's title is the question, its body the answer. Click the title to fold or unfold the card. Boxes resize to fit what they show, the cards arrange themselves as a tree along the arrows between them, and study mode hides every answer until you reveal it.

Everything stays in the `.canvas` file, as plain JSON Canvas text boxes. Without the plugin, the canvas still opens in Obsidian with the same callouts.

A sibling of [Flashcard Bank](https://github.com/jcesguerram/flashcard-bank), which keeps flashcards in your notes instead.

## What counts as a card

A text box whose first line opens a foldable callout:

```markdown
> [!pregunta]+ What is present value?
> The value today of money you will receive in the future.
```

- **The `+` or `-`** after the type is what makes it a card: `+` means open (answer showing), `-` folded.
- **Any callout type works.** New cards use the type from the settings (`pregunta` by default).
- **Everything else is left alone:** other text boxes, notes, links, groups, and arrows to or from them.

## Using it

### New cards

Every new text box starts as a card, with the question placeholder selected so you can type straight away:

```markdown
> [!pregunta]+ p
> a
```

That goes for boxes made by double-clicking the canvas, dragging a card from the bottom bar, or with the keyboard (below). Boxes you paste text into, and boxes already in your canvases, are not changed.

### Folding

Click a card's title to fold or unfold it. The `+`/`-` in the card's text changes, so the folding is saved with the canvas. **Fold all cards** and **Unfold all cards** in the canvas controls (or the command palette) do it for the whole canvas.

### Size

A card's box grows and shrinks to fit what it shows: when you fold or unfold it, edit it, or change its width. Only the height changes.

### Adding connected cards

With a card selected (not being edited):

| Key | Adds |
|-----|------|
| **Tab** | A child: a new card to its right, with an arrow from the selected card |
| **Enter** | A sibling: a new card right below it, under the same parent. A card without a parent gets a new card below it, unconnected. |

The new card opens for editing with its question selected. Both can be turned off in the settings, and both are commands too (*Add a child card*, *Add a sibling card*), so you can give them other hotkeys.

### Layout

**Tidy layout** (the network icon in the canvas controls) arranges the cards as a tree that follows the arrows: each card's children in a column to its right, stacked top to bottom and centered on it, and separate trees stacked below each other. Arrows from a card to its children are redrawn from its right side to their left side.

- Siblings keep the top-to-bottom order they have, so dragging a card above its sibling and tidying swaps them.
- A card with arrows from two parents is placed under one of them; the other arrow is drawn across.
- The first tree's root stays where it is, so the map doesn't jump.

**Keep tidy** (the magnet icon) runs the same arrangement after every change: folding, resizing, adding, deleting, linking, or dropping a dragged card. This is what makes the map reflow when a card's size changes. With it on, a card you drag elsewhere goes back into the tree; only its order among its siblings sticks. Turn it off to place cards freely, and use **Tidy layout** when you want a cleanup.

Keep tidy is set per canvas, and is on by default (see *Settings*).

### Study mode

**Study mode** (the graduation cap) hides every answer.

- **Click a card** to reveal it, and again to hide it.
- **N**, or the **Next card** button, reveals the next hidden card, following the arrows from the first card, level by level.
- A badge at the top shows how many cards are revealed.

Study mode doesn't change the file. Cards shrink while their answers are hidden (and the map reflows if Keep tidy is on), but the canvas keeps saving the layout from before study mode, and leaving study mode puts every card back where it was. Folding, Tab and Enter, and the layout buttons are off while studying.

### Colors

Card colors work as usual: the canvas colors the box's border and background, and the callout keeps its own color.

## Commands

| Command | Does |
|---------|------|
| Toggle study mode | Enter or leave study mode |
| Reveal the next card | In study mode |
| Fold all cards / Unfold all cards | Sets `-` or `+` on every card |
| Tidy layout | Arranges the cards once |
| Toggle keep tidy for this canvas | |
| Add a child card / Add a sibling card | Same as Tab and Enter |

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| Fill new boxes with a card | On | New text boxes start as a card. Off: only Tab and Enter make cards |
| Callout type | `pregunta` | The type in `> [!type]+` |
| Question placeholder | `p` | The title of a new card |
| Answer placeholder | `a` | The body of a new card |
| New cards start open | On | New cards start with `+` (on) or `-` (off) |
| Tab and Enter add cards | On | |
| Keep tidy by default | On | For canvases where you haven't turned Keep tidy on or off yourself |

The callout type has no special look unless your theme or a CSS snippet gives it one; otherwise Obsidian shows it like a plain note callout.

## Installation

Not in Obsidian's community plugins yet. Build it (below), then copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/flashcard-canvas/` and enable **Flashcard Canvas** in Settings → Community plugins.

It requires Obsidian 1.7.2 or later. It makes no network requests.

## How it works

Obsidian's canvas has no public API for plugins, so this plugin works with the canvas's internal objects, the way other canvas plugins do. It checks for each internal method before using it, so if a future Obsidian version changes them, a feature stops working instead of the canvas breaking. If something stops working after an Obsidian update, that's the likely reason.

| File | Role |
|------|------|
| `src/callout.ts` | Pure card logic, no Obsidian imports: recognizing a card, its fold marker, the template, where the title is. |
| `src/layout.ts` | Pure layout logic, no Obsidian imports: the tree from the arrows, tidy positions, study order, arrow sides. |
| `src/board.ts` | Everything on one open canvas: marking and fitting cards, folding, Keep tidy, Tab and Enter, study mode, the canvas controls. |
| `src/main.ts` | Plugin entry: hooks into the canvas (new boxes, saves, loading), commands, per-canvas Keep tidy. |
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
