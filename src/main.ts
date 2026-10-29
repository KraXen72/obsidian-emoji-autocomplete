
import { Plugin, EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, Notice } from 'obsidian';
import { gemoji, type Gemoji } from 'gemoji'
import uFuzzy from '@leeoniya/ufuzzy';

import { emojiFromShortcode, emojiProcessor } from './emojiPostProcessor';
import { DEFAULT_SETTINGS, EmojiPluginSettings, EmojiPluginSettingTab } from './settings';
import { slimHighlight, iconFactory } from './util';
import { createEmojiSupportChecker, getEmojiFontStacks } from './emojiSupport';

/** Maps an existing emoji name to new alias name(s) to add */
export type ExtraNameRecord = Record<string, string | string[]>
/** Maps an existing emoji name to new tag(s) to add */
export type ExtraTagRecord = Record<string, string | string[]>

/** Additional shortcode aliases, keyed by an existing gemoji name. */
export const emojiExtraNames: ExtraNameRecord = {
	large_blue_circle: 'blue_circle',
	heavy_minus_sign: 'minus',
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
/** Additional search tags, keyed by an existing gemoji name. */
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
 * Match shortcode queries from the second ASCII character, allowing spaces for multi-word searches.
 * Reject non-ASCII tokens because uFuzzy otherwise ignores them and returns misleading matches.
 */
export const QUERY_REGEX = /(?<key>[^\s:]+)?(?<col>:+)(?<sc>[a-zA-Z0-9_+-][a-zA-Z0-9_ +-]+)$/

/** Match shortcode queries from the first character, using the same ASCII restrictions. */
export const QUERY_REGEX_FI = /(?<key>[^\s:]+)?(?<col>:+)(?<sc>[a-zA-Z0-9_+-][a-zA-Z0-9_ +-]*)$/


// import DefinitionListPostProcessor from './definitionListPostProcessor';
interface EmojiSuggestion extends Gemoji {
	/** Alternating start/end offsets used to highlight matched text. */
	range: uFuzzy.Info['ranges'][number]
	matchedName: string,
	isInHistory: boolean,
	matchedBy: 'name' | 'tag'
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

		this.registerMarkdownPostProcessor(el => emojiProcessor(el, shortcode => {
			const emoji = this.indexedGemojiFromShortcode(shortcode);
			const resolved = emoji?.names.includes(shortcode) ? emoji.emoji : emojiFromShortcode(shortcode);
			return resolved ? this.getEmojiPresentation(resolved) : resolved;
		}));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migrate legacy array-format history to the frequency record format.
		// Old format: string[] (most-recent first). New format: Record<string, number>.
		if (Array.isArray(this.settings.history)) {
			const legacy = this.settings.history as unknown as string[]
			this.settings.history = Object.fromEntries(legacy.map(s => [s, 1]))
		}
		this.updateBodyFont(this.settings.polyfillFlags)
		this.updateEmojiList()
	}

	async saveSettings(updateEmoji = true, updateFont = false) {
		await this.saveData(this.settings);
		if (updateFont) this.updateBodyFont(this.settings.polyfillFlags);
		if (updateEmoji || updateFont) this.updateEmojiList();
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
		let isEmojiSupported: ReturnType<typeof createEmojiSupportChecker> | undefined;

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
			const primaryName = emoji.names[0];
			let supported = this.settings.emojiSupported[primaryName];

			if (supported === undefined) {
				// cached results need neither font measurement nor a canvas.
				isEmojiSupported ??= createEmojiSupportChecker(getEmojiFontStacks());
				supported = isEmojiSupported(emoji.emoji);
				this.settings.emojiSupported[primaryName] = supported;
			}
			// text symbols do not need to pass the color-emoji rendering check.
			const usesTextPresentation = this.getEmojiPresentation(emoji.emoji) !== emoji.emoji;
			if (this.settings.hideUnsupported && !supported && !usesTextPresentation) continue;

			for (const n of emoji.names) {
				shortcodeSet.add(n)
				this.shortcodeIndexes[n] = i
			}
			if (!this.settings.tagSearch || emoji.tags.length === 0) continue;
			for (const t of emoji.tags) {
				if (emojiFromShortcode(t) === undefined) tagSet.add(t)
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

	/** Request text presentation for ©, ®, and ™ without changing other emoji sequences. */
	getEmojiPresentation(emoji: string): string {
		if (!this.settings.preferTextSymbols) return emoji;
		return emoji.replace(/^([©®™])[\uFE0E\uFE0F]?$/u, '$1\uFE0E');
	}

	/** Find the emoji for a suggested shortcode or search tag. */
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

class EmojiSuggester extends EditorSuggest<EmojiSuggestion> {
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

	getSuggestions(context: EditorSuggestContext): EmojiSuggestion[] {
		let emojiQuery = context.query.replace(/:/g, "")
		if (this.plugin.settings.latinize) emojiQuery = uFuzzy.latinize(emojiQuery)

		let matches: Pick<EmojiSuggestion, 'matchedName' | 'range'>[];
		if (/^[+-]/.test(emojiQuery)) {
			// uFuzzy ignores + and treats - as negation; signed aliases need literal matching.
			matches = this.plugin.shortcodes
				.filter(shortcode => shortcode.startsWith(emojiQuery))
				.slice(0, this.resultLimit)
				.map(matchedName => ({ matchedName, range: [0, emojiQuery.length] }));
		} else {
			const [idxs, info, order] = this.fuzzy.search(this.plugin.shortcodes as string[], emojiQuery);
			const indexes = info?.idx ?? idxs;
			matches = (order ?? []).slice(0, this.resultLimit).map(index => ({
				matchedName: this.plugin.shortcodes[indexes[index]],
				range: info.ranges[index],
			}));
		}
		const suggestions: EmojiSuggestion[] = [];
		for (const { matchedName, range } of matches) {
			const emoji = this.plugin.indexedGemojiFromShortcode(matchedName);
			if (!emoji) continue;

			suggestions.push({
				...emoji,
				range,
				matchedName,
				isInHistory: matchedName in this.plugin.settings.history,
				matchedBy: emoji.names.includes(matchedName) ? 'name' : 'tag',
			});
		}
		return suggestions
	}

	renderSuggestion(suggestion: EmojiSuggestion, el: HTMLElement) {
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
		outer.createDiv({ cls: "EA-emoji", title: suggestion.names[0] }).setText(this.plugin.getEmojiPresentation(suggestion.emoji));
	}

	selectSuggestion(suggestion: EmojiSuggestion): void {
		if (!this.context) return;
		const { start, end } = this.context;
		const shortcode = suggestion.names.includes(suggestion.matchedName) ? suggestion.matchedName : suggestion.names[0]
		const replacement = this.plugin.settings.immediateReplace
			? this.plugin.getEmojiPresentation(suggestion.emoji)
			: `:${shortcode}: `;

		this.context.editor.replaceRange(replacement, start, end);
		this.plugin.updateHistory(suggestion.matchedName);
	}
}
