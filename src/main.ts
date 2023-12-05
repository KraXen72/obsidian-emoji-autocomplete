import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';
import { gemoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import EmojiMarkdownPostProcessor from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { iconHistory, slimHighlight } from './util';

// import DefinitionListPostProcessor from './definitionListPostProcessor';

interface ExtGemoji extends Gemoji {
	/** match range */
	range: [number, number]
	matchedName: string,
	isInHistory: boolean,
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

	updateHistory(matchedShortcode: string) {
		if (!this.settings.considerHistory) return;

		const set = new Set([matchedShortcode, ...this.settings.history]);
		const history = Array.from(set).slice(0, this.settings.historyLimit);

		this.settings = Object.assign(this.settings, { history });
		this.saveSettings();
	}
}

class EmojiSuggester extends EditorSuggest<Gemoji> {
	plugin: EmojiShortcodesPlugin;
	fuzzy: uFuzzy;
	cmp = new Intl.Collator('en').compare;
	resultLimit = 18;
	queryRegex = new RegExp(/:[^\s:]+$/);

	constructor(plugin: EmojiShortcodesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.fuzzy = new uFuzzy({ sort: this.typeAheadSort, interChars: '.' });
	}

	/** 
	 * based on uFuzzy typeahead sort
	 * @see https://github.com/leeoniya/uFuzzy/blob/main/demos/compare.html#L295 
	*/

	typeAheadSort = (info: uFuzzy.Info, haystack: string[], needle: string) =>  {
		let { idx, chars, terms, interLft2, interLft1, start, intraIns, interIns } = info;

		const historySort = (ia: number, ib: number) => {
			if (!this.plugin.settings.considerHistory) return 0;
			const aHis = this.plugin.settings.history.includes(haystack[idx[ia]])
			const bHis = this.plugin.settings.history.includes(haystack[idx[ib]])
			if (ia < 2) return -1;
			if (ib < 2) return 1;
			//console.log(haystack[idx[ia]], ia, aHis, haystack[idx[ib]], ib, bHis);
			// if (aHis || bHis) console.log(haystack[idx[ia]], ia, aHis, haystack[idx[ib]], ib, bHis)
			if (bHis && !aHis) { return 1; } else if (aHis && !bHis) { return -1; } else { return 0 }
		}
		const shortestSort = (ia: number, ib: number) => haystack[idx[ia]].length - haystack[idx[ib]].length

		const sorter = (ia: number, ib: number) => (
			// most contig chars matched
			chars[ib] - chars[ia] ||
			// least char intra-fuzz (most contiguous)
			intraIns[ia] - intraIns[ib] ||
			// shortest match first
			shortestSort(ia, ib) ||
			// consider history
			historySort(ia, ib) ||
			// earliest start of match
			// start[ia] - start[ib] ||
			// most prefix bounds, boosted by full term matches
			(
				(terms[ib] + interLft2[ib] + 0.5 * interLft1[ib]) -
				(terms[ia] + interLft2[ia] + 0.5 * interLft1[ia])
			) ||
			// highest density of match (least span)
			//	span[ia] - span[ib] ||
			// highest density of match (least term inter-fuzz)
			interIns[ia] - interIns[ib] ||
			// alphabetic
			this.cmp(haystack[idx[ia]], haystack[idx[ib]])
		)
			
		return idx.map((v, i) => i).sort(sorter)
	};

	onTrigger(cursor: EditorPosition, editor: Editor, _: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.suggester) return null;
		const sub = editor.getLine(cursor.line).slice(0, cursor.ch);
		// const match = sub.match(/:\S+$/)?.first();
		const match = sub.match(this.queryRegex)?.first();
		// console.log(sub, match, match)
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
		let suggestions: ExtGemoji[] = []
		// using info.idx here instead of idxs because uf.info() may have
		// further reduced the initial idxs based on prefix/suffix rules	
		console.log("gs", emoji_query)
		const idxs2 = info?.idx ?? idxs;
		for (let i = 0; i <  Math.min((order?.length || 0), this.resultLimit); i++) {
			const index = idxs2[order[i]]
			const sc = this.plugin.shortcodeList[index]
			const gemoji = this.plugin.indexedGemojiFromShortcode(sc)
			if (!gemoji) continue;
			const extGemoji: ExtGemoji = {
				...gemoji, 
				range: info.ranges[order[i]] as [number, number],
				matchedName: sc,
				isInHistory: this.plugin.settings.history.includes(sc),
			}
			suggestions.push(extGemoji)
		}
		// if (this.plugin.settings.considerHistory) {
		// 	const [ first, ...rest ] = suggestions;
		// 	suggestions = [ first, ...rest.sort((a, b) => b.isInHistory && !a.isInHistory ? 1 : a.isInHistory && !b.isInHistory ? -1 :0) ];
		// }
		return suggestions
	}

	renderSuggestion(suggestion: ExtGemoji, el: HTMLElement) {
		const outer = el.createDiv({ cls: "ES-suggester-container" });
		const shortcodeDiv = outer.createDiv({ cls: "ES-shortcode" })
		if (this.plugin.settings.highlightMatches) {
			shortcodeDiv.innerHTML = slimHighlight(suggestion.matchedName, suggestion.range)
		} else {
			shortcodeDiv.setText(suggestion.matchedName);
		}
		if (suggestion.isInHistory) shortcodeDiv.createDiv().outerHTML = iconHistory;
		outer.createDiv({ cls: "ES-emoji" }).setText(suggestion.emoji);
	}

	selectSuggestion(suggestion: ExtGemoji): void {
		if(!this.context) return;
		const { start, end } = this.context;
		const repl = this.plugin.settings.immediateReplace ? suggestion.emoji : `:${suggestion.matchedName}: `;

		this.context.editor.replaceRange(repl, start, end);
		this.plugin.updateHistory(suggestion.matchedName);
	}
}
