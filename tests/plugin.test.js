import { gemoji, nameToEmoji } from 'gemoji';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { createEditorContext, startPlugin } from './support/plugin';

describe('plugin settings and indexing', () => {
	let plugin;

	beforeEach(async () => {
		({ plugin } = await startPlugin());
	});

	it('loads new defaults when saved settings do not contain them', () => {
		const enabled = plugin.settings.preferTextSymbols;

		expect(enabled).toBe(true);
		expect(plugin.settings.historyLimit).toBe(DEFAULT_SETTINGS.historyLimit);
	});

	it('migrates legacy history when loading saved settings', async () => {
		plugin.data__ = { ...plugin.settings, history: ['smile', 'wave', 'heart'] };

		await plugin.loadSettings();

		expect(plugin.settings.history).toEqual({ smile: 1, wave: 1, heart: 1 });
	});

	it('preserves explicitly disabled options when loading saved settings', async () => {
		plugin.data__ = { ...plugin.settings, preferTextSymbols: false, immediateReplace: false, tagSearch: false };

		await plugin.loadSettings();

		expect(plugin.settings).toMatchObject({ preferTextSymbols: false, immediateReplace: false, tagSearch: false });
		expect(plugin.tags.size).toBe(0);
	});

	it('does not accumulate aliases or mutate gemoji when settings are saved repeatedly', async () => {
		const original = structuredClone(gemoji);
		const shortcodes = [...plugin.shortcodes];

		for (let index = 0; index < 5; index++) await plugin.saveSettings();

		expect(plugin.shortcodes).toEqual(shortcodes);
		expect(plugin.indexedGemojiFromShortcode('minus').names.filter(name => name === 'minus')).toHaveLength(1);
		expect(gemoji).toEqual(original);
	});

	it('returns no emoji when an unknown shortcode is requested', () => {
		const result = plugin.indexedGemojiFromShortcode('not_an_emoji');

		expect(result).toBeNull();
	});

	it('hides unsupported emoji and restores them when filtering is disabled', async () => {
		plugin.settings.emojiSupported.smile = false;

		await plugin.saveSettings();
		const hidden = plugin.indexedGemojiFromShortcode('smile');
		plugin.settings.hideUnsupported = false;
		await plugin.saveSettings();

		expect(hidden?.emoji).not.toBe('😄');
		expect(plugin.indexedGemojiFromShortcode('smile').emoji).toBe('😄');
	});

	it('keeps text symbols available when color-emoji support is absent', async () => {
		Object.assign(plugin.settings.emojiSupported, { copyright: false, registered: false, tm: false });

		await plugin.saveSettings();

		for (const name of ['copyright', 'registered', 'tm']) {
			expect(plugin.indexedGemojiFromShortcode(name)).not.toBeNull();
		}
	});

	it('applies color-emoji filtering again when text presentation is disabled', async () => {
		plugin.settings.preferTextSymbols = false;
		Object.assign(plugin.settings.emojiSupported, { copyright: false, registered: false, tm: false });

		await plugin.saveSettings();

		for (const name of ['copyright', 'registered', 'tm']) {
			expect(plugin.indexedGemojiFromShortcode(name)).toBeNull();
		}
	});

	it('adds and removes the flag font without duplicating it or losing the text font', async () => {
		document.body.style.setProperty('--font-text-override', 'Inter, Twemoji Windows');
		plugin.settings.polyfillFlags = true;

		await plugin.saveSettings(false, true);
		await plugin.saveSettings(false, true);
		const enabled = document.body.style.getPropertyValue('--font-text-override');
		plugin.settings.polyfillFlags = false;
		await plugin.saveSettings(false, true);

		expect(enabled).toBe('EmojiAutocompleteFlagPolyfill, Inter, Twemoji Windows');
		expect(document.body.style.getPropertyValue('--font-text-override')).toBe('Inter, Twemoji Windows');
	});
});

describe('emoji selection and presentation', () => {
	let plugin;
	let suggester;
	let process;

	beforeEach(async () => {
		({ plugin, suggester, process } = await startPlugin());
	});

	it.each([['copyright', '©'], ['registered', '®'], ['tm', '™']])(
		'inserts and renders %s with text presentation by default', (name, symbol) => {
			const query = `:${name}:`;
			const editor = createEditorContext(suggester, query);
			const suggestion = suggester.getSuggestions({ query }).find(result => result.names.includes(name));
			const preview = document.createElement('div');
			preview.textContent = query;
			const picker = document.createElement('div');

			suggester.selectSuggestion(suggestion);
			suggester.renderSuggestion(suggestion, picker);
			process(preview);

			expect(editor.getValue()).toBe(`before ${symbol}\uFE0E after`);
			expect(picker.querySelector('.EA-emoji').textContent).toBe(`${symbol}\uFE0E`);
			expect(preview.textContent).toBe(`${symbol}\uFE0E`);
			expect(plugin.settings.history[name]).toBe(1);
		},
	);

	it.each(['copyright', 'registered', 'tm'])('uses the database value for %s when text style is disabled', async name => {
		plugin.settings.preferTextSymbols = false;
		await plugin.saveSettings();
		const query = `:${name}:`;
		const editor = createEditorContext(suggester, query);
		const suggestion = suggester.getSuggestions({ query }).find(result => result.names.includes(name));
		const preview = document.createElement('div');
		preview.textContent = query;

		suggester.selectSuggestion(suggestion);
		process(preview);

		expect(editor.getValue()).toBe(`before ${nameToEmoji[name]} after`);
		expect(preview.textContent).toBe(nameToEmoji[name]);
	});

	it.each(['1️⃣', '2️⃣', '🧚‍♂️', '☺️', 'Ⓜ️', '😄'])('preserves the full sequence when inserting %s', emoji => {
		const name = gemoji.find(entry => entry.emoji === emoji).names[0];
		const query = `:${name}:`;
		const editor = createEditorContext(suggester, query);
		const suggestion = suggester.getSuggestions({ query }).find(result => result.names.includes(name));

		suggester.selectSuggestion(suggestion);

		expect(editor.getValue()).toBe(`before ${emoji} after`);
	});

	it('inserts the chosen alias as a shortcode when immediate replacement is disabled', () => {
		plugin.settings.immediateReplace = false;
		const editor = createEditorContext(suggester, ':minus');
		const suggestion = suggester.getSuggestions({ query: ':minus' })[0];

		suggester.selectSuggestion(suggestion);

		expect(editor.getValue()).toBe('before :minus:  after');
	});

	it('inserts the primary shortcode when a tag result is selected', () => {
		plugin.settings.immediateReplace = false;
		const editor = createEditorContext(suggester, ':yerba_mate');
		const suggestion = suggester.getSuggestions({ query: ':yerba_mate' })[0];

		suggester.selectSuggestion(suggestion);

		expect(editor.getValue()).toBe('before :mate:  after');
		expect(plugin.settings.history.yerba_mate).toBe(1);
	});

	it('ignores selection when the editor context has closed', () => {
		const suggestion = suggester.getSuggestions({ query: ':smile' })[0];
		suggester.context = null;

		suggester.selectSuggestion(suggestion);

		expect(plugin.settings.history).toEqual({});
	});

	it('does not update history when history tracking is disabled', () => {
		plugin.settings.considerHistory = false;
		const editor = createEditorContext(suggester, ':smile');
		const suggestion = suggester.getSuggestions({ query: ':smile' })[0];

		suggester.selectSuggestion(suggestion);

		expect(editor.getValue()).toBe('before 😄 after');
		expect(plugin.settings.history).toEqual({});
	});

	it('renders real aliases but leaves search-only tags and unknown names untouched', () => {
		const preview = document.createElement('div');
		preview.textContent = ':minus: :+1: :-1: :yerba_mate: :unknown:';

		process(preview);

		expect(preview.textContent).toBe('➖ 👍 👎 :yerba_mate: :unknown:');
	});

	it.each(['constructor', 'toString', '__proto__'])('preserves unknown shortcode %s without throwing', name => {
		const preview = document.createElement('div');
		preview.textContent = `:${name}:`;

		process(preview);

		expect(preview.textContent).toBe(`:${name}:`);
	});

	it('renders a text symbol even when its emoji was excluded from suggestions', async () => {
		plugin.settings.preferTextSymbols = false;
		plugin.settings.emojiSupported.copyright = false;
		await plugin.saveSettings();
		plugin.settings.preferTextSymbols = true;
		const preview = document.createElement('div');
		preview.textContent = ':copyright:';

		process(preview);

		expect(preview.textContent).toBe('©\uFE0E');
	});

	it.each(['©', '®', '™'])('normalizes existing selectors when text style is requested for %s', symbol => {
		const inputs = [symbol, `${symbol}\uFE0E`, `${symbol}\uFE0F`];

		const results = inputs.map(input => plugin.getEmojiPresentation(input));

		expect(results).toEqual(inputs.map(() => `${symbol}\uFE0E`));
	});
});

describe('suggestion display', () => {
	let plugin;
	let suggester;
	let picker;

	beforeEach(async () => {
		({ plugin, suggester } = await startPlugin());
		picker = document.createElement('div');
	});

	it('highlights the matched shortcode when highlighting is enabled', () => {
		const suggestion = suggester.getSuggestions({ query: ':minus' })[0];

		suggester.renderSuggestion(suggestion, picker);

		expect(picker.querySelector('.EA-hl').textContent).toBe('minus');
		expect(picker.querySelector('.EA-shortcode').textContent).toBe('minus');
	});

	it('shows an unhighlighted shortcode when highlighting is disabled', () => {
		plugin.settings.highlightMatches = false;
		const suggestion = suggester.getSuggestions({ query: ':minus' })[0];

		suggester.renderSuggestion(suggestion, picker);

		expect(picker.querySelector('.EA-hl')).toBeNull();
		expect(picker.querySelector('.EA-shortcode').textContent).toBe('minus');
	});

	it('marks recently used suggestions when history is enabled', () => {
		plugin.settings.history.minus = 2;
		const suggestion = suggester.getSuggestions({ query: ':minus' })[0];

		suggester.renderSuggestion(suggestion, picker);

		expect(suggestion.isInHistory).toBe(true);
		expect(picker.querySelector('.EA-shortcode svg')).not.toBeNull();
	});

	it('shows the primary shortcode on tag results when that option is enabled', () => {
		plugin.settings.tagShowShortcode = true;
		const suggestion = suggester.getSuggestions({ query: ':yerba_mate' })[0];

		suggester.renderSuggestion(suggestion, picker);

		expect(picker.querySelector('.EA-tag-sc').textContent).toBe('mate');
		expect(picker.querySelector('.EA-tag-shortcode svg')).not.toBeNull();
	});

	it('shows the tag indicator without an extra shortcode when that option is disabled', () => {
		plugin.settings.tagShowShortcode = false;
		const suggestion = suggester.getSuggestions({ query: ':yerba_mate' })[0];

		suggester.renderSuggestion(suggestion, picker);

		expect(picker.querySelector('.EA-tag-sc')).toBeNull();
		expect(picker.querySelector('.EA-shortcode svg')).not.toBeNull();
	});
});
