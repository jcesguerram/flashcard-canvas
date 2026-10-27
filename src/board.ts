// Everything the plugin does on one open canvas: marking cards, fitting their
// height to the content, folding, keeping the layout tidy, adding cards from
// the keyboard, and study mode.

import { setIcon, setTooltip, type KeymapEventHandler } from 'obsidian';
import type { CanvasData, CanvasEdgeData, CanvasTextData } from 'obsidian/canvas';
import { readCard, setFold, toggleFold, type Fold } from './callout';
import type { CanvasLike, CanvasNodeLike } from './internals';
import { buildTree, childSpot, GAPS, sidesFor, studyOrder, tidy, type Box, type Link } from './layout';
import type FlashcardCanvasPlugin from './main';

interface Geometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Study {
	revealed: Set<string>;
	/** Where each card was when study mode started; put back on leaving, and what gets saved meanwhile. */
	saved: Map<string, Geometry>;
}

type ButtonKey = 'study' | 'next' | 'collapse' | 'expand' | 'tidy' | 'keep';

/** The smallest height a card shrinks to. */
const MIN_HEIGHT = 40;

export function randomId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function geometry(n: CanvasNodeLike): Geometry {
	return { x: n.x, y: n.y, width: n.width, height: n.height };
}

export class CardCanvas {
	study: Study | null = null;
	path: string | null;

	private readonly mutations: MutationObserver;
	private readonly resizes: ResizeObserver;
	/** The rendered content of each card, watched for size changes. */
	private readonly sizers = new Map<string, Element>();
	private readonly sizerOwner = new WeakMap<Element, string>();
	private controls: HTMLElement | null = null;
	private badge: HTMLElement | null = null;
	private readonly buttons: Partial<Record<ButtonKey, HTMLElement>> = {};
	private scanTimer: number | null = null;
	private tidyTimer: number | null = null;
	private readonly keyTarget: HTMLElement;
	private keyHandlers: KeymapEventHandler[] = [];
	/** Key presses already acted on, so one press never adds two cards. */
	private readonly handledKeys = new WeakSet<KeyboardEvent>();
	private readonly onClick = (e: MouseEvent) => this.handleClick(e);
	private readonly onKey = (e: KeyboardEvent) => { this.handleKey(e); };

	constructor(private readonly plugin: FlashcardCanvasPlugin, readonly canvas: CanvasLike) {
		this.path = canvas.view.file?.path ?? null;
		this.mutations = new MutationObserver(() => this.scheduleScan());
		this.resizes = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const id = this.sizerOwner.get(entry.target);
				const node = id ? canvas.nodes.get(id) : undefined;
				if (node) this.fit(node);
			}
		});
		canvas.wrapperEl.addEventListener('click', this.onClick, true);
		// Keys reach the canvas through its view's keymap scope when the tab is active;
		// the listener on the view's element covers the case where they don't.
		const scope = canvas.view.scope;
		if (scope) {
			const viaScope = (e: KeyboardEvent) => (this.handleKey(e) ? false : true);
			for (const key of ['Tab', 'Enter', 'N']) this.keyHandlers.push(scope.register([], key, viaScope));
		}
		this.keyTarget = canvas.view.containerEl;
		this.keyTarget.addEventListener('keydown', this.onKey, true);
		this.mutations.observe(canvas.canvasEl, { childList: true, subtree: true });
		this.buildControls();
		this.scheduleScan(0);
	}

	/** Stop working on this canvas. `restore` puts cards back where they were before study mode. */
	dispose(restore: boolean): void {
		if (this.study) this.exitStudy(restore);
		this.canvas.wrapperEl.removeEventListener('click', this.onClick, true);
		this.keyTarget.removeEventListener('keydown', this.onKey, true);
		for (const handler of this.keyHandlers) this.canvas.view.scope?.unregister(handler);
		this.keyHandlers = [];
		this.mutations.disconnect();
		this.resizes.disconnect();
		if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
		if (this.tidyTimer !== null) window.clearTimeout(this.tidyTimer);
		this.controls?.remove();
		this.badge?.remove();
		for (const node of this.canvas.nodes.values()) node.nodeEl.removeClasses(['fc-card', 'fc-revealed']);
	}

	/** The canvas view now shows another file: study mode belonged to the old one. */
	checkFile(): void {
		const path = this.canvas.view.file?.path ?? null;
		if (path === this.path) return;
		if (this.study) this.exitStudy(false);
		this.path = path;
		this.updateControls();
		this.scheduleScan(0);
	}

	// ── Cards ────────────────────────────────────────────────────────────────

	isCard(node: CanvasNodeLike): boolean {
		const data = node.getData();
		return data.type === 'text' && readCard((data).text) !== null;
	}

	cards(): CanvasNodeLike[] {
		return Array.from(this.canvas.nodes.values()).filter((n) => this.isCard(n));
	}

	/** Arrows between two cards. Arrows to or from anything else are ignored. */
	links(): Link[] {
		const out: Link[] = [];
		for (const e of this.canvas.edges.values()) {
			const a = e.from?.node, b = e.to?.node;
			if (a && b && this.isCard(a) && this.isCard(b)) out.push({ from: a.id, to: b.id });
		}
		return out;
	}

	private boxes(nodes = this.cards()): Box[] {
		return nodes.map((n) => ({ id: n.id, ...geometry(n) }));
	}

	selectedCard(): CanvasNodeLike | null {
		if (this.canvas.selection.size !== 1) return null;
		const item = this.canvas.selection.values().next().value as CanvasNodeLike | undefined;
		if (!item || this.canvas.nodes.get(item.id) !== item) return null;
		if (item.isEditing || !this.isCard(item)) return null;
		return item;
	}

	private nodeFromEl(el: Element): CanvasNodeLike | null {
		for (const node of this.canvas.nodes.values()) if (node.nodeEl === el) return node;
		return null;
	}

	private anyEditing(): boolean {
		for (const node of this.canvas.nodes.values()) if (node.isEditing) return true;
		return false;
	}

	private setGeometry(node: CanvasNodeLike, patch: Partial<Geometry>): void {
		node.setData({ ...node.getData(), ...patch });
		this.canvas.markMoved?.(node);
	}

	private recordHistory(): void {
		try {
			this.canvas.pushHistory?.(this.canvas.getData());
		} catch {
			/* undo history is a nicety */
		}
	}

	// ── Watching and fitting ─────────────────────────────────────────────────

	scheduleScan(delay = 80): void {
		if (this.scanTimer !== null) return;
		this.scanTimer = window.setTimeout(() => {
			this.scanTimer = null;
			this.scan();
		}, delay);
	}

	/** Mark the cards, watch their content and fit them. Runs whenever the canvas's content changes. */
	private scan(): void {
		let count = 0;
		for (const node of this.canvas.nodes.values()) {
			const card = this.isCard(node);
			node.nodeEl.toggleClass('fc-card', card);
			node.nodeEl.toggleClass('fc-revealed', card && !!this.study?.revealed.has(node.id));
			if (!card) {
				this.unwatch(node.id);
				continue;
			}
			count++;
			this.watch(node);
			this.fit(node);
		}
		for (const id of Array.from(this.sizers.keys())) if (!this.canvas.nodes.has(id)) this.unwatch(id);
		this.controls?.toggleClass('fc-hidden', count === 0 && !this.study);
		this.updateControls();
	}

	private watch(node: CanvasNodeLike): void {
		const view = node.nodeEl.querySelector('.markdown-preview-view');
		const sizer = view?.querySelector('.markdown-preview-sizer') ?? view?.firstElementChild ?? null;
		if (!sizer) {
			// Not rendered right now (being edited, or scrolled out of view).
			this.unwatch(node.id);
			return;
		}
		if (this.sizers.get(node.id) === sizer) return;
		this.unwatch(node.id);
		this.sizers.set(node.id, sizer);
		this.sizerOwner.set(sizer, node.id);
		this.resizes.observe(sizer);
	}

	private unwatch(id: string): void {
		const sizer = this.sizers.get(id);
		if (!sizer) return;
		this.resizes.unobserve(sizer);
		this.sizers.delete(id);
	}

	/** Make a card exactly as tall as what it shows. */
	fit(node: CanvasNodeLike): void {
		if (node.isEditing || this.canvas.readonly || !this.isCard(node)) return;
		const view = node.nodeEl.querySelector<HTMLElement>('.markdown-preview-view');
		if (!view) return;
		view.setCssStyles({ height: 'min-content' });
		const content = view.clientHeight;
		view.setCssStyles({ height: '' });
		if (!content) return;
		const height = Math.max(Math.ceil(content) + 4, MIN_HEIGHT);
		if (Math.abs(height - node.height) < 2) return;
		this.setGeometry(node, { height });
		this.canvas.requestSave();
	}

	// ── Clicks and keys ──────────────────────────────────────────────────────

	private handleClick(e: MouseEvent): void {
		const target = e.target instanceof Element ? e.target : null;
		const nodeEl = target?.closest('.canvas-node');
		if (!target || !nodeEl) return;
		const node = this.nodeFromEl(nodeEl);
		if (!node || node.isEditing || !this.isCard(node)) return;
		if (this.study) {
			e.preventDefault();
			e.stopPropagation();
			this.toggleReveal(node);
			return;
		}
		if (target.closest('.callout-title') && !this.canvas.readonly) {
			e.preventDefault();
			e.stopPropagation();
			this.toggleFold(node);
		}
	}

	/** Tab, Enter and (in study mode) N. Returns whether the key was used. */
	private handleKey(e: KeyboardEvent): boolean {
		if (this.handledKeys.has(e)) return true;
		if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
		if (!this.canvas.wrapperEl.isShown()) return false;
		const focused = activeDocument.activeElement;
		const typing = (el: Element | null) => !!el?.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
		if (typing(e.target instanceof Element ? e.target : null) || typing(focused)) return false;
		let used = false;
		if (this.study) {
			if (e.key.toLowerCase() === 'n' && !this.anyEditing()) {
				this.nextCard();
				used = true;
			}
		} else if (this.plugin.settings.keyboard && !this.canvas.readonly && (e.key === 'Tab' || e.key === 'Enter')) {
			const node = this.selectedCard();
			if (node) {
				if (e.key === 'Tab') this.addChild(node);
				else this.addSibling(node);
				used = true;
			}
		}
		if (!used) return false;
		this.handledKeys.add(e);
		e.preventDefault();
		e.stopPropagation();
		return true;
	}

	// ── Folding ──────────────────────────────────────────────────────────────

	toggleFold(node: CanvasNodeLike): void {
		const data = node.getData() as CanvasTextData;
		const text = toggleFold(data.text);
		if (text === data.text) return;
		node.setData({ ...data, text });
		this.recordHistory();
		this.canvas.requestSave();
		this.scheduleScan(30);
	}

	setAllFolds(fold: Fold): void {
		if (this.study || this.canvas.readonly) return;
		let changed = false;
		for (const node of this.cards()) {
			const data = node.getData() as CanvasTextData;
			const text = setFold(data.text, fold);
			if (text === data.text) continue;
			node.setData({ ...data, text });
			changed = true;
		}
		if (!changed) return;
		this.recordHistory();
		this.canvas.requestSave();
		this.scheduleScan(30);
	}

	// ── Layout ───────────────────────────────────────────────────────────────

	keepTidy(): boolean {
		return this.plugin.keepTidyFor(this.path);
	}

	toggleKeepTidy(): void {
		const on = !this.keepTidy();
		this.plugin.setKeepTidy(this.path, on);
		this.updateControls();
		if (on) this.tidyNow(true);
	}

	/** Called on every save of the canvas: with Keep tidy on, rearrange shortly after. */
	scheduleTidy(): void {
		if (!this.keepTidy()) return;
		if (this.tidyTimer !== null) window.clearTimeout(this.tidyTimer);
		this.tidyTimer = window.setTimeout(() => {
			this.tidyTimer = null;
			this.tidyNow(false);
		}, 200);
	}

	/** Arrange the cards as a tree. Automatic runs wait until nothing is being dragged or edited. */
	tidyNow(manual: boolean): void {
		if (this.canvas.readonly) return;
		if (!manual && (this.canvas.isDragging || this.anyEditing())) {
			this.scheduleTidy();
			return;
		}
		const nodes = this.cards();
		if (!nodes.length) return;
		const boxes = this.boxes(nodes);
		const links = this.links();
		const spots = tidy(boxes, links);
		let changed = false;
		for (const node of nodes) {
			const p = spots.get(node.id);
			if (!p || (Math.abs(p.x - node.x) < 1 && Math.abs(p.y - node.y) < 1)) continue;
			this.setGeometry(node, { x: p.x, y: p.y });
			changed = true;
		}
		// Arrows from a card to its children leave from the right and arrive on the left.
		const tree = buildTree(boxes, links);
		const moved = new Map(boxes.map((b) => [b.id, { ...b, ...(spots.get(b.id) ?? {}) }]));
		for (const edge of this.canvas.edges.values()) {
			const a = moved.get(edge.from?.node?.id);
			const b = moved.get(edge.to?.node?.id);
			if (!a || !b) continue;
			const [fromSide, toSide] = tree.parent.get(b.id) === a.id ? (['right', 'left'] as const) : sidesFor(a, b);
			const data = edge.getData();
			if (data.fromSide === fromSide && data.toSide === toSide) continue;
			edge.setData({ ...data, fromSide, toSide });
			edge.render?.();
			changed = true;
		}
		if (!changed) return;
		if (manual) this.recordHistory();
		this.canvas.requestSave();
	}

	// ── Adding cards ─────────────────────────────────────────────────────────

	addChild(parent: CanvasNodeLike): void {
		const children: CanvasNodeLike[] = [];
		for (const edge of this.canvas.edges.values()) {
			const to = edge.to?.node;
			if (edge.from?.node === parent && to && this.isCard(to)) children.push(to);
		}
		const spot = childSpot(geometry(parent), children.map(geometry));
		this.createCard(spot, parent.width, parent.id);
	}

	addSibling(node: CanvasNodeLike): void {
		const parentId = buildTree(this.boxes(), this.links()).parent.get(node.id);
		const below = node.y + node.height;
		// Just above where the next sibling sits, so the layout keeps the new card right after this one.
		if (parentId) this.createCard({ x: node.x, y: below + GAPS.row - 1 }, node.width, parentId);
		else this.createCard({ x: node.x, y: below + GAPS.root }, node.width, null);
	}

	private createCard(spot: { x: number; y: number }, width: number, parentId: string | null): void {
		if (this.study || this.canvas.readonly) return;
		const id = randomId();
		const data = this.canvas.getData();
		const node: CanvasTextData = {
			id,
			type: 'text',
			text: this.plugin.template(),
			x: Math.round(spot.x),
			y: Math.round(spot.y),
			width: Math.round(width),
			height: 100,
		};
		const edges: CanvasEdgeData[] = parentId
			? [...data.edges, { id: randomId(), fromNode: parentId, fromSide: 'right', toNode: id, toSide: 'left' }]
			: data.edges;
		this.plugin.whileImporting(() => this.canvas.importData({ nodes: [...data.nodes, node], edges }));
		this.canvas.requestFrame?.();
		const created = this.canvas.nodes.get(id);
		if (!created) return;
		if (this.keepTidy()) this.tidyNow(true);
		this.recordHistory();
		this.canvas.requestSave();
		this.canvas.selectOnly?.(created);
		this.revealIfHidden(created);
		this.plugin.editTitle(created);
	}

	private revealIfHidden(node: CanvasNodeLike): void {
		const view = this.canvas.getViewportBBox?.();
		if (!view) return;
		const inside = node.x >= view.minX && node.x + node.width <= view.maxX && node.y >= view.minY && node.y + node.height <= view.maxY;
		if (!inside) this.canvas.zoomToSelection?.();
	}

	// ── Study mode ───────────────────────────────────────────────────────────

	toggleStudy(): void {
		if (this.study) this.exitStudy(true);
		else this.enterStudy();
	}

	enterStudy(): void {
		if (this.study) return;
		const saved = new Map<string, Geometry>();
		for (const node of this.cards()) saved.set(node.id, geometry(node));
		this.study = { revealed: new Set(), saved };
		this.canvas.wrapperEl.addClass('fc-study');
		this.badge = this.canvas.wrapperEl.createDiv({ cls: 'fc-study-badge' });
		this.updateControls();
		this.scheduleScan(0);
	}

	exitStudy(restore: boolean): void {
		const study = this.study;
		if (!study) return;
		this.study = null;
		this.canvas.wrapperEl.removeClass('fc-study');
		this.badge?.remove();
		this.badge = null;
		for (const node of this.canvas.nodes.values()) node.nodeEl.removeClass('fc-revealed');
		if (restore) {
			for (const [id, g] of study.saved) {
				const node = this.canvas.nodes.get(id);
				if (node) this.setGeometry(node, g);
			}
			this.canvas.requestSave();
		}
		this.updateControls();
		this.scheduleScan(0);
	}

	toggleReveal(node: CanvasNodeLike): void {
		const study = this.study;
		if (!study) return;
		if (study.revealed.has(node.id)) study.revealed.delete(node.id);
		else study.revealed.add(node.id);
		node.nodeEl.toggleClass('fc-revealed', study.revealed.has(node.id));
		this.updateControls();
	}

	/** Reveal the next hidden card, following the arrows from the first card. */
	nextCard(): void {
		const study = this.study;
		if (!study) return;
		const id = studyOrder(this.boxes(), this.links()).find((i) => !study.revealed.has(i));
		const node = id ? this.canvas.nodes.get(id) : undefined;
		if (!node) return;
		study.revealed.add(node.id);
		node.nodeEl.addClass('fc-revealed');
		this.canvas.selectOnly?.(node);
		this.revealIfHidden(node);
		this.updateControls();
	}

	/** While studying, the file keeps the layout from before study mode. */
	dataForSave(data: CanvasData): CanvasData {
		const study = this.study;
		if (!study || !data || !Array.isArray(data.nodes)) return data;
		return {
			...data,
			nodes: data.nodes.map((n) => {
				const g = study.saved.get(n.id);
				return g ? { ...n, ...g } : n;
			}),
		};
	}

	// ── Controls ─────────────────────────────────────────────────────────────

	private buildControls(): void {
		const host = this.canvas.canvasControlsEl;
		if (!host) return;
		const group = host.createDiv({ cls: 'canvas-control-group fc-controls fc-hidden' });
		const add = (key: ButtonKey, icon: string, label: string, run: () => void) => {
			const button = group.createDiv({ cls: 'canvas-control-item' });
			setIcon(button, icon);
			setTooltip(button, label, { placement: 'left' });
			button.addEventListener('click', run);
			this.buttons[key] = button;
		};
		add('study', 'graduation-cap', 'Study mode', () => this.toggleStudy());
		add('next', 'skip-forward', 'Next card (N)', () => this.nextCard());
		add('collapse', 'chevrons-down-up', 'Fold all cards', () => this.setAllFolds('-'));
		add('expand', 'chevrons-up-down', 'Unfold all cards', () => this.setAllFolds('+'));
		add('tidy', 'network', 'Tidy layout', () => this.tidyNow(true));
		add('keep', 'magnet', 'Keep tidy', () => this.toggleKeepTidy());
		this.controls = group;
	}

	updateControls(): void {
		const b = this.buttons;
		const studying = !!this.study;
		b.study?.toggleClass('is-active', studying);
		if (b.study) setTooltip(b.study, studying ? 'Leave study mode' : 'Study mode', { placement: 'left' });
		for (const key of ['collapse', 'expand', 'tidy', 'keep'] as const) b[key]?.toggleClass('fc-hidden', studying);
		b.next?.toggleClass('fc-hidden', !studying);
		const keep = this.keepTidy();
		b.keep?.toggleClass('is-active', keep);
		if (b.keep) setTooltip(b.keep, keep ? 'Keep tidy: on' : 'Keep tidy: off', { placement: 'left' });
		if (this.study && this.badge) {
			const total = this.cards().length;
			const shown = Array.from(this.study.revealed).filter((id) => this.canvas.nodes.has(id)).length;
			this.badge.setText(`Study mode · ${shown} of ${total} revealed`);
		}
	}
}
