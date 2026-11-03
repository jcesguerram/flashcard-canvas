import { ItemView, Plugin, TAbstractFile, TFile } from 'obsidian';
import { around } from 'monkey-around';
import type { CanvasData } from 'obsidian/canvas';
import { MindmapCanvas } from './board';
import { template, titleRange } from './callout';
import type { CanvasLike, CanvasNodeLike, CanvasViewLike } from './internals';
import { DEFAULT_SETTINGS, FlashcardCanvasSettingTab, type CanvasPrefs, type Settings } from './settings';

type Method = (this: CanvasLike, ...args: unknown[]) => unknown;

const NO_PREFS: CanvasPrefs = Object.freeze({});

export default class FlashcardCanvasPlugin extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS, canvases: {} };
	private readonly boards = new Map<CanvasLike, MindmapCanvas>();
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
			else this.boards.set(canvas, new MindmapCanvas(this, canvas));
		}
		for (const [canvas, board] of this.boards) {
			if (open.has(canvas)) continue;
			// Closed: what was saved during study mode already has the layout from before it.
			board.dispose(false);
			this.boards.delete(canvas);
		}
	}

	/** The board of the canvas in the active tab, if any. */
	private activeBoard(): MindmapCanvas | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView) as unknown as CanvasViewLike | null;
		if (!view || view.getViewType() !== 'canvas' || !view.canvas) return null;
		this.syncBoards();
		return this.boards.get(view.canvas) ?? null;
	}

	/**
	 * Hook into the canvas once, for every canvas: new text boxes get the card
	 * template in callout mode, saves keep the layout tidy, and study mode keeps
	 * the saved layout as it was.
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
				const board = plugin.boards.get(this);
				const options = args[0];
				let filled = false;
				if (plugin.importing === 0 && board?.calloutMode() && options && typeof options === 'object') {
					const o = options as Record<string, unknown>;
					if (o.text === undefined || o.text === '') {
						args[0] = { ...o, text: plugin.template() };
						filled = true;
					}
				}
				const node = next.apply(this, args) as CanvasNodeLike | undefined;
				if (node && plugin.importing === 0) board?.touch(node.id);
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

	// ── Per-canvas preferences ───────────────────────────────────────────────

	prefs(path: string | null): CanvasPrefs {
		return (path && this.settings.canvases[path]) || NO_PREFS;
	}

	setPref(path: string, key: keyof CanvasPrefs, value: boolean): void {
		this.settings.canvases[path] = { ...this.prefs(path), [key]: value };
		void this.saveSettings();
	}

	/**
	 * The first time a canvas is opened, decide Keep tidy for it: on (if that's
	 * the setting) for a canvas with no boxes yet, off for one that already has
	 * boxes, so opening an existing canvas never rearranges it.
	 */
	async ensurePrefs(path: string | null): Promise<void> {
		if (!path || this.prefs(path).keepTidy !== undefined) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		let empty = false;
		try {
			const text = await this.app.vault.read(file);
			const data = text.trim() ? (JSON.parse(text) as Partial<CanvasData>) : {};
			empty = !Array.isArray(data.nodes) || data.nodes.length === 0;
		} catch {
			empty = false; // unreadable: treat as existing, leave it alone
		}
		if (this.prefs(path).keepTidy !== undefined) return;
		this.setPref(path, 'keepTidy', empty && this.settings.keepTidyNew);
	}

	private onRename(path: string, oldPath: string): void {
		const all = this.settings.canvases;
		let changed = false;
		for (const key of Object.keys(all)) {
			if (key !== oldPath && !key.startsWith(oldPath + '/')) continue;
			const value = all[key];
			delete all[key];
			if (value !== undefined) all[path + key.slice(oldPath.length)] = value;
			changed = true;
		}
		if (changed) void this.saveSettings();
		for (const board of this.boards.values()) {
			if (board.path === oldPath) board.path = path;
		}
	}

	// ── Commands ─────────────────────────────────────────────────────────────

	private registerCommands(): void {
		const command = (id: string, name: string, can: (b: MindmapCanvas) => boolean, run: (b: MindmapCanvas) => void) => {
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
		const cards = (b: MindmapCanvas) => b.calloutMode() && !b.study;
		command('tidy-layout', 'Tidy layout', (b) => !b.study, (b) => b.tidyNow(true));
		command('toggle-keep-tidy', 'Toggle keep tidy for this canvas', (b) => !b.study, (b) => b.toggleKeepTidy());
		command('add-child', 'Add a child box', (b) => !b.study && !!b.selectedBox(), (b) => {
			const node = b.selectedBox();
			if (node) b.addChild(node);
		});
		command('add-sibling', 'Add a sibling box', (b) => !b.study && !!b.selectedBox(), (b) => {
			const node = b.selectedBox();
			if (node) b.addSibling(node);
		});
		command('toggle-callout-mode', 'Toggle callout mode for this canvas', () => true, (b) => b.toggleCalloutMode());
		command('fold-all', 'Fold all cards', cards, (b) => b.setAllFolds('-'));
		command('unfold-all', 'Unfold all cards', cards, (b) => b.setAllFolds('+'));
		command('toggle-study-mode', 'Toggle study mode', (b) => b.calloutMode(), (b) => b.toggleStudy());
		command('next-card', 'Reveal the next card', (b) => !!b.study, (b) => b.nextCard());
	}

	// ── Settings ─────────────────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<Settings> & {
			keepTidy?: Record<string, boolean>;
			keepTidyDefault?: boolean;
			fillNewBoxes?: boolean;
		};
		const canvases: Record<string, CanvasPrefs> = { ...(data.canvases ?? {}) };
		// Settings from 0.1.0: Keep tidy per canvas, and callout cards on every canvas.
		const legacyCallouts = data.fillNewBoxes !== false;
		for (const [path, on] of Object.entries(data.keepTidy ?? {})) {
			canvases[path] = { callouts: legacyCallouts, ...canvases[path], keepTidy: canvases[path]?.keepTidy ?? on };
		}
		const { keepTidy: _k, keepTidyDefault, fillNewBoxes: _f, ...rest } = data;
		this.settings = {
			...DEFAULT_SETTINGS,
			...rest,
			keepTidyNew: rest.keepTidyNew ?? keepTidyDefault ?? DEFAULT_SETTINGS.keepTidyNew,
			canvases,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
