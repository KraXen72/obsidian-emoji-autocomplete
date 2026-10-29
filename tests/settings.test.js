import { Setting } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvas } from './support/canvas';
import { startPlugin } from './support/plugin';

describe.each(['legacy', 'declarative'])('%s settings controls', mode => {
	let plugin;
	let tab;
	let rows;

	beforeEach(async () => {
		({ plugin } = await startPlugin());
		tab = plugin.settingTabs__[0];
		// The mock host does not render declarative settings. Model that host entry
		// point explicitly, and remove the new API when testing the legacy fallback.
		tab.update = mode === 'declarative' ? vi.fn(renderDefinitions) : undefined;
		rows = vi.spyOn(Setting.prototype, 'constructor__');
		renderTab();
	});

	function renderDefinitions() {
		tab.containerEl.empty();
		for (const definition of tab.getSettingDefinitions()) {
			if (definition.visible && !definition.visible()) continue;

			const row = new Setting(tab.containerEl).setName(definition.name);
			if (definition.desc) row.setDesc(definition.desc);
			definition.render(row);
		}
	}

	function renderTab() {
		if (mode === 'declarative') tab.update();
		else tab.display();
	}

	function setting(name) {
		const row = rows.mock.contexts.find(item => item.nameEl.textContent === name);
		expect(row, `Missing setting: ${name}`).toBeDefined();
		return row;
	}

	it('exposes names and descriptions without rendering or saving during indexing', () => {
		const save = vi.spyOn(plugin, 'saveData');
		const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		rows.mockClear();

		const definitions = tab.getSettingDefinitions();

		expect(definitions.map(item => item.name)).toContain('Re-check emoji support');
		expect(definitions.find(item => item.name === 'Remove diacritics').desc.textContent)
			.toContain(':štár');
		expect(rows).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(canvas).not.toHaveBeenCalled();
	});

	it('refreshes dependent controls through the active host renderer', async () => {
		const display = vi.spyOn(tab, 'display');
		const toggle = setting('Suggest emoji by tags').components[0];
		if (mode === 'declarative') tab.update.mockClear();

		expect(plugin.tags.size).toBeGreaterThan(0);

		await toggle.changeCallback(false);

		expect(plugin.tags.size).toBe(0);
		expect(tab.containerEl.textContent).not.toContain('Show shortcode on tag results');
		if (mode === 'declarative') {
			expect(tab.update).toHaveBeenCalledOnce();
			expect(display).not.toHaveBeenCalled();
		} else {
			expect(display).toHaveBeenCalledOnce();
		}
	});

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
		['Suggest recently used emoji', 'considerHistory'],
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

		renderTab();

		expect(tab.containerEl.textContent).not.toContain('Show shortcode on tag results');
		expect(tab.containerEl.textContent).not.toContain('History limit');
	});

	it.each([['10', 10], ['200', 100], ['', 25]])('saves history limit %s with the expected boundary behavior', async (input, expected) => {
		const field = setting('History limit').components[0];

		await field.changeCallback(input);

		expect(plugin.settings.historyLimit).toBe(expected);
		expect((await plugin.loadData()).historyLimit).toBe(expected);
	});

	it('clears history and refreshes its displayed count when the clear button is used', async () => {
		plugin.settings.history = { smile: 3, wave: 1 };
		renderTab();
		const button = setting('History limit').components[1];

		await button.clickHandler();

		expect(plugin.settings.history).toEqual({});
		expect((await plugin.loadData()).history).toEqual({});
		expect(tab.containerEl.textContent).toContain('0 emoji remembered');
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

	it('applies and removes the flag font when its toggle changes', async () => {
		const toggle = setting('Better flag emoji (Experimental)').components[0];
		document.body.style.setProperty('--font-text-override', 'Example Font');

		await toggle.changeCallback(true);

		expect(document.body.style.getPropertyValue('--font-text-override'))
			.toBe('EmojiAutocompleteFlagPolyfill, Example Font');

		await toggle.changeCallback(false);

		expect(document.body.style.getPropertyValue('--font-text-override')).toBe('Example Font');
	});

	it('does no rendering check when changing the text-symbol preference', async () => {
		const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const toggle = setting('Use text style for ©, ®, and ™').components[0];

		await toggle.changeCallback(false);

		expect(canvas).not.toHaveBeenCalled();
		expect(plugin.settings.preferTextSymbols).toBe(false);
	});
});
