import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';
import { gemoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import EmojiMarkdownPostProcessor from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { gemojiFromShortcode, typeAheadSort } from './util';
// import DefinitionListPostProcessor from './definitionListPostProcessor';

export default class EmojiShortcodesPlugin extends Plugin {

	settings: EmojiPluginSettings;
	emojiList: Gemoji[];
	shortcodeList: string[]

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new EmojiPluginSettingTab(this.app, this));
		this.registerEditorSuggest(new EmojiSuggester(this));

		this.registerMarkdownPostProcessor(EmojiMarkdownPostProcessor.emojiProcessor);
		//this.registerMarkdownPostProcessor(DefinitionListPostProcessor.definitionListProcessor);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.updateEmojiList()
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateEmojiList()
	}

	updateEmojiList() {
		// const set = new Set(this.settings.history)
		// this.emojiList = [...this.settings.history, ...Object.keys(emoji).filter(e => !set.has(e))];
		this.emojiList = gemoji
		const shortcodeSet: Set<string> = new Set()
		for (const emoji of gemoji) {
			emoji.names.forEach(n => shortcodeSet.add(n))
		}
		this.shortcodeList = Array.from(shortcodeSet)
		
	}

	updateHistory(suggestion: string) {
		if (!this.settings.historyPriority) return;

		const set = new Set([suggestion, ...this.settings.history]);
		const history = [...set].slice(0, this.settings.historyLimit);

		this.settings = Object.assign(this.settings, { history });
		this.saveSettings();
	}
}

class EmojiSuggester extends EditorSuggest<Gemoji> {
	plugin: EmojiShortcodesPlugin;
	fuzzy: uFuzzy;

	constructor(plugin: EmojiShortcodesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.fuzzy = new uFuzzy({ sort: typeAheadSort });
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.suggester) return null;
		const sub = editor.getLine(cursor.line).substring(0, cursor.ch);
		const match = sub.match(/:\S+$/)?.first();
		if (!match) return null;
		
		return {
			end: cursor,
			start: {
				ch: sub.lastIndexOf(match),
				line: cursor.line,
			},
			query: match,
		}
	}

	getSuggestions(context: EditorSuggestContext): Gemoji[] {
		let emoji_query = context.query.replace(':', '')

		let [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodeList, emoji_query, 1);
		const suggestions = []
		// using info.idx here instead of idxs because uf.info() may have
		// further reduced the initial idxs based on prefix/suffix rules
		for (let i = 0; i < Math.min(10, (order?.length || 0)); i++) {
			const sc = this.plugin.shortcodeList[info.idx[order[i]]]
			suggestions.push(gemojiFromShortcode(sc))
			// change emojiList to an object of indexes 
		}

		return suggestions//this.plugin.emojiList.filter(e => e.names.some(n => n.includes(emoji_query)));
	}

	renderSuggestion(suggestion: Gemoji, el: HTMLElement) {
		const outer = el.createDiv({ cls: "ES-suggester-container" });
		outer.createDiv({ cls: "ES-shortcode" }).setText(suggestion.names[0].replace(/:/g, ""));
		outer.createDiv({ cls: "ES-emoji" }).setText(suggestion.emoji);
	}

	selectSuggestion(suggestion: Gemoji): void {
		if(this.context) {
			(this.context.editor as Editor).replaceRange(this.plugin.settings.immediateReplace ? suggestion.emoji : `${suggestion} `, this.context.start, this.context.end);
			// this.plugin.updateHistory(suggestion);
		}
	}
}
