import { PluginSettingTab, App, Setting, Notice } from "obsidian";
import EmojiShortcodesPlugin, { ExtGemojiSetting } from "./main";

const repoURL = `https://github.com/KraXen72/obsidian-emoji-autocomplete`

export interface EmojiPluginSettings {
	immediateReplace: boolean;
	suggester: boolean;
	considerHistory: boolean;
	historyLimit: number;
	history: string[];
	considerPreference: boolean;
	preferenceLimit: number;
	preference: ExtGemojiSetting[];
	highlightMatches: boolean;
	strictTrigger: boolean;
	triggerFromFirst: boolean;
	emojiSupported: Record<string, boolean>;
	hideUnsupported: boolean;
	tagSearch: boolean;
	tagShowShortcode: boolean;
	latinize: boolean;
	polyfillFlags: boolean;
}

export const DEFAULT_SETTINGS: EmojiPluginSettings = {
	immediateReplace: true,
	suggester: true,
	considerHistory: true,
	historyLimit: 25,
	history: [],
	considerPreference: true,
	preferenceLimit: 10,
	preference: [],
	highlightMatches: true,
	strictTrigger: true,
	triggerFromFirst: true,
	emojiSupported: {},
	hideUnsupported: true,
	tagSearch: true,
	tagShowShortcode: false,
	latinize: true,
	polyfillFlags: false,
}

export class EmojiPluginSettingTab extends PluginSettingTab {
	plugin: EmojiShortcodesPlugin;

	constructor(app: App, plugin: EmojiShortcodesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Emoji Autocomplete')
			.setDesc('Emoji autocomplete will appear everytime you type : followed by a letter. This will help you insert emojis. (Might not work on mobile)')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.suggester)
					.onChange(async value => {
						this.plugin.settings.suggester = value;
						await this.plugin.saveSettings();
					})
			});

		const triggerFirstFrag = new DocumentFragment()
		const triggerFirstW = triggerFirstFrag.createEl("div", { cls: 'markdown-rendered' })
		triggerFirstW.appendText(`If this is off, don't trigger on `)
		triggerFirstW.createEl('code').setText(`:3`)
		triggerFirstW.appendText(' or ')
		triggerFirstW.createEl('code').setText(`:D`)
		triggerFirstW.appendText(' but trigger on ')
		triggerFirstW.createEl('code').setText(`:Do`)
		triggerFirstW.appendText(', ')
		triggerFirstW.createEl('code').setText(`:Dog`)
		triggerFirstW.appendText(' etc.')
	
		new Setting(containerEl)
			.setName('Trigger from first character')
			.setDesc(triggerFirstFrag)
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.triggerFromFirst)
					.onChange(async value => {
						this.plugin.settings.triggerFromFirst = value;
						await this.plugin.saveSettings();
					})
			});

		const triggerDescFrag = new DocumentFragment()
		const triggerDescW = triggerDescFrag.createEl('details')
		triggerDescW.createEl('summary').setText('Disable this if autocomplete is sometimes not triggering when it should.')
		triggerDescW.appendText('With this setting on, the following will apply:')
		const triggerDescWUl = triggerDescW.createEl("ul", { cls: 'EA-setting-details-wrap' })
		const dataviewMetaLi = triggerDescWUl.createEl("li", { cls: 'markdown-rendered' })
		dataviewMetaLi.appendText("Don't trigger on dataview inline fields: ")
		dataviewMetaLi.createEl('code').setText(`key::value`)

		const hhmmssLi = triggerDescWUl.createEl("li", { cls: 'markdown-rendered' })
		hhmmssLi.appendText("Don't trigger on ")
		hhmmssLi.createEl('code').setText(`HH:MM`)
		hhmmssLi.appendText(" or ")
		hhmmssLi.createEl('code').setText(`HH:MM:SS`)
		hhmmssLi.appendText(" dates.")

		new Setting(containerEl)
			.setName('Stricter autocomplete trigger')
			.setDesc(triggerDescFrag)
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.strictTrigger)
					.onChange(async value => {
						this.plugin.settings.strictTrigger = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName('Highlight matched part of suggestion')
			.setDesc('Highlight the part of the suggestion that is matched in accent color.')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.highlightMatches)
					.onChange(async value => {
						this.plugin.settings.highlightMatches = value;
						await this.plugin.saveSettings();
					})
			});
		
		new Setting(containerEl)
			.setName('Suggest emoji by tags')
			.setDesc('E.g. Searching for \'shuffle\' will find 🔀 (twisted_rightwards_arrow). Tags may sometimes be vague or unintuitive.')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.tagSearch)
					.onChange(async value => {
						this.plugin.settings.tagSearch = value;
						await this.plugin.saveSettings();
						this.display();
					})
			});

		if (this.plugin.settings.tagSearch) {
			new Setting(containerEl)
				.setName('Show shortcode on tag results')
				.setDesc('When an emoji is matched by it\'s tag, show the shortcode next to it. Helps you learn the proper shortcodes. When disabled, looks cleaner.')
				.setClass('EA-sub-setting')
				.addToggle(cb => {
					cb.setValue(this.plugin.settings.tagShowShortcode)
						.onChange(async value => {
							this.plugin.settings.tagShowShortcode = value;
							await this.plugin.saveSettings();
						})
				});
		}
	

		new Setting(containerEl)
			.setName('Suggest recenly used emoji')
			.setDesc('Suggester will boost recently used emoji')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.considerHistory)
					.onChange(async value => {
						this.plugin.settings.considerHistory = value;
						await this.plugin.saveSettings();
						this.display();
					})
			});

		if (this.plugin.settings.considerHistory) {
			const MAX_HISTORY_RECORD = 100;
			new Setting(containerEl)
				.setName('History Limit')
				.setClass('EA-sub-setting')
				.addText(cb => {
					cb.setPlaceholder(`default: ${DEFAULT_SETTINGS.historyLimit}, max: ${MAX_HISTORY_RECORD}`)
						.setValue(String(this.plugin.settings.historyLimit))
						.onChange(async value => {
							let val = value !== '' ? Number(value) : DEFAULT_SETTINGS.historyLimit;
							if (val > MAX_HISTORY_RECORD) val = MAX_HISTORY_RECORD;
							this.plugin.settings.historyLimit = val;
							await this.plugin.saveSettings();
						})
				});

			new Setting(containerEl)
				.setName(`Clear History (${this.plugin.settings.history.length} items)`)
				.setClass('EA-sub-setting')
				.addButton(cb => {
					cb.setButtonText("Clear")
						.onClick(async () => {
							this.plugin.settings.history = [];
							await this.plugin.saveSettings();
							new Notice(`Cleared history`)
							this.display()
						})
				});
		}

		new Setting(containerEl)
		.setName('Suggest frequently used emoji')
		.setDesc('Suggester will list frequently used emoji')
		.addToggle(cb => {
			cb.setValue(this.plugin.settings.considerPreference)
				.onChange(async value => {
					this.plugin.settings.considerPreference = value;
					await this.plugin.saveSettings();
					this.display();
				})
		});

		if (this.plugin.settings.considerPreference) {
			const MAX_PREFERENCE_RECORD = 20;
			new Setting(containerEl)
				.setName('Preference Limit')
				.setClass('EA-sub-setting')
				.addText(cb => {
					cb.setPlaceholder(`default: ${DEFAULT_SETTINGS.preferenceLimit}, max: ${MAX_PREFERENCE_RECORD}`)
						.setValue(String(this.plugin.settings.preferenceLimit))
						.onChange(async value => {
							let val = value !== '' ? Number(value) : DEFAULT_SETTINGS.preferenceLimit;
							if (val > MAX_PREFERENCE_RECORD) val = MAX_PREFERENCE_RECORD;
							this.plugin.settings.preferenceLimit = val;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName(`Clear Preferences (${this.plugin.settings.preference.length} items)`)
				.setClass('EA-sub-setting')
				.addButton(cb => {
					cb.setButtonText("Clear")
						.onClick(async () => {
							this.plugin.settings.preference = [];
							await this.plugin.saveSettings();
							new Notice(`Cleared preference`)
							this.display()
						});
				});
		}

		new Setting(containerEl).setName('Supported emoji').setHeading()

		new Setting(containerEl)
			.setName('Hide unsupported emoji')
			.setDesc('Unsupported emoji will not be suggested in the picker')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.hideUnsupported)
					.onChange(async value => {
						this.plugin.settings.hideUnsupported = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName('Re-check emoji support')
			.setDesc('This will clear the supported/unsupported status of all emoji and re-check them.')
			.setClass('EA-sub-setting')
			.addButton(cb => {
				cb.setButtonText("Clear & Re-check")
					.onClick(async () => {
						this.plugin.settings.emojiSupported = {};
						await this.plugin.saveSettings(true);
					})
			});
		
		new Setting(containerEl).setName('Other').setHeading()

		new Setting(containerEl)
			.setName('Immediate Emoji Replace')
			.setDesc('If this is turned on, upon submitting a completion, an emoji will be immediately inserted. Otherwise, a shortcode will be inserted and you only see the emoji in Preview Mode.')
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.immediateReplace)
					.onChange(async value => {
						this.plugin.settings.immediateReplace = value;
						await this.plugin.saveSettings(false);
					})
			});


		const latinFrag = new DocumentFragment()
		const latinDescW = latinFrag.createDiv({ cls: 'markdown-rendered' })
		latinDescW.appendText('If this is turned on, searching for ')
		latinDescW.createEl('code').setText(`:štár`)
		latinDescW.appendText(' will find the same results as ')
		latinDescW.createEl('code').setText(`:star`)

		new Setting(containerEl)
			.setName('Remove diacritics')
			.setDesc(latinFrag)
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.latinize)
					.onChange(async value => {
						this.plugin.settings.latinize = value;
						await this.plugin.saveSettings(false);
					})
			});

		const bflagFrag = new DocumentFragment()
		const flagFragW = bflagFrag.createDiv({ cls: 'EA-setting-details-wrap' })
		flagFragW.createEl('strong').setText('Replaces all flag emoji with a custom font')
		flagFragW.createEl('br')
		const bflagDet = flagFragW.createEl('details')
		bflagDet.createEl('summary').setText('Windows 10 is known to have bad flag emoji, this fixes it. More info:')
		const bflagUl = bflagDet.createEl('ul')
		bflagUl.createEl('li').setText('Might break some themes or other plugins!')
		bflagUl.createEl('li', { title: 'The plugin tries to modify the --font-text-override css variable on the body' })
			.setText('If glitched, reload obsidian or change the Text Font in Appearance')
		bflagDet.createEl('strong').setText('Please report any bugs on ')
		bflagDet.querySelector('strong').createEl('a', { href: `${repoURL}/issues` }).setText('github')

		new Setting(containerEl)
			.setName('Better flag emoji (Experimental)')
			.setDesc(bflagFrag)
			.addToggle(cb => {
				cb.setValue(this.plugin.settings.polyfillFlags)
					.onChange(async value => {
						this.plugin.settings.polyfillFlags = value;
						await this.plugin.saveSettings(false, true);
					})
			});

			new Setting(containerEl).setName('Donate').setHeading()

		const donateFragment = new DocumentFragment()
		donateFragment.createDiv({ text: 'If you like this Plugin, consider donating to support continued development', cls: "setting-item-description" })
		const gridHolder = donateFragment.createDiv({ cls: "EA-setting-gridholder" })

		const author1 = gridHolder.createDiv()
		author1.createDiv({ text: 'Support KraXen72', cls: 'setting-item-name' })
		author1.createDiv({ text: 'Creator of Emoji Autocomplete and all the features on top of Emoji Shortcodes', cls: 'setting-item-description' })
		const KraXenDonateHolder = gridHolder.createDiv({ cls: 'EA-donate' })
		KraXenDonateHolder.createEl('a', { href: 'https://liberapay.com/KraXen72', title: 'Support KraXen72 on LiberaPay' })
			.createEl('img', { attr: { src: 'https://liberapay.com/assets/widgets/donate.svg', height: 32 } })
		KraXenDonateHolder.createEl('a', { href: 'https://ko-fi.com/kraxen72', title: 'Support KraXen72 on ko-fi' })
			.createEl('img', { attr: { src: 'https://ko-fi.com/img/githubbutton_sm.svg', height: 32 } })

		const author2 = gridHolder.createDiv()
		author2.createDiv({ text: 'Support phibr0', cls: 'setting-item-name' })
		author2.createDiv({ text: 'Creator of Emoji Shortcodes, the plugin Emoji Autocomplete was initially based on', cls: 'setting-item-description' })
		gridHolder
			.createDiv({ cls: 'EA-donate' })
			.createEl('a', { href: 'https://ko-fi.com/phibr0', title: '"Support phibr0 on ko-fi' })
			.createEl('img', { attr: { src: 'https://ko-fi.com/img/githubbutton_sm.svg', height: 32 } })
		
		containerEl.appendChild(donateFragment)
		
	}
}