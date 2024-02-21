import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, Notice } from 'obsidian';
import { gemoji, nameToEmoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import EmojiMarkdownPostProcessor from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { slimHighlight, isEmojiSupported, iconFactory } from './util';

type emojiExtraRecord = Record<string, string|string[]>
/** some emoji are only supported on windows as symbols. we can add them, but we slice off the other characters that don't get rendered. */
const windowsSupportedFirstChar = ['relaxed', 'tm', 'registered', 'copyright', 'm']

// add some extra names & tags to emoji
const emojiExtraNames: emojiExtraRecord = {
	large_blue_circle: 'blue_circle',
	x: 'cross_mark',
	cupid: 'heart_with_arrow',
	gift_heart: 'heart_with_ribbon',
	heartpulse: 'growing_heart',
	heartbeat: 'beating_heart',
	'100': 'hundred_points',
	fist_oncoming: 'brofist',
	pray: 'folded_hands',
	rotating_light: ['siren', 'police_car_light'],
	arrow_forward: 'play_button',
	arrow_backward: 'reverse_button',
	rewind: 'fast_reverse_button',
	arrow_up_small: 'upwards_button',
	arrow_down_small: 'downwards_button',
	// non-standard, added for various reasons
	mag: "magnifying_glass"
}
const emojiExtraTags: emojiExtraRecord = {
	zany_face: ['crazy', 'insane'],
	japanese_ogre: 'oni',
	rotating_light: 'alarm',
	shopping_cart: 'buy',
	mate: "yerba_mate"
}


// import DefinitionListPostProcessor from './definitionListPostProcessor';
interface ExtGemoji extends Gemoji {
	/** match range */
	range: [number, number]
	matchedName: string,
	isInHistory: boolean,
	matchedBy: 'name' | 'tag' | 'mystery'
}

export default class EmojiShortcodesPlugin extends Plugin {
	settings: EmojiPluginSettings;

	private emojiList: Gemoji[];
	/** current emoji shortcode, tag, etc. haystack */
	private shortcodeList: string[]
	/** set of strings that are ensured to only be tags */
	private tagSet: Set<string>;
	private shortcodeIndexes: Record<string, number> = {}

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
		this.updateBodyFont(this.settings.polyfillFlags)
	}

	async saveSettings(updateEmoji = true, updateFont = false) {
		await this.saveData(this.settings);
		if (updateEmoji) this.updateEmojiList();
		if (updateFont) this.updateBodyFont(this.settings.polyfillFlags);
	}

	private updateBodyFont(value: boolean | 'toggle' = 'toggle') {
		const propName = "--font-text-override"
		const polyfillFont = "EmojiAutocompleteFlagPolyfill"
		const prev = document.body.style.getPropertyValue(propName).split(",").map(f => f.trim()) ?? []
		// console.log(prev, this.settings.polyfillFlags)
		
		if (prev[0] === polyfillFont) {
			if (value === 'toggle' || value === false) prev.shift();
		} else {
			if (value === 'toggle' || value === true) prev.unshift(polyfillFont);
		}
		document.body.style.setProperty(propName, prev.join(", "))
	}

	private enrichEmojiList() {
		// TODO prevent duplicates if gemoji ever get's updated
		for (const emoji of this.emojiList) {
			for (const q in emojiExtraNames) {
				if (emoji.names.includes(q)) {
					if (typeof emojiExtraNames[q] === 'string') emoji.names.push(emojiExtraNames[q] as string)
					if (Array.isArray(emojiExtraNames[q])) emoji.names.push(...emojiExtraNames[q])
				}
			}
			for (const q in emojiExtraTags) {
				if (emoji.names.includes(q)) {
					if (typeof emojiExtraTags[q] === 'string') emoji.tags.push(emojiExtraTags[q] as string)
					if (Array.isArray(emojiExtraTags[q])) emoji.tags.push(...emojiExtraTags[q])
				}
			}
		}
	}

	private updateEmojiList() {
		// console.time('emojiUpdate');
		this.emojiList = gemoji
		this.enrichEmojiList()
		const shortcodeSet: Set<string> = new Set()
		const tagSet: Set<string> = new Set()
		const showNotice = Object.keys(this.settings.emojiSupported).length === 0;
		this.shortcodeIndexes = {}

		for (let i = 0; i < gemoji.length; i++) {
			const emoji = gemoji[i]
			let supported = true

			for (const n of emoji.names) {
				if (!(n in this.settings.emojiSupported)) {
					if (emoji.category === 'Flags' && emoji.description.startsWith('flag:')
					|| (navigator.userAgent.includes('Win') && windowsSupportedFirstChar.includes(n))) {
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
		};
		this.shortcodeList = Array.from(shortcodeSet);
		this.tagSet = tagSet;

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

	/** get the tagSet */
	get tags() {
		return this.tagSet as ReadonlySet<string>
	}
	/** get the shortcodeList */
	get shortcodes() {
		return this.shortcodeList as ReadonlyArray<string>
	}
}

class EmojiSuggester extends EditorSuggest<Gemoji> {
	plugin: EmojiShortcodesPlugin;
	fuzzy: uFuzzy;
	cmp = new Intl.Collator('en').compare;
	resultLimit = 18;
	queryRegFi = new RegExp(/(?<key>[^\s:]+)?(?<col>:+)(?<sc>[^\s:][^:\n]*)$/); // first char triggers too
	queryRegex = new RegExp(/(?<key>[^\s:]+)?(?<col>:+)(?<sc>[^\s:][^:\n]+)$/);

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
			const aHis = countHis ? this.plugin.settings.history.indexOf(aVal) !== -1 : false;
			const bHis = countHis ? this.plugin.settings.history.indexOf(bVal) !== -1 : false;
			const aTag = this.plugin.tags.has(aVal)
			const bTag = this.plugin.tags.has(bVal)
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
			|| historyTagSort(ia, ib) * 1.5 // history up, tags down, boosted.
			+ start[ia] - start[ib] // earliest start of match
			+ shortestSort(ia, ib)
			// || shortestSort(ia, ib) // most likely not needed
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
		const matches = sub.match(this.plugin.settings.triggerFromFirst ? this.queryRegFi : this.queryRegex);
		if (matches == null || matches.groups.sc == null || matches.groups.col == null
			|| (this.plugin.settings.strictTrigger && (matches.groups.key && matches.groups.col.length % 2 === 0)) // don't match dataview key::value
			|| (this.plugin.settings.strictTrigger && (matches.groups.col.length == 1 && !Number.isNaN(Number(matches.groups.key)))) // don't match HH:MM(:SS)
		) return null;
		// if (matches != null) console.log(matches)
		return {
			end: cursor,
			start: {
				ch: sub.lastIndexOf(matches.groups.sc) - matches.groups.col.length,
				line: cursor.line,
			},
			query: matches.groups.col + matches.groups.sc,
		}
	}

	getSuggestions(context: EditorSuggestContext): Gemoji[] {
		// console.time('query')
		let emojiQuery = context.query.replace(/:/g, "")
		if (this.plugin.settings.latinize) emojiQuery = uFuzzy.latinize(emojiQuery)

		// i mean, maybe casting here as normal array isn't the best, but i checked the search func
		// and as far as i know, it doesen't modify the haystack? and it's faster than Array.from()
		const [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodes as string[], emojiQuery);
		let suggestions: ExtGemoji[] = []

		// using info.idx here instead of idxs because uf.info() may have
		// further reduced the initial idxs based on prefix/suffix rules	
		const idxs2 = info?.idx ?? idxs;
		for (let i = 0; i <  Math.min((order?.length || 0), this.resultLimit); i++) {
			const index = idxs2[order[i]]
			const sc = this.plugin.shortcodes[index]
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
		// console.timeEnd('query') // we get <1 ms query times on 2k emoji, and 1% max sub 7ms
		// console.log('query:', emojiQuery, 'sugg:', suggestions, searchResult)
		return suggestions
	}

	renderSuggestion(suggestion: ExtGemoji, el: HTMLElement) {
		const outer = el.createDiv({ cls: "EA-suggester-container" });
		let shortcodeDiv = createDiv({ cls: "EA-shortcode", title: `shortcode: ${suggestion.names[0]}` })
		if (this.plugin.settings.highlightMatches) {
			shortcodeDiv = slimHighlight(suggestion.matchedName, suggestion.range)
		} else {
			shortcodeDiv.setText(suggestion.matchedName);
		}
		if (suggestion.isInHistory && this.plugin.settings.considerHistory) {
			shortcodeDiv.appendChild(iconFactory('history'))
		}
		if (suggestion.matchedBy === 'tag') {
			if (this.plugin.settings.tagShowShortcode) {
				const elTagSc = shortcodeDiv.createDiv({ cls: 'EA-tag-shortcode' })
				elTagSc.appendChild(iconFactory('chevrons-right'))
				elTagSc.createSpan({ cls: "EA-tag-sc" }).setText(suggestion.names[0])
			} else {
				shortcodeDiv.appendChild(iconFactory('tags'))
			}
		}
		outer.appendChild(shortcodeDiv)
		outer.createDiv({ cls: "EA-emoji", title: suggestion.names[0] }).setText(suggestion.emoji);
	}

	selectSuggestion(suggestion: ExtGemoji): void {
		if(!this.context) return;
		const { start, end } = this.context;
		const shortcode = suggestion.names.includes(suggestion.matchedName) ? suggestion.matchedName : suggestion.names[0]
		const outEm = suggestion.names.some(n => windowsSupportedFirstChar.includes(n)) && suggestion.emoji.split("").length > 1 
			? suggestion.emoji.split("")[0] 
			: suggestion.emoji;
		const repl = this.plugin.settings.immediateReplace ? outEm : `:${shortcode}: `;

		this.context.editor.replaceRange(repl, start, end);
		this.plugin.updateHistory(suggestion.matchedName);
	}
}