import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmojiSupportChecker, getEmojiFontStacks } from '../src/emojiSupport';
import { installCanvas } from './support/canvas';
import { startPlugin } from './support/plugin';

describe('emoji rendering detection', () => {
	it('accepts a single visible color glyph when both font stacks can render it', () => {
		const fonts = [];
		installCanvas(font => { fonts.push(font); return {}; });
		const supported = createEmojiSupportChecker(['Text Font', 'Interface Font']);

		const result = supported('😄');

		expect(result).toBe(true);
		expect(fonts).toContain('32px Text Font');
		expect(fonts).toContain('32px Interface Font');
	});

	it('rejects a decomposed sequence when its width exceeds one emoji', () => {
		installCanvas(() => ({ width: 64 }));
		const supported = createEmojiSupportChecker(['Twemoji Mozilla']);

		const result = supported('🧚‍♂️');

		expect(result).toBe(false);
	});

	it.each([47, 48])('accepts a visible glyph when its advance is %s pixels', width => {
		installCanvas(() => ({ width }));
		const supported = createEmojiSupportChecker(['Emoji Font']);

		const result = supported('🍉');

		expect(result).toBe(true);
	});

	it('rejects a glyph when its advance is just above the width limit', () => {
		installCanvas(() => ({ width: 48.01 }));
		const supported = createEmojiSupportChecker(['Emoji Font']);

		const result = supported('🍉');

		expect(result).toBe(false);
	});

	it('rejects blank keycaps even when their advance looks valid', () => {
		installCanvas(() => ({ blank: true }));
		const supported = createEmojiSupportChecker(['Twemoji Mozilla']);

		const result = supported('1️⃣');

		expect(result).toBe(false);
	});

	it('rejects text fallback when a later pixel changes with the requested drawing color', () => {
		installCanvas(() => ({ text: true }));
		const supported = createEmojiSupportChecker(['Text Font']);

		const result = supported('😄');

		expect(result).toBe(false);
	});

	it('rejects emoji when the interface stack renders text fallback despite text-stack support', () => {
		installCanvas(font => ({ text: font.includes('Interface') }));
		const supported = createEmojiSupportChecker(['Text Font', 'Interface Font']);

		const result = supported('😄');

		expect(result).toBe(false);
	});

	it('keeps emoji available when canvas rendering is unavailable', () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const supported = createEmojiSupportChecker(['Emoji Font']);

		const result = supported('😄');

		expect(result).toBe(true);
	});

	it('reuses one canvas across glyphs and configures its dimensions and baseline', () => {
		const { getContext, contexts } = installCanvas();
		const supported = createEmojiSupportChecker(['Emoji Font']);

		supported('😄');
		supported('1️⃣');

		expect(getContext).toHaveBeenCalledTimes(1);
		expect(contexts[0].canvas.width).toBe(64);
		expect(contexts[0].canvas.height).toBe(64);
		expect(contexts[0].textBaseline).toBe('alphabetic');
	});
});

describe('font-stack selection', () => {
	it('reads text and interface styles from separate probes and removes the temporary element', () => {
		const probes = [];
		// jsdom cannot resolve Obsidian's font variables; control only that browser boundary.
		vi.spyOn(window, 'getComputedStyle').mockImplementation(probe => {
			probes.push({ className: probe.className, fontFamily: probe.style.fontFamily, connected: probe.isConnected });
			return { fontFamily: probe.className === 'EA-emoji' ? 'Inter, Twemoji Windows' : 'Interface, Twemoji Windows' };
		});

		const stacks = getEmojiFontStacks();

		expect(stacks).toEqual(['Inter, Twemoji Windows', 'Interface, Twemoji Windows']);
		expect(probes).toEqual([
			{ className: 'EA-emoji', fontFamily: '', connected: true },
			{ className: '', fontFamily: 'var(--font-interface)', connected: true },
		]);
		expect(document.body.childElementCount).toBe(0);
	});

	it('deduplicates identical font stacks', () => {
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontFamily: 'Inter, Twemoji Windows' });

		const stacks = getEmojiFontStacks();

		expect(stacks).toEqual(['Inter, Twemoji Windows']);
	});

	it('removes the temporary probe when reading computed styles fails', () => {
		vi.spyOn(window, 'getComputedStyle').mockImplementation(() => { throw new Error('Style lookup failed'); });

		const resolve = () => getEmojiFontStacks();

		expect(resolve).toThrow('Style lookup failed');
		expect(document.body.childElementCount).toBe(0);
	});
});

describe('support cache lifecycle', () => {
	let plugin;

	beforeEach(async () => {
		({ plugin } = await startPlugin());
	});

	it('checks a missing primary emoji once rather than testing each alias separately', async () => {
		delete plugin.settings.emojiSupported.heavy_minus_sign;
		const glyphs = new Set();
		const { getContext } = installCanvas((font, emoji) => { glyphs.add(emoji); return {}; });

		await plugin.saveSettings();
		await plugin.saveSettings();

		expect(getContext).toHaveBeenCalledTimes(1);
		expect([...glyphs]).toEqual(['➖']);
		expect(plugin.settings.emojiSupported.heavy_minus_sign).toBe(true);
		expect(plugin.indexedGemojiFromShortcode('minus').emoji).toBe('➖');
	});

	it('keeps cached results when font-change events occur', async () => {
		const { getContext } = installCanvas();
		const original = { ...plugin.settings.emojiSupported };

		plugin.app.workspace.trigger('css-change');
		document.dispatchEvent(new Event('loadingdone'));
		await Promise.resolve();

		expect(getContext).not.toHaveBeenCalled();
		expect(plugin.settings.emojiSupported).toEqual(original);
	});

	it('checks all emoji when the support cache is explicitly cleared', async () => {
		plugin.settings.emojiSupported = {};
		const { getContext } = installCanvas();

		await plugin.saveSettings();

		expect(getContext).toHaveBeenCalledTimes(1);
		expect(plugin.settings.emojiSupported.one).toBe(true);
		expect(plugin.settings.emojiSupported.heavy_minus_sign).toBe(true);
		expect(Object.keys(plugin.settings.emojiSupported).length).toBeGreaterThan(1000);
	});
});
