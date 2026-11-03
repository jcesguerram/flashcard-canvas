import { App, PluginSettingTab, Setting } from 'obsidian';
import type FlashcardCanvasPlugin from './main';

/** What is set for one canvas file. Missing means not decided yet. */
export interface CanvasPrefs {
	callouts?: boolean;
	keepTidy?: boolean;
}

export interface Settings {
	/** Tab adds a child box and Enter a sibling to the selected box. */
	keyboard: boolean;
	/** Keep tidy starts on in new (empty) canvases. Canvases that already have boxes start with it off. */
	keepTidyNew: boolean;
	/** Callout type of new cards, e.g. "pregunta" for > [!pregunta]+ */
	calloutType: string;
	/** Placeholder text for the question (the callout's title). */
	question: string;
	/** Placeholder text for the answer (the callout's body). */
	answer: string;
	/** New cards start open (+) or folded (-). */
	startOpen: boolean;
	/** Callout mode and Keep tidy for each canvas, by file path. */
	canvases: Record<string, CanvasPrefs>;
}

export const DEFAULT_SETTINGS: Settings = {
	keyboard: true,
	keepTidyNew: true,
	calloutType: 'pregunta',
	question: 'p',
	answer: 'a',
	startOpen: true,
	canvases: {},
};

export class FlashcardCanvasSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FlashcardCanvasPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => { void this.plugin.saveSettings(); };

		new Setting(containerEl).setName('Mindmap').setHeading();

		new Setting(containerEl)
			.setName('Add boxes with the keyboard')
			.setDesc('With a box selected, Tab adds a connected box to its right and Enter adds one below it, under the same parent.')
			.addToggle((t) => t.setValue(s.keyboard).onChange((v) => { s.keyboard = v; save(); }));

		new Setting(containerEl)
			.setName('Keep tidy in new canvases')
			.setDesc('Rearrange the boxes as a tree after every change. Canvases that already had boxes when the plugin first opened them start with it off. Each canvas can turn it on or off with the magnet button.')
			.addToggle((t) => t.setValue(s.keepTidyNew).onChange((v) => { s.keepTidyNew = v; save(); }));

		new Setting(containerEl)
			.setName('Callout mode')
			.setDesc('Turned on per canvas with its button in the canvas controls. In callout mode, new boxes start as a foldable callout card.')
			.setHeading();

		new Setting(containerEl)
			.setName('Callout type')
			.setDesc('The type in > [!type]+ at the start of every new card.')
			.addText((t) => t.setValue(s.calloutType).onChange((v) => { s.calloutType = v; save(); }));

		new Setting(containerEl)
			.setName('Question placeholder')
			.setDesc('The callout title of a new card. It is selected when the card opens, so typing replaces it.')
			.addText((t) => t.setValue(s.question).onChange((v) => { s.question = v; save(); }));

		new Setting(containerEl)
			.setName('Answer placeholder')
			.setDesc('The callout body of a new card.')
			.addText((t) => t.setValue(s.answer).onChange((v) => { s.answer = v; save(); }));

		new Setting(containerEl)
			.setName('New cards start open')
			.setDesc('On: new cards start with + (answer showing). Off: with - (answer folded).')
			.addToggle((t) => t.setValue(s.startOpen).onChange((v) => { s.startOpen = v; save(); }));
	}
}
