import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startPlugin } from './support/plugin';
import { installCanvas } from './support/canvas';

describe('settings persistence', () => {
	let plugin;

	beforeEach(async () => {
		({ plugin } = await startPlugin());
	});

	it.each([null, 'invalid', 42, []])('loads defaults when saved settings are not an object: %j', async saved => {
		vi.spyOn(plugin, 'loadData').mockResolvedValue(saved);
		installCanvas();

		await plugin.loadSettings();

		expect(plugin.settings.suggester).toBe(true);
		expect(plugin.settings.historyLimit).toBe(25);
		expect(Array.isArray(plugin.settings.history)).toBe(false);
	});

	it('writes settings once after filling missing support-cache entries', async () => {
		delete plugin.settings.emojiSupported.one;
		installCanvas();
		const save = vi.spyOn(plugin, 'saveData');

		await plugin.saveSettings();

		expect(save).toHaveBeenCalledTimes(1);
		expect(save.mock.calls[0][0].emojiSupported.one).toBe(true);
		expect((await plugin.loadData()).emojiSupported.one).toBe(true);
	});

	it('propagates write failures when the caller awaits a settings save', async () => {
		const failure = new Error('Disk full');
		vi.spyOn(plugin, 'saveData').mockRejectedValue(failure);

		const saving = plugin.saveSettings();

		await expect(saving).rejects.toThrow('Disk full');
	});

	it('handles rejected background history saves and reports the failure', async () => {
		const failure = new Error('Disk full');
		vi.spyOn(plugin, 'saveData').mockRejectedValue(failure);
		const saving = vi.spyOn(plugin, 'saveSettings');
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

		plugin.updateHistory('smile');
		await Promise.allSettled(saving.mock.results.map(result => result.value));

		expect(errorLog).toHaveBeenCalledWith('Could not save emoji history.', failure);
		expect(plugin.settings.history.smile).toBe(1);
	});
});
