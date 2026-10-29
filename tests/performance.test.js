import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emojiProcessor } from '../src/emojiPostProcessor';
import { startPlugin } from './support/plugin';

describe('Markdown rendering performance safeguards', () => {
	let root;
	let observer;

	beforeEach(() => {
		root = document.createElement('div');
		document.body.append(root);
		observer = new MutationObserver(() => {});
		// These getters can force layout in Electron. Access is a regression even without timing it.
		Object.defineProperty(root, 'innerText', { get() { throw new Error('Layout-dependent text read'); } });
	});

	afterEach(() => observer.disconnect());

	it('makes no DOM writes when task rows contain only times, URLs, and unknown shortcodes', () => {
		const rowCount = 1000;
		root.innerHTML = '<span>Task due 2026-10-29 12:30 https://example.com :unknown:</span>'.repeat(rowCount);
		observer.observe(root, { subtree: true, characterData: true, childList: true });

		emojiProcessor(root);

		expect(observer.takeRecords()).toHaveLength(0);
		expect(root.children).toHaveLength(rowCount);
	});

	it('writes once per text node when many shortcodes share each row', () => {
		const rowCount = 1000;
		const emojiPerRow = 10;
		root.innerHTML = `<span>${':smile: '.repeat(emojiPerRow)}</span>`.repeat(rowCount);
		observer.observe(root, { subtree: true, characterData: true, childList: true });

		emojiProcessor(root);
		const firstPass = observer.takeRecords();
		emojiProcessor(root);
		const repeatPass = observer.takeRecords();

		expect(firstPass).toHaveLength(rowCount);
		expect(repeatPass).toHaveLength(0);
		expect(root.firstChild.textContent).toBe('😄 '.repeat(emojiPerRow));
	});
});

describe('cached plugin performance safeguards', () => {
	let plugin;
	let suggester;

	beforeEach(async () => {
		({ plugin, suggester } = await startPlugin());
	});

	it('does no font measurement or canvas work when settings and history use cached support', async () => {
		const computedStyle = vi.spyOn(window, 'getComputedStyle');
		const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

		plugin.settings.preferTextSymbols = false;
		await plugin.saveSettings();
		plugin.settings.preferTextSymbols = true;
		await plugin.saveSettings();
		plugin.updateHistory('smile');

		expect(computedStyle).not.toHaveBeenCalled();
		expect(canvas).not.toHaveBeenCalled();
		expect(plugin.settings.history.smile).toBe(1);
	});

	it('uses indexed lookup when many shortcodes are rendered', () => {
		let emojiReads = 0;
		plugin.emojiList = new Proxy(plugin.emojiList, {
			get(target, key) {
				if (/^\d+$/.test(String(key))) emojiReads++;
				return Reflect.get(target, key);
			},
		});
		const rowCount = 1000;
		const root = document.createElement('div');
		root.textContent = ':minus: :smile: '.repeat(rowCount);

		plugin.markdownPostProcessors__[0](root);

		expect(emojiReads).toBe(rowCount * 2);
		expect(root.textContent).toBe('➖ 😄 '.repeat(rowCount));
	});

	it('only reads highlight ranges for visible results when a broad search matches many aliases', () => {
		const shortcodeCount = plugin.shortcodes.length;
		let rangeReads = 0;
		// Isolate result construction from uFuzzy's own ranking work.
		vi.spyOn(suggester.fuzzy, 'search').mockReturnValue([[], {
			idx: Array.from({ length: shortcodeCount }, (_, index) => index),
			ranges: new Proxy({}, { get() { rangeReads++; return [0, 1]; } }),
		}, Array.from({ length: shortcodeCount }, (_, index) => index)]);

		const results = suggester.getSuggestions({ query: ':a' });

		expect(results).toHaveLength(suggester.resultLimit);
		expect(rangeReads).toBe(suggester.resultLimit);
	});
});
