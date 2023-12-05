import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';
import { gemoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import EmojiMarkdownPostProcessor from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { typeAheadSort } from './util';

// import DefinitionListPostProcessor from './definitionListPostProcessor';

interface ExtGemoji extends Gemoji {
	/** match range */
	range: [number, number]
	matchedName: string
}

export default class EmojiShortcodesPlugin extends Plugin {

	settings: EmojiPluginSettings;
	readonly emojiList: Gemoji[];
	shortcodeList: string[]
	shortcodeIndexes: Record<string, number> = {}
	tagIndexes: Record<string, number> = {}

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

		(this.emojiList as Gemoji[]) = gemoji
		const shortcodeSet: Set<string> = new Set()
		for (let i = 0; i < gemoji.length; i++) {
			const emoji = gemoji[i]
			emoji.names.forEach(n => {
				shortcodeSet.add(n)
				this.shortcodeIndexes[n] = i
				if (n === 'large_blue_circle') this.shortcodeIndexes['blue_circle'] = i
			})
			// emoji.tags.forEach(t => this.tagIndexes[t] ??= i)
		}
		this.shortcodeList = Array.from(shortcodeSet)
	}

	indexedGemojiFromShortcode(shortcode: string) {
		if (!(shortcode in this.shortcodeIndexes)) return null;
		const index = this.shortcodeIndexes[shortcode]
		const gemoji = this.emojiList[index]
		return gemoji ?? null;
	}

	updateHistory(suggestion: string) {
		console.log("history: ", suggestion)
		if (!this.settings.historyPriority) return;

		const set = new Set([suggestion, ...this.settings.history]);
		const history = Array.from(set).slice(0, this.settings.historyLimit);

		this.settings = Object.assign(this.settings, { history });
		this.saveSettings();
	}
}

class EmojiSuggester extends EditorSuggest<Gemoji> {
	plugin: EmojiShortcodesPlugin;
	fuzzy: uFuzzy;
	resultLimit = 18;
	// queryRegex = new RegExp(/:[^:\s\p{Emoji}]+:?$/);
	queryRegex = new RegExp(/:\S.+$/);

	constructor(plugin: EmojiShortcodesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.fuzzy = new uFuzzy({ sort: typeAheadSort });
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.suggester) return null;
		const sub = editor.getLine(cursor.line).substring(0, cursor.ch);
		const match = sub.match(this.queryRegex)?.first();
		console.log(match)
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
		let [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodeList, emoji_query);
		const suggestions: ExtGemoji[] = []
		// using info.idx here instead of idxs because uf.info() may have
		// further reduced the initial idxs based on prefix/suffix rules
		const idxs2 = info?.idx ?? idxs;
		for (let i = 0; i <  Math.min((order?.length || 0), this.resultLimit); i++) {
			const index = idxs2[order[i]]
			const sc = this.plugin.shortcodeList[index]
			const gemoji = this.plugin.indexedGemojiFromShortcode(sc)
			if (!gemoji) continue;
			const extGemoji: ExtGemoji = {
				...gemoji, 
				range: info.ranges[index] as [number, number],
				matchedName: sc
			}
			suggestions.push(extGemoji)
		}
		console.log("q:", emoji_query, suggestions, order?.length || 0, idxs2.length, "info", info)
		return suggestions
		//this.plugin.emojiList.filter(e => e.names.some(n => n.includes(emoji_query)));
	}

	renderSuggestion(suggestion: ExtGemoji, el: HTMLElement) {
		const outer = el.createDiv({ cls: "ES-suggester-container" });
		outer.createDiv({ cls: "ES-shortcode" }).setText(suggestion.matchedName/*.replace(/:/g, "")*/);
		outer.createDiv({ cls: "ES-emoji" }).setText(suggestion.emoji);
	}

	selectSuggestion(suggestion: ExtGemoji): void {
		if(!this.context) return;
		const { start, end, query } = this.context;
		const repl = this.plugin.settings.immediateReplace ? suggestion.emoji : `${suggestion.matchedName} `;
		(this.context.editor as Editor).replaceRange(repl, start, end);
	}
}
