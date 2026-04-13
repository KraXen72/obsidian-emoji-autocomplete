
import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, Notice } from 'obsidian';
import { gemoji, nameToEmoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import { emojiProcessor } from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { slimHighlight, isEmojiSupported, iconFactory } from './util';

/** Maps an existing emoji name to new alias name(s) to add */
export type ExtraNameRecord = Record<string, string | string[]>
/** Maps an existing emoji name to new tag(s) to add */
export type ExtraTagRecord = Record<string, string | string[]>

/** some emoji are only partially supported
 * - linux: we can add them without issue
 * - windows: we can add them, but we slice off the other characters that don't get rendered. 
 */
const partiallySupported = ['relaxed', 'tm', 'registered', 'copyright', 'm']

// add some extra names & tags to emoji
export const emojiExtraNames: ExtraNameRecord = {
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
	mag: "magnifying_glass",
	tooth: 'teeth',
}
export const emojiExtraTags: ExtraTagRecord = {
	zany_face: ['crazy', 'insane'],
	japanese_ogre: 'oni',
	rotating_light: 'alarm',
	shopping_cart: 'buy',
	mate: "yerba_mate",
	registered: 'reserved',
	tada: 'popper',
	white_check_mark: 'true',
	x: 'false',
}

/**
 * Pure function: enrich a cloned emoji list with extra names and tags.
 * Collects all additions for each emoji before applying them so the
 * update is atomic per emoji (either both names and tags land, or neither).
 * Exported for unit testing.
 */
export function applyEmojiExtras(
	emojiList: Gemoji[],
	extraNames: ExtraNameRecord,
	extraTags: ExtraTagRecord,
): void {
	for (const emoji of emojiList) {
		const namesToAdd: string[] = []
		const tagsToAdd: string[] = []

		for (const q in extraNames) {
			if (!emoji.names.includes(q)) continue;
			const val = extraNames[q]
			if (typeof val === 'string') namesToAdd.push(val)
			else if (Array.isArray(val)) namesToAdd.push(...val)
		}

		for (const q in extraTags) {
			if (!emoji.names.includes(q)) continue;
			const val = extraTags[q]
			if (typeof val === 'string') tagsToAdd.push(val)
			else if (Array.isArray(val)) tagsToAdd.push(...val)
		}

		emoji.names.push(...namesToAdd)
		emoji.tags.push(...tagsToAdd)
	}
}

/**
 * Pure function: increment the use-count for newEntry in the history record
 * and evict the least-used entry if the record exceeds limit.
 * The newly added entry is never evicted even on a tie.
 * Exported for unit testing.
 */
export function computeHistory(
	current: Record<string, number>,
	newEntry: string,
	limit: number,
): Record<string, number> {
	const next = { ...current, [newEntry]: (current[newEntry] ?? 0) + 1 }
	const keys = Object.keys(next)
	if (keys.length <= limit) return next
	// Find the least-used entry that is not the one just added and evict it.
	const victim = keys
		.filter(k => k !== newEntry)
		.reduce((a, b) => next[a] <= next[b] ? a : b)
	const { [victim]: _removed, ...trimmed } = next
	return trimmed
}

/**
 * Trigger regex — matches from the second character onwards (`:Do`, `:Dog`).
 * Restricted to ASCII word characters + spaces so that non-ASCII input
 * (e.g. Cyrillic: `:sob фыва`) does not trigger the suggester. uFuzzy
 * silently ignores non-ASCII tokens, which would cause `:sob фыва` to behave
 * identically to `:sob` and return results unexpectedly.
 * Spaces are still allowed after the first character for multi-word searches
 * like `:flag united`.
 * Exported for unit testing.
 */
export const QUERY_REGEX = /(?<key>[^\s:]+)?(?<col>:+)(?<sc>[a-zA-Z0-9_-][a-zA-Z0-9_ -]+)$/

/**
 * Trigger regex — also matches from the very first character (`:3`, `:D`).
 * Same ASCII restriction as QUERY_REGEX.
 * Exported for unit testing.
 */
export const QUERY_REGEX_FI = /(?<key>[^\s:]+)?(?<col>:+)(?<sc>[a-zA-Z0-9_-][a-zA-Z0-9_ -]*)$/


// import DefinitionListPostProcessor from './definitionListPostProcessor';
interface ExtGemoji extends Gemoji {
	/** match range */
	range: [number, number]
	matchedName: string,
	isInHistory: boolean,
	matchedBy: 'name' | 'tag' | 'mystery'
}

export default class EmojiShortcodesPlugin extends Plugin {
	settings!: EmojiPluginSettings;

	private emojiList!: Gemoji[];
	/** current emoji shortcode, tag, etc. haystack */
	private shortcodeList!: string[];
	/** set of strings that are ensured to only be tags */
	private tagSet!: Set<string>;
	private shortcodeIndexes: Record<string, number> = {}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new EmojiPluginSettingTab(this.app, this));
		this.registerEditorSuggest(new EmojiSuggester(this));

		this.registerMarkdownPostProcessor(emojiProcessor);
		//this.registerMarkdownPostProcessor(DefinitionListPostProcessor.definitionListProcessor);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migrate legacy array-format history to the frequency record format.
		// Old format: string[] (most-recent first). New format: Record<string, number>.
		if (Array.isArray(this.settings.history)) {
			const legacy = this.settings.history as unknown as string[]
			this.settings.history = Object.fromEntries(legacy.map(s => [s, 1]))
		}
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
		let prev = document.body.style.getPropertyValue(propName).split(",").map(f => f.trim()) ?? []
		prev = prev.filter(f => !(f === "??" || f === ""))

		if (prev[0] === polyfillFont) {
			if (value === 'toggle' || value === false) prev.shift();
		} else {
			if (value === 'toggle' || value === true) prev.unshift(polyfillFont);
		}
		document.body.style.setProperty(propName, prev.join(", "))
	}

	private enrichEmojiList() {
		applyEmojiExtras(this.emojiList, emojiExtraNames, emojiExtraTags)
	}

	private updateEmojiList() {
		// Clone each emoji's mutable arrays before enriching to prevent duplicate
		// pushes on subsequent calls (settings saves re-trigger this).
		this.emojiList = gemoji.map(e => ({ ...e, names: [...e.names], tags: [...e.tags] }))

		this.enrichEmojiList()
		const shortcodeSet: Set<string> = new Set()
		const tagSet: Set<string> = new Set()
		const showNotice = Object.keys(this.settings.emojiSupported).length === 0;
		this.shortcodeIndexes = {}

		for (let i = 0; i < this.emojiList.length; i++) {
			const emoji = this.emojiList[i]
			let supported = true

			for (const n of emoji.names) {
				if (!(n in this.settings.emojiSupported)) {
					if (emoji.category === 'Flags' && emoji.description.startsWith('flag:')
						|| ((navigator.userAgent.includes('Win') || navigator.userAgent.includes('Linux')) && partiallySupported.includes(n))
					) {
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
		this.settings = Object.assign(this.settings, {
			history: computeHistory(this.settings.history, matchedShortcode, this.settings.historyLimit)
		});
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

	constructor(plugin: EmojiShortcodesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.fuzzy = new uFuzzy({ sort: this.typeAheadSort, interChars: '.' });
	}

	/**
	 * loosly based on uFuzzy typeahead sort
	 * @see https://github.com/leeoniya/uFuzzy/blob/main/demos/compare.html#L295
	 */
	typeAheadSort = (info: uFuzzy.Info, haystack: string[], _needle: string) => {
		const { idx, chars, terms, interLft2, interLft1, start, intraIns, interIns } = info;
		const history = this.plugin.settings.considerHistory
			? this.plugin.settings.history
			: {} as Record<string, number>

		const freq  = (i: number) => history[haystack[idx[i]]] ?? 0
		const isTag = (i: number) => this.plugin.tags.has(haystack[idx[i]])
		const shortestSort = (ia: number, ib: number) => haystack[idx[ia]].length - haystack[idx[ib]].length

		const sorter = (ia: number, ib: number) => (
			chars[ib] - chars[ia]																				// most contig chars matched
			|| intraIns[ia] - intraIns[ib]															// least char intra-fuzz (most contiguous)
			|| start[ia] - start[ib]																		// prefix priority
			|| Math.log1p(freq(ib)) - Math.log1p(freq(ia))							// more-used emoji rank first
			|| (isTag(ia) ? 1 : 0) - (isTag(ib) ? 1 : 0)								// name match > tag match
			|| shortestSort(ia, ib)																			// shorter name as tiebreaker
			|| (																												// most prefix bounds, boosted by full term matches
				(terms[ib] + interLft2[ib] + 0.5 * interLft1[ib]) -
				(terms[ia] + interLft2[ia] + 0.5 * interLft1[ia])
			)
			|| interIns[ia] - interIns[ib]															// highest density of match (least term inter-fuzz)
			|| this.cmp(haystack[idx[ia]], haystack[idx[ib]])						// alphabetic
		)

		return idx.map((v, i) => i).sort(sorter)
	};

	onTrigger(cursor: EditorPosition, editor: Editor, _: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.suggester) return null;
		const sub = editor.getLine(cursor.line).slice(0, cursor.ch);
		const regex = this.plugin.settings.triggerFromFirst ? QUERY_REGEX_FI : QUERY_REGEX
		const matches = sub.match(regex);
		if (matches == null || matches?.groups?.sc == null || matches.groups.col == null
			|| (this.plugin.settings.strictTrigger && (matches.groups.key && matches.groups.col.length % 2 === 0))
			|| (this.plugin.settings.strictTrigger && (matches.groups.col.length == 1 && !Number.isNaN(Number(matches.groups.key))))
		) return null;
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
		let emojiQuery = context.query.replace(/:/g, "")
		if (this.plugin.settings.latinize) emojiQuery = uFuzzy.latinize(emojiQuery)

		const [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodes as string[], emojiQuery);
		let suggestions: ExtGemoji[] = []

		// using info.idx here instead of idxs because uf.info() may have
		// further reduced the initial idxs based on prefix/suffix rules	
		const idxs2 = info?.idx ?? idxs;
		for (let i = 0; i < Math.min((order?.length || 0), this.resultLimit); i++) {
			const index = idxs2[order[i]]
			const sc = this.plugin.shortcodes[index]
			const gemoji = this.plugin.indexedGemojiFromShortcode(sc)
			if (!gemoji) continue;
			const extGemoji: ExtGemoji = {
				...gemoji,
				range: info.ranges[order[i]] as [number, number],
				matchedName: sc,
				isInHistory: sc in this.plugin.settings.history,
				matchedBy: 'mystery'
			}
			if (gemoji.tags.includes(sc)) extGemoji.matchedBy = 'tag'
			else if (gemoji.names.includes(sc)) extGemoji.matchedBy = 'name'
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
		if (!this.context) return;
		const { start, end } = this.context;
		const shortcode = suggestion.names.includes(suggestion.matchedName) ? suggestion.matchedName : suggestion.names[0]
		const outEm = suggestion.names.some(n => partiallySupported.includes(n)) && suggestion.emoji.split("").length > 1
			? suggestion.emoji.split("")[0]
			: suggestion.emoji;
		const repl = this.plugin.settings.immediateReplace ? outEm : `:${shortcode}: `;

		this.context.editor.replaceRange(repl, start, end);
		this.plugin.updateHistory(suggestion.matchedName);
	}
}
