import { ItemView, Plugin, TAbstractFile } from 'obsidian';
import { around } from 'monkey-around';
import type { CanvasData } from 'obsidian/canvas';
import { CardCanvas } from './board';
import { template, titleRange } from './callout';
import type { CanvasLike, CanvasNodeLike, CanvasViewLike } from './internals';
import { DEFAULT_SETTINGS, FlashcardCanvasSettingTab, type Settings } from './settings';

type Method = (this: CanvasLike, ...args: unknown[]) => unknown;

export default class FlashcardCanvasPlugin extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS, keepTidy: {} };
	private readonly boards = new Map<CanvasLike, CardCanvas>();
	private patched = false;
	/** Above zero while canvas content is being loaded, so loaded boxes aren't treated as new. */
	private importing = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new FlashcardCanvasSettingTab(this.app, this));
		this.registerCommands();

		this.app.workspace.onLayoutReady(() => {
			this.syncBoards();
			this.registerEvent(this.app.workspace.on('layout-change', () => this.syncBoards()));
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncBoards()));
			this.registerEvent(this.app.workspace.on('file-open', () => this.syncBoards()));
			this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.onRename(file.path, oldPath)));
		});
	}

	onunload(): void {
		for (const board of this.boards.values()) board.dispose(true);
		this.boards.clear();
	}

	// ── Canvases ─────────────────────────────────────────────────────────────

	/** Start working on canvases that opened, and stop on the ones that closed. */
	private syncBoards(): void {
		const open = new Set<CanvasLike>();
		for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
			const canvas = (leaf.view as unknown as CanvasViewLike).canvas;
			if (!canvas || !canvas.wrapperEl) continue; // a tab that hasn't loaded yet
			this.patch(canvas);
			open.add(canvas);
			const board = this.boards.get(canvas);
			if (board) board.checkFile();
			else this.boards.set(canvas, new CardCanvas(this, canvas));
		}
		for (const [canvas, board] of this.boards) {
			if (open.has(canvas)) continue;
			// Closed: what was saved during study mode already has the layout from before it.
			board.dispose(false);
			this.boards.delete(canvas);
		}
	}

	/** The board of the canvas in the active tab, if any. */
	private activeBoard(): CardCanvas | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView) as unknown as CanvasViewLike | null;
		if (!view || view.getViewType() !== 'canvas' || !view.canvas) return null;
		this.syncBoards();
		return this.boards.get(view.canvas) ?? null;
	}

	/**
	 * Hook into the canvas once, for every canvas: new text boxes get the card
	 * template, saves keep the layout tidy, and study mode keeps the saved
	 * layout as it was.
	 */
	private patch(canvas: CanvasLike): void {
		if (this.patched) return;
		const proto = Object.getPrototypeOf(canvas) as Record<string, Method | undefined>;
		if (!proto) return;
		this.patched = true;
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the patched methods need both the canvas (this) and the plugin
		const plugin = this;
		const wrappers: Record<string, (next: Method) => Method> = {};
		const has = (name: string) => typeof proto[name] === 'function';

		if (has('createTextNode')) {
			wrappers.createTextNode = (next) => function (this: CanvasLike, ...args: unknown[]) {
				const options = args[0];
				let filled = false;
				if (plugin.importing === 0 && plugin.settings.fillNewBoxes && options && typeof options === 'object') {
					const o = options as Record<string, unknown>;
					if (o.text === undefined || o.text === '') {
						args[0] = { ...o, text: plugin.template() };
						filled = true;
					}
				}
				const node = next.apply(this, args) as CanvasNodeLike | undefined;
				if (filled && node) plugin.editTitle(node, false);
				return node;
			};
		}
		for (const name of ['importData', 'setData']) {
			if (!has(name)) continue;
			wrappers[name] = (next) => function (this: CanvasLike, ...args: unknown[]) {
				plugin.importing++;
				try {
					return next.apply(this, args);
				} finally {
					plugin.importing--;
				}
			};
		}
		if (has('getData')) {
			wrappers.getData = (next) => function (this: CanvasLike, ...args: unknown[]) {
				const data = next.apply(this, args) as CanvasData;
				const board = plugin.boards.get(this);
				return board ? board.dataForSave(data) : data;
			};
		}
		if (has('requestSave')) {
			wrappers.requestSave = (next) => function (this: CanvasLike, ...args: unknown[]) {
				const result = next.apply(this, args);
				plugin.boards.get(this)?.scheduleTidy();
				return result;
			};
		}
		this.register(around(proto as Record<string, Method>, wrappers));
	}

	whileImporting<T>(run: () => T): T {
		this.importing++;
		try {
			return run();
		} finally {
			this.importing--;
		}
	}

	// ── Cards ────────────────────────────────────────────────────────────────

	template(): string {
		const s = this.settings;
		return template({ type: s.calloutType, question: s.question, answer: s.answer, open: s.startOpen });
	}

	/**
	 * Select a new card's title so typing replaces the placeholder. `start`
	 * opens the editor; otherwise this waits for Obsidian to open it.
	 */
	editTitle(node: CanvasNodeLike, start = true): void {
		if (start) node.startEditing?.();
		let tries = 0;
		const attempt = () => {
			const cm = node.child?.editMode?.cm;
			if (node.isEditing && cm) {
				const data = node.getData() as { text?: string };
				const range = titleRange(data.text ?? '');
				if (range) {
					cm.dispatch({ selection: { anchor: range.from, head: range.to } });
					cm.focus();
				}
				return;
			}
			if (++tries < 20) window.setTimeout(attempt, 50);
		};
		window.setTimeout(attempt, 30);
	}

	// ── Keep tidy, per canvas ────────────────────────────────────────────────

	keepTidyFor(path: string | null): boolean {
		if (path && path in this.settings.keepTidy) return this.settings.keepTidy[path] === true;
		return this.settings.keepTidyDefault;
	}

	setKeepTidy(path: string | null, on: boolean): void {
		if (!path) return;
		this.settings.keepTidy[path] = on;
		void this.saveSettings();
	}

	private onRename(path: string, oldPath: string): void {
		const keep = this.settings.keepTidy;
		let changed = false;
		for (const key of Object.keys(keep)) {
			if (key !== oldPath && !key.startsWith(oldPath + '/')) continue;
			const value = keep[key];
			delete keep[key];
			if (value !== undefined) keep[path + key.slice(oldPath.length)] = value;
			changed = true;
		}
		if (changed) void this.saveSettings();
		for (const board of this.boards.values()) {
			if (board.path === oldPath) board.path = path;
		}
	}

	// ── Commands ─────────────────────────────────────────────────────────────

	private registerCommands(): void {
		const command = (id: string, name: string, can: (b: CardCanvas) => boolean, run: (b: CardCanvas) => void) => {
			this.addCommand({
				id,
				name,
				checkCallback: (checking: boolean) => {
					const board = this.activeBoard();
					if (!board || !can(board)) return false;
					if (!checking) run(board);
					return true;
				},
			});
		};
		command('toggle-study-mode', 'Toggle study mode', () => true, (b) => b.toggleStudy());
		command('next-card', 'Reveal the next card', (b) => !!b.study, (b) => b.nextCard());
		command('fold-all', 'Fold all cards', (b) => !b.study, (b) => b.setAllFolds('-'));
		command('unfold-all', 'Unfold all cards', (b) => !b.study, (b) => b.setAllFolds('+'));
		command('tidy-layout', 'Tidy layout', (b) => !b.study, (b) => b.tidyNow(true));
		command('toggle-keep-tidy', 'Toggle keep tidy for this canvas', (b) => !b.study, (b) => b.toggleKeepTidy());
		command('add-child', 'Add a child card', (b) => !b.study && !!b.selectedCard(), (b) => {
			const node = b.selectedCard();
			if (node) b.addChild(node);
		});
		command('add-sibling', 'Add a sibling card', (b) => !b.study && !!b.selectedCard(), (b) => {
			const node = b.selectedCard();
			if (node) b.addSibling(node);
		});
	}

	// ── Settings ─────────────────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<Settings>;
		this.settings = { ...DEFAULT_SETTINGS, ...data, keepTidy: { ...(data.keepTidy ?? {}) } };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
