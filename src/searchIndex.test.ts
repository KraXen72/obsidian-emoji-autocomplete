import { describe, expect, test } from 'vitest'
import { buildEmojiSearchIndex, SearchKind } from './searchIndex'

describe('buildEmojiSearchIndex', () => {
	test('keeps duplicate tags as separate search entries', () => {
		const index = buildEmojiSearchIndex([
			{ names: ['grinning'], tags: ['face', 'happy'] },
			{ names: ['smile'], tags: ['face', 'happy'] },
			{ names: ['heart'], tags: ['love'] },
		], true)

		const faceEntries = index.terms
			.map((term, i) => ({ term, emojiIndex: index.emojiIndexes[i], kind: index.kinds[i] }))
			.filter(entry => entry.term === 'face')

		expect(faceEntries).toEqual([
			{ term: 'face', emojiIndex: 0, kind: SearchKind.Tag },
			{ term: 'face', emojiIndex: 1, kind: SearchKind.Tag },
		])
	})

	test('deduplicates identical entries for the same emoji, term, and kind only', () => {
		const index = buildEmojiSearchIndex([
			{ names: ['smile', 'smile'], tags: ['smile', 'smile'] },
		], true)

		expect(index.terms).toEqual(['smile', 'smile', 'smile'])
		expect(index.emojiIndexes).toEqual([0, 0, 0])
		expect(index.kinds).toEqual([SearchKind.PrimaryName, SearchKind.AliasName, SearchKind.Tag])
		expect(index.historyKeys).toEqual(['smile', 'smile', 'smile'])
	})

	test('excludes tag entries when tag search is disabled', () => {
		const index = buildEmojiSearchIndex([
			{ names: ['grinning', 'grin'], tags: ['face', 'happy'] },
		], false)

		expect(index.terms).toEqual(['grinning', 'grin'])
		expect(index.kinds).toEqual([SearchKind.PrimaryName, SearchKind.AliasName])
		expect(index.tagCount).toBe(0)
	})

	test('uses primary names as history keys for tag entries', () => {
		const index = buildEmojiSearchIndex([
			{ names: ['grinning', 'grin'], tags: ['face'] },
			{ names: ['smile'], tags: ['face'] },
		], true)

		const tagHistoryKeys = index.terms
			.map((term, i) => ({ term, historyKey: index.historyKeys[i], kind: index.kinds[i] }))
			.filter(entry => entry.kind === SearchKind.Tag)

		expect(tagHistoryKeys).toEqual([
			{ term: 'face', historyKey: 'grinning', kind: SearchKind.Tag },
			{ term: 'face', historyKey: 'smile', kind: SearchKind.Tag },
		])
	})
})
