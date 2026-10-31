
import { PluginSettingTab, App, Setting, Notice, requireApiVersion, type SettingDefinitionRender } from "obsidian";
import EmojiShortcodesPlugin from "./main";

const repoURL = `https://github.com/KraXen72/obsidian-emoji-autocomplete`

export interface EmojiPluginSettings {
	immediateReplace: boolean;
	preferTextSymbols: boolean;
	suggester: boolean;
	considerHistory: boolean;
	historyLimit: number;
	history: Record<string, number>;
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
	preferTextSymbols: true,
	suggester: true,
	considerHistory: true,
	historyLimit: 25,
	history: {},
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

/** Plugin-owned metadata shared by modern and legacy settings renderers. */
interface EmojiSettingDefinition {
	name: string;
	desc?: string | DocumentFragment;
	visible?: boolean | (() => boolean);
	searchable?: boolean;
	aliases?: string[];
	render: (setting: Setting) => void;
}

export class EmojiPluginSettingTab extends PluginSettingTab {
	plugin: EmojiShortcodesPlugin;

	constructor(app: App, plugin: EmojiShortcodesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Render the shared definitions on Obsidian versions before 1.13. */
	display(): void {
		this.renderLegacySettings();
	}

	private renderLegacySettings(): void {
		this.containerEl.empty();
		for (const definition of this.createSettingDefinitions()) {
			const visible = typeof definition.visible === 'function'
				? definition.visible()
				: definition.visible !== false;
			if (!visible) continue;

			const setting = new Setting(this.containerEl).setName(definition.name);
			if (definition.desc) setting.setDesc(definition.desc);
			definition.render(setting);
		}
	}

	/** Refresh through the declarative API when available, or the legacy renderer. */
	private refresh(): void {
		if (requireApiVersion('1.13.0')) this.update();
		else this.renderLegacySettings();
	}

	/** Describe searchable settings while retaining the save handlers and their side effects. */
	getSettingDefinitions(): SettingDefinitionRender[] {
		return this.createSettingDefinitions();
	}

	private createSettingDefinitions(): EmojiSettingDefinition[] {
		const definitions: EmojiSettingDefinition[] = [];

		definitions.push({
			name: 'Emoji Autocomplete',
			desc: 'Emoji autocomplete will appear everytime you type : followed by a letter. This will help you insert emojis. (Might not work on mobile)',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.suggester)
						.onChange(async value => {
							this.plugin.settings.suggester = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		const triggerFirstFrag = new DocumentFragment()
		const triggerFirstW = triggerFirstFrag.createDiv( { cls: 'markdown-rendered' })
		triggerFirstW.appendText(`If this is off, don't trigger on `)
		triggerFirstW.createEl('code').appendText(`:3`)
		triggerFirstW.appendText(' or ')
		triggerFirstW.createEl('code').appendText(`:D`)
		triggerFirstW.appendText(' but trigger on ')
		triggerFirstW.createEl('code').appendText(`:Do`)
		triggerFirstW.appendText(', ')
		triggerFirstW.createEl('code').appendText(`:Dog`)
		triggerFirstW.appendText(' etc.')

		definitions.push({
			name: 'Trigger from first character',
			desc: triggerFirstFrag,
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.triggerFromFirst)
						.onChange(async value => {
							this.plugin.settings.triggerFromFirst = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		const triggerDescFrag = new DocumentFragment()
		const triggerDescW = triggerDescFrag.createEl('details')
		triggerDescW.createEl('summary').setText('Disable this if autocomplete is sometimes not triggering when it should.')
		triggerDescW.appendText('With this setting on, the following will apply:')
		const triggerDescWUl = triggerDescW.createEl("ul")
		const dataviewMetaLi = triggerDescWUl.createEl("li", { cls: 'markdown-rendered' })
		dataviewMetaLi.appendText("Don't trigger on dataview inline fields: ")
		dataviewMetaLi.createEl('code').appendText(`key::value`)

		const hhmmssLi = triggerDescWUl.createEl("li", { cls: 'markdown-rendered' })
		hhmmssLi.appendText("Don't trigger on ")
		hhmmssLi.createEl('code').appendText(`HH:MM`)
		hhmmssLi.appendText(" or ")
		hhmmssLi.createEl('code').appendText(`HH:MM:SS`)
		hhmmssLi.appendText(" dates.")

		definitions.push({
			name: 'Stricter autocomplete trigger',
			desc: triggerDescFrag,
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.strictTrigger)
						.onChange(async value => {
							this.plugin.settings.strictTrigger = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		definitions.push({
			name: 'Highlight matched part of suggestion',
			desc: 'Highlight the part of the suggestion that is matched in accent color.',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.highlightMatches)
						.onChange(async value => {
							this.plugin.settings.highlightMatches = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		definitions.push({
			name: 'Suggest emoji by tags',
			desc: 'E.g. Searching for \'shuffle\' will find 🔀 (twisted_rightwards_arrow). Tags may sometimes be vague or unintuitive.',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.tagSearch)
						.onChange(async value => {
							this.plugin.settings.tagSearch = value;
							await this.plugin.saveSettings();
							this.refresh();
						})
				});
			},
		});

		definitions.push({
			visible: () => this.plugin.settings.tagSearch,
			name: 'Show shortcode on tag results',
			desc: 'When an emoji is matched by it\'s tag, show the shortcode next to it. Helps you learn the proper shortcodes. When disabled, looks cleaner.',
			render: setting => {
				setting.setClass('EA-sub-setting');
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.tagShowShortcode)
						.onChange(async value => {
							this.plugin.settings.tagShowShortcode = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		definitions.push({
			name: 'Suggest recently used emoji',
			desc: 'Prioritize emoji you use frequently.',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.considerHistory)
						.onChange(async value => {
							this.plugin.settings.considerHistory = value;
							await this.plugin.saveSettings();
							this.refresh();
						})
				});
			},
		});

		definitions.push({
			visible: () => this.plugin.settings.considerHistory,
			name: 'History limit',
			aliases: ['Clear history'],
			desc: `${Object.keys(this.plugin.settings.history).length} emoji remembered (maximum 100).`,
			render: setting => {
				setting.setClass('EA-sub-setting EA-history-limit');
				setting.addText(cb => {
					cb.setPlaceholder(`default: ${DEFAULT_SETTINGS.historyLimit}, max: 100`)
						.setValue(String(this.plugin.settings.historyLimit))
						.onChange(async value => {
							let val = value !== '' ? Number(value) : DEFAULT_SETTINGS.historyLimit;
							if (val > 100) val = 100;
							this.plugin.settings.historyLimit = val;
							await this.plugin.saveSettings();
						})
				});
				setting.addButton(cb => {
					cb.setButtonText("Clear")
						.onClick(async () => {
							this.plugin.settings.history = {};
							await this.plugin.saveSettings();
							new Notice(`Cleared history`)
							this.refresh()
						})
				});
			},
		});

		definitions.push({
			name: 'Supported emoji',
			searchable: false,
			render: setting => { setting.setHeading().setClass('EA-settings-heading'); },
		});

		definitions.push({
			name: 'Hide unsupported emoji',
			desc: 'Unsupported emoji will not be suggested in the picker',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.hideUnsupported)
						.onChange(async value => {
							this.plugin.settings.hideUnsupported = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		definitions.push({
			name: 'Re-check emoji support',
			desc: 'Check again after changing your text or interface font.',
			render: setting => {
				setting.setClass('EA-sub-setting');
				setting.addButton(cb => {
					cb.setButtonText("Re-check")
						.onClick(async () => {
							this.plugin.settings.emojiSupported = {};
							await this.plugin.saveSettings(true);
						})
				});
			},
		});

		definitions.push({
			name: 'Other',
			searchable: false,
			render: setting => { setting.setHeading().setClass('EA-settings-heading'); },
		});

		definitions.push({
			name: 'Immediate Emoji Replace',
			desc: 'If this is turned on, upon submitting a completion, an emoji will be immediately inserted. Otherwise, a shortcode will be inserted and you only see the emoji in Preview Mode.',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.immediateReplace)
						.onChange(async value => {
							this.plugin.settings.immediateReplace = value;
							await this.plugin.saveSettings(false);
						})
				});
			},
		});

		definitions.push({
			name: 'Use text style for ©, ®, and ™',
			desc: 'Use text presentation instead of emoji presentation when inserting these symbols or rendering their shortcodes.',
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.preferTextSymbols)
						.onChange(async value => {
							this.plugin.settings.preferTextSymbols = value;
							await this.plugin.saveSettings();
						})
				});
			},
		});

		const latinFrag = new DocumentFragment()
		const latinDescW = latinFrag.createDiv({ cls: 'markdown-rendered' })
		latinDescW.appendText('If this is turned on, searching for ')
		latinDescW.createEl('code').appendText(`:štár`)
		latinDescW.appendText(' will find the same results as ')
		latinDescW.createEl('code').appendText(`:star`)

		definitions.push({
			name: 'Remove diacritics',
			desc: latinFrag,
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.latinize)
						.onChange(async value => {
							this.plugin.settings.latinize = value;
							await this.plugin.saveSettings(false);
						})
				});
			},
		});

		const bflagFrag = new DocumentFragment()
		const flagFragW = bflagFrag.createDiv()
		flagFragW.createEl('strong').setText('Replaces all flag emoji with a custom font')
		flagFragW.createEl('br')
		const bflagDet = flagFragW.createEl('details')
		bflagDet.createEl('summary').setText('Windows 10 is known to have bad flag emoji, this fixes it. More info:')
		const bflagUl = bflagDet.createEl('ul')
		bflagUl.createEl('li').setText('Might break some themes or other plugins!')
		bflagUl.createEl('li', { title: 'The plugin tries to modify the --font-text-override CSS variable on the body' })
			.setText('If glitched, reload Obsidian or change the text font in appearance')
		bflagDet.createEl('strong').setText('Please report any bugs on ')
		bflagDet.querySelector('strong').createEl('a', { href: `${repoURL}/issues` }).setText('GitHub')

		definitions.push({
			name: 'Better flag emoji (Experimental)',
			desc: bflagFrag,
			render: setting => {
				setting.addToggle(cb => {
					cb.setValue(this.plugin.settings.polyfillFlags)
						.onChange(async value => {
							this.plugin.settings.polyfillFlags = value;
							await this.plugin.saveSettings(false, true);
						})
				});
			},
		});

		definitions.push({
			name: 'Donate',
			searchable: false,
			render: setting => { setting.setHeading().setClass('EA-settings-heading'); },
		});

		definitions.push({
			name: 'Support KraXen72',
			desc: 'Creator of Emoji Autocomplete and its additional features.',
			searchable: false,
			render: setting => {
				setting.addButton(button => button
					.setButtonText('Liberapay')
					.onClick(() => { window.open('https://liberapay.com/KraXen72'); }));
				setting.addButton(button => button
					.setButtonText('Ko-fi')
					.onClick(() => { window.open('https://ko-fi.com/kraxen72'); }));
			},
		});

		return definitions.map(definition => ({
			...definition,
			render: setting => {
				if (!definition.desc) setting.setClass('EA-no-desc-setting');
				definition.render(setting);
			},
		}));
	}
}
