import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, Notice } from 'obsidian';
import { gemoji, nameToEmoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import EmojiMarkdownPostProcessor from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { iconHistory, iconChevronsRight, slimHighlight, isEmojiSupported, iconTags } from './util';

const windowsSupportedEmoji = ['relaxed', 'tm', 'registered']

// import DefinitionListPostProcessor from './definitionListPostProcessor';
interface ExtGemoji extends Gemoji {
	/** match range */
	range: [number, number]
	matchedName: string,
	isInHistory: boolean,
	matchedBy: 'name' | 'tag' | 'mystery'
}

export default class EmojiShortcodesPlugin extends Plugin {
	readonly emojiList: Gemoji[];
	settings: EmojiPluginSettings;
	/** current emoji shortcode, tag, etc. haystack */
	shortcodeList: string[]
	/** set of strings that are ensured to only be tags */
	tagSet: Set<string>;
	shortcodeIndexes: Record<string, number> = {}

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

	async saveSettings(update = true) {
		await this.saveData(this.settings);
		if (update) this.updateEmojiList()
	}

	updateEmojiList() {
		// console.time('emojiUpdate');
		(this.emojiList as Gemoji[]) = gemoji
		const shortcodeSet: Set<string> = new Set()
		const tagSet: Set<string> = new Set()
		const showNotice = Object.keys(this.settings.emojiSupported).length === 0
		this.shortcodeIndexes = {}

		for (let i = 0; i < gemoji.length; i++) {
			const emoji = gemoji[i]
			let supported = true
			if (emoji.names.includes('large_blue_circle')) emoji.names.unshift('blue_circle')

			for (const n of emoji.names) {
				if (!(n in this.settings.emojiSupported)) {
					if (emoji.category === 'Flags' && emoji.description.startsWith('flag:')
					|| (navigator.userAgent.includes('Win') && windowsSupportedEmoji.includes(n))) {
						this.settings.emojiSupported[n] = true
					} else {
						supported = isEmojiSupported(emoji.emoji)
						this.settings.emojiSupported[n] = supported
					}
				} else if (this.settings.hideUnsupported) {
					supported = this.settings.emojiSupported[n];
				}

				if (!supported) continue;
				shortcodeSet.add(n)
				this.shortcodeIndexes[n] = i
			}
			if (!this.settings.tagSearch || !supported || emoji.tags.length === 0) continue;
			for (const t of emoji.tags) { 
				if (!(t in nameToEmoji)) tagSet.add(t)
				if (typeof this.shortcodeIndexes[t] === 'undefined') {
					shortcodeSet.add(t)
					this.shortcodeIndexes[t] ??= i 
				}
			}
		}
		this.shortcodeList = Array.from(shortcodeSet)
		this.tagSet = tagSet

		// console.timeEnd('emojiUpdate')
		this.saveData(this.settings);
		if (showNotice) new Notice(`Re-checked emoji`)
		console.log(`Updated emoji list: ${this.shortcodeList.length} items, ${tagSet.size} tags.`)
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
		this.saveSettings(false);
	}
}

class EmojiSuggester extends EditorSuggest<Gemoji> {
	plugin: EmojiShortcodesPlugin;
	fuzzy: uFuzzy;
	cmp = new Intl.Collator('en').compare;
	resultLimit = 18;
	queryRegex = new RegExp(/:[^\s:][^:]*$/);

	constructor(plugin: EmojiShortcodesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.fuzzy = new uFuzzy({ sort: this.typeAheadSort, interChars: '.' });
	}

	/** 
	 * loosly based on uFuzzy typeahead sort
	 * @see https://github.com/leeoniya/uFuzzy/blob/main/demos/compare.html#L295 
	*/

	typeAheadSort = (info: uFuzzy.Info, haystack: string[], needle: string) =>  {
		let { idx, chars, terms, interLft2, interLft1, start, intraIns, interIns } = info;
		const countHis = this.plugin.settings.considerHistory;

		const shortestSort = (ia: number, ib: number) => haystack[idx[ia]].length - haystack[idx[ib]].length
		
		const historyTagSort = (ia: number, ib: number) => {
			const aVal = haystack[idx[ia]]
			const bVal = haystack[idx[ib]]
			const aHis = countHis ? this.plugin.settings.history.includes(aVal) : false;
			const bHis = countHis ? this.plugin.settings.history.includes(bVal) : false;
			const aTag = this.plugin.tagSet.has(aVal)
			const bTag = this.plugin.tagSet.has(bVal)
			const tagEq = aTag === bTag

			if (aHis === bHis) {
				if (tagEq) return 0;
				if (!aTag && bTag) return -1
				if (aTag && !bTag) return 1;
			} else if (aHis && !bHis) {
				if (tagEq) return -1;
				if (aTag && !bTag) return 0;
				if (!aTag && bHis) return -2;
			} else if (bHis && !aHis) {
				if (tagEq) return 1;
				if (aTag && !bTag) return 0;
				if (!bTag && aTag) return 2;
			}
			return 0;
		}

		const sorter = (ia: number, ib: number) => (
			chars[ib] - chars[ia]  // most contig chars matched
			|| intraIns[ia] - intraIns[ib]  // least char intra-fuzz (most contiguous)
			|| historyTagSort(ia, ib) + shortestSort(ia, ib)
			// || shortestSort(ia, ib) // most likely not needed
			// || start[ia] - start[ib] // earliest start of match
			|| ( // most prefix bounds, boosted by full term matches
				(terms[ib] + interLft2[ib] + 0.5 * interLft1[ib]) -
				(terms[ia] + interLft2[ia] + 0.5 * interLft1[ia])
			)
			// || span[ia] - span[ib] // highest density of match (least span)
			|| interIns[ia] - interIns[ib] // highest density of match (least term inter-fuzz)
			|| this.cmp(haystack[idx[ia]], haystack[idx[ib]]) // alphabetic
		)
			
		return idx.map((v, i) => i).sort(sorter)
	};

	onTrigger(cursor: EditorPosition, editor: Editor, _: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.suggester) return null;
		const sub = editor.getLine(cursor.line).slice(0, cursor.ch);
		const match = sub.match(this.queryRegex)?.first();
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
		if (this.plugin.settings.latinize) emoji_query = uFuzzy.latinize(emoji_query)
		let [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodeList, emoji_query);
		let suggestions: ExtGemoji[] = []

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
				range: info.ranges[order[i]] as [number, number],
				matchedName: sc,
				isInHistory: this.plugin.settings.history.includes(sc),
				matchedBy: 'mystery'
			}
			if (gemoji.tags.includes(sc)) extGemoji.matchedBy = 'tag'
			if (gemoji.names.includes(sc)) extGemoji.matchedBy = 'name'
			suggestions.push(extGemoji)
		}
		return suggestions
	}

	renderSuggestion(suggestion: ExtGemoji, el: HTMLElement) {
		const outer = el.createDiv({ cls: "ES-suggester-container" });
		const shortcodeDiv = outer.createDiv({ cls: "ES-shortcode", title: `shortcode: ${suggestion.names[0]}` })
		if (this.plugin.settings.highlightMatches) {
			shortcodeDiv.innerHTML = slimHighlight(suggestion.matchedName, suggestion.range)
		} else {
			shortcodeDiv.setText(suggestion.matchedName);
		}
		if (suggestion.isInHistory && this.plugin.settings.considerHistory) shortcodeDiv.createDiv().outerHTML = iconHistory;
		if (suggestion.matchedBy === 'tag') {
			if (this.plugin.settings.tagShowShortcode) {
				shortcodeDiv.createDiv({ cls: 'ES-tag-shortcode' }).innerHTML = `${iconChevronsRight} <span class="ES-tag-sc">${suggestion.names[0]}</span>`
			} else {
				shortcodeDiv.createDiv().outerHTML = iconTags;
			}
		}
		outer.createDiv({ cls: "ES-emoji", title: suggestion.names[0] }).setText(suggestion.emoji);
	}

	selectSuggestion(suggestion: ExtGemoji): void {
		if(!this.context) return;
		const { start, end } = this.context;
		const shortcode = suggestion.names.includes(suggestion.matchedName) ? suggestion.matchedName : suggestion.names[0]
		const repl = this.plugin.settings.immediateReplace ? suggestion.emoji : `:${shortcode}: `;

		this.context.editor.replaceRange(repl, start, end);
		this.plugin.updateHistory(suggestion.matchedName);
	}
}