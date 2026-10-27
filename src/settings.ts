import { App, PluginSettingTab, Setting } from 'obsidian';
import type FlashcardCanvasPlugin from './main';

export interface Settings {
	/** Callout type of new cards, e.g. "pregunta" for > [!pregunta]+ */
	calloutType: string;
	/** Placeholder text for the question (the callout's title). */
	question: string;
	/** Placeholder text for the answer (the callout's body). */
	answer: string;
	/** New cards start open (+) or folded (-). */
	startOpen: boolean;
	/** New boxes on any canvas start with the card template. */
	fillNewBoxes: boolean;
	/** Tab adds a child card and Enter a sibling to the selected card. */
	keyboard: boolean;
	/** Keep tidy is on for canvases you haven't set it for. */
	keepTidyDefault: boolean;
	/** Keep tidy per canvas file, where you changed it. */
	keepTidy: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
	calloutType: 'pregunta',
	question: 'p',
	answer: 'a',
	startOpen: true,
	fillNewBoxes: true,
	keyboard: true,
	keepTidyDefault: true,
	keepTidy: {},
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

		new Setting(containerEl).setName('New cards').setHeading();

		new Setting(containerEl)
			.setName('Fill new boxes with a card')
			.setDesc('Every new text box on a canvas starts as a card. Turn this off to create cards only with Tab and Enter.')
			.addToggle((t) => t.setValue(s.fillNewBoxes).onChange((v) => { s.fillNewBoxes = v; save(); }));

		new Setting(containerEl)
			.setName('Callout type')
			.setDesc('The type in > [!type]+ at the start of every new card.')
			.addText((t) => t.setPlaceholder('pregunta').setValue(s.calloutType).onChange((v) => { s.calloutType = v; save(); }));

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

		new Setting(containerEl).setName('Layout').setHeading();

		new Setting(containerEl)
			.setName('Tab and Enter add cards')
			.setDesc('With a card selected, Tab adds a connected card to its right and Enter adds one below it, under the same parent.')
			.addToggle((t) => t.setValue(s.keyboard).onChange((v) => { s.keyboard = v; save(); }));

		new Setting(containerEl)
			.setName('Keep tidy by default')
			.setDesc('Rearrange the cards as a tree after every change. Each canvas can turn it on or off with the magnet button; this sets it for canvases where you haven\'t.')
			.addToggle((t) => t.setValue(s.keepTidyDefault).onChange((v) => { s.keepTidyDefault = v; save(); }));
	}
}
