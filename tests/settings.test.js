import { Setting } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvas } from './support/canvas';
import { startPlugin } from './support/plugin';

describe('settings controls', () => {
	let plugin;
	let tab;
	let rows;

	beforeEach(async () => {
		({ plugin } = await startPlugin());
		tab = plugin.settingTabs__[0];
		rows = vi.spyOn(Setting.prototype, 'constructor__');
		tab.display();
	});

	function setting(name) {
		const row = rows.mock.contexts.find(item => item.nameEl.textContent === name);
		expect(row, `Missing setting: ${name}`).toBeDefined();
		return row;
	}

	it('shows text-style symbols enabled when no preference has been saved', () => {
		const toggle = setting('Use text style for ©, ®, and ™').components[0];

		const enabled = toggle.getValue();

		expect(enabled).toBe(true);
	});

	it.each([
		['Emoji Autocomplete', 'suggester'],
		['Trigger from first character', 'triggerFromFirst'],
		['Stricter autocomplete trigger', 'strictTrigger'],
		['Highlight matched part of suggestion', 'highlightMatches'],
		['Suggest emoji by tags', 'tagSearch'],
		['Show shortcode on tag results', 'tagShowShortcode'],
		['Suggest recenly used emoji', 'considerHistory'],
		['Hide unsupported emoji', 'hideUnsupported'],
		['Immediate Emoji Replace', 'immediateReplace'],
		['Use text style for ©, ®, and ™', 'preferTextSymbols'],
		['Remove diacritics', 'latinize'],
		['Better flag emoji (Experimental)', 'polyfillFlags'],
	])('saves both toggle states when changing %s', async (name, key) => {
		const toggle = setting(name).components[0];

		await toggle.changeCallback(false);
		const disabled = (await plugin.loadData())[key];
		await toggle.changeCallback(true);
		const enabled = (await plugin.loadData())[key];

		expect(disabled).toBe(false);
		expect(enabled).toBe(true);
	});

	it('hides dependent controls when tags and history are disabled', () => {
		plugin.settings.tagSearch = false;
		plugin.settings.considerHistory = false;

		tab.display();

		expect(tab.containerEl.textContent).not.toContain('Show shortcode on tag results');
		expect(tab.containerEl.textContent).not.toContain('History Limit');
	});

	it.each([['10', 10], ['200', 100], ['', 25]])('saves history limit %s with the expected boundary behavior', async (input, expected) => {
		const field = setting('History Limit').components[0];

		await field.changeCallback(input);

		expect(plugin.settings.historyLimit).toBe(expected);
		expect((await plugin.loadData()).historyLimit).toBe(expected);
	});

	it('clears history and refreshes its displayed count when the clear button is used', async () => {
		plugin.settings.history = { smile: 3, wave: 1 };
		tab.display();
		const button = setting('Clear History (2 items)').components[0];

		await button.clickHandler();

		expect(plugin.settings.history).toEqual({});
		expect((await plugin.loadData()).history).toEqual({});
		expect(tab.containerEl.textContent).toContain('Clear History (0 items)');
	});

	it('rechecks rendering only when the explicit recheck button is used', async () => {
		const canvas = installCanvas(() => ({ blank: true }));
		const button = setting('Re-check emoji support').components[0];
		plugin.settings.emojiSupported.one = true;

		await button.clickHandler();

		expect(canvas.getContext).toHaveBeenCalledTimes(1);
		expect(plugin.settings.emojiSupported.one).toBe(false);
		expect(plugin.indexedGemojiFromShortcode('one')).toBeNull();
	});

	it('does no rendering check when changing the text-symbol preference', async () => {
		const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const toggle = setting('Use text style for ©, ®, and ™').components[0];

		await toggle.changeCallback(false);

		expect(canvas).not.toHaveBeenCalled();
		expect(plugin.settings.preferTextSymbols).toBe(false);
	});
});
