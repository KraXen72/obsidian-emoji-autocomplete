import type { Gemoji } from 'gemoji'

export const SearchKind = {
	PrimaryName: 0,
	AliasName: 1,
	Tag: 2,
} as const

export type SearchKind = typeof SearchKind[keyof typeof SearchKind]

/**
 * Search metadata stored in parallel arrays.
 *
 * `terms` is the only array passed to uFuzzy. The other arrays use the same
 * index positions to resolve a matched term back to its emoji and match type
 * without object allocations in the hot search path.
 */
export interface EmojiSearchIndex {
	/** Plain string haystack searched by uFuzzy. Duplicate strings are allowed. */
	terms: string[]
	/** Emoji index for each term. Shared tags can point to different emoji. */
	emojiIndexes: number[]
	/** Whether each term came from the primary shortcode, an alias, or a tag. */
	kinds: SearchKind[]
	/** History lookup key for each term. Tag entries use the primary shortcode. */
	historyKeys: string[]
	/** Number of unique tags included, used only for diagnostics/logging. */
	tagCount: number
}

/**
 * Builds the uFuzzy haystack and side-channel metadata.
 *
 * This intentionally does not collapse duplicate tag strings. If two emoji both
 * have the tag `face`, the haystack contains two `face` entries, each pointing
 * at its own emoji. That keeps matching index-less from uFuzzy's perspective
 * while still letting the plugin resolve each match to the right emoji.
 */
export function buildEmojiSearchIndex(emojiList: Pick<Gemoji, 'names' | 'tags'>[], tagSearch: boolean): EmojiSearchIndex {
	const terms: string[] = []
	const emojiIndexes: number[] = []
	const kinds: SearchKind[] = []
	const historyKeys: string[] = []
	const tagSet = new Set<string>()
	const seen = new Set<string>()

	/**
	 * Avoids exact duplicate rows for one emoji while preserving distinct rows
	 * for the same text across different emoji or different match kinds.
	 */
	const addEntry = (emojiIndex: number, term: string, kind: SearchKind, historyKey: string) => {
		const key = `${emojiIndex}\u0000${kind}\u0000${term}`
		if (seen.has(key)) return

		seen.add(key)
		terms.push(term)
		emojiIndexes.push(emojiIndex)
		kinds.push(kind)
		historyKeys.push(historyKey)
	}

	for (let emojiIndex = 0; emojiIndex < emojiList.length; emojiIndex++) {
		const emoji = emojiList[emojiIndex]

		for (let nameIndex = 0; nameIndex < emoji.names.length; nameIndex++) {
			addEntry(
				emojiIndex,
				emoji.names[nameIndex],
				nameIndex === 0 ? SearchKind.PrimaryName : SearchKind.AliasName,
				emoji.names[nameIndex],
			)
		}

		if (!tagSearch) continue

		for (const tag of emoji.tags) {
			tagSet.add(tag)
			addEntry(emojiIndex, tag, SearchKind.Tag, emoji.names[0])
		}
	}

	return { terms, emojiIndexes, kinds, historyKeys, tagCount: tagSet.size }
}
