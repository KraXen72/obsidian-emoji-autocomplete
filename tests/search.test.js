import { beforeEach, describe, expect, it } from 'vitest';
import { startPlugin } from './support/plugin';

describe('autocomplete triggering', () => {
	let plugin;
	let suggester;

	beforeEach(async () => {
		({ plugin, suggester } = await startPlugin());
	});

	function trigger(text, cursor = text.length) {
		return suggester.onTrigger({ line: 3, ch: cursor }, { getLine: () => text });
	}

	it('returns the exact replacement range when the query follows other text', () => {
		const text = 'hello :smile trailing';

		const result = trigger(text, 'hello :smile'.length);

		expect(result).toEqual({ query: ':smile', start: { line: 3, ch: 6 }, end: { line: 3, ch: 12 } });
	});

	it.each([':s', ':+1', ':-1', ':flag united'])('triggers when entering %s', text => {
		const result = trigger(text);

		expect(result?.query).toBe(text);
	});

	it.each(['key::value', '12:30', ':sob фыва', 'plain text', ':'])('does not trigger when entering %s', text => {
		const result = trigger(text);

		expect(result).toBeNull();
	});

	it('allows dataview-like queries when strict triggering is disabled', () => {
		plugin.settings.strictTrigger = false;

		const result = trigger('key::smile');

		expect(result?.query).toBe('::smile');
	});

	it('waits for a second query character when triggering from the first character is disabled', () => {
		plugin.settings.triggerFromFirst = false;

		const first = trigger(':D');
		const second = trigger(':Do');

		expect(first).toBeNull();
		expect(second?.query).toBe(':Do');
	});

	it('returns no trigger when autocomplete is disabled', () => {
		plugin.settings.suggester = false;

		const result = trigger(':smile');

		expect(result).toBeNull();
	});
});

describe('emoji search', () => {
	let plugin;
	let suggester;

	beforeEach(async () => {
		({ plugin, suggester } = await startPlugin());
	});

	it.each([[':+1', '👍'], [':-1', '👎'], [':minus', '➖']])('finds %s as a literal alias', (query, emoji) => {
		const results = suggester.getSuggestions({ query });

		expect(results[0].emoji).toBe(emoji);
		expect(results[0].matchedBy).toBe('name');
	});

	it('does not treat plus and minus as interchangeable', () => {
		const positive = suggester.getSuggestions({ query: ':+1' });
		const negative = suggester.getSuggestions({ query: ':-1' });

		expect(positive.every(result => result.matchedName.startsWith('+1'))).toBe(true);
		expect(negative.every(result => result.matchedName.startsWith('-1'))).toBe(true);
	});

	it('finds an emoji by its added search tag', () => {
		const results = suggester.getSuggestions({ query: ':yerba_mate' });

		expect(results[0]).toMatchObject({ emoji: '🧉', matchedName: 'yerba_mate', matchedBy: 'tag' });
	});

	it('removes tag-only matches when tag search is disabled', async () => {
		plugin.settings.tagSearch = false;
		await plugin.saveSettings();

		const results = suggester.getSuggestions({ query: ':yerba_mate' });

		expect(results).toEqual([]);
		expect(suggester.getSuggestions({ query: ':mate' })[0].emoji).toBe('🧉');
	});

	it('matches accented queries when diacritic removal is enabled', () => {
		const results = suggester.getSuggestions({ query: ':štár' });
		const plain = suggester.getSuggestions({ query: ':star' });

		expect(results.map(result => result.matchedName)).toEqual(plain.map(result => result.matchedName));
		expect(results.length).toBeGreaterThan(0);
	});

	it('does not latinize queries when diacritic removal is disabled', () => {
		plugin.settings.latinize = false;

		const results = suggester.getSuggestions({ query: ':štár' });

		expect(results.map(result => result.matchedName)).not.toContain('star');
	});

	it('returns no suggestions when the query has no matches', () => {
		const results = suggester.getSuggestions({ query: ':zzzzzzzzzz' });

		expect(results).toEqual([]);
	});

	it('limits broad matches to the visible result limit', () => {
		const results = suggester.getSuggestions({ query: ':ar' });

		expect(results).toHaveLength(suggester.resultLimit);
		expect(results.every(result => result.range.length > 0 && result.matchedName)).toBe(true);
	});

	it('boosts history within otherwise tied matches when history is enabled', async () => {
		const query = ':arrow';
		const initial = suggester.getSuggestions({ query });
		const selected = initial.find(result => result.matchedName === 'arrow_down');
		expect(selected).toBeDefined();
		plugin.settings.history.arrow_down = 100;

		const boosted = suggester.getSuggestions({ query });
		plugin.settings.considerHistory = false;
		const disabled = suggester.getSuggestions({ query });

		expect(boosted.findIndex(result => result.matchedName === 'arrow_down')).toBeLessThan(
			initial.findIndex(result => result.matchedName === 'arrow_down'),
		);
		expect(disabled.map(result => result.matchedName)).toEqual(initial.map(result => result.matchedName));
	});
});
