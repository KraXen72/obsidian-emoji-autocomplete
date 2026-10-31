import { describe, expect, it, vi } from 'vitest';
import { createEmojiSupportChecker, getEmojiFontStacks } from '../src/emojiSupport';
import { iconFactory } from '../src/util';
import { startPlugin } from './support/plugin';

describe('popout window compatibility', () => {
	it('changes the active window font override when flag support is toggled', async () => {
		const { plugin } = await startPlugin();
		const popout = document.implementation.createHTMLDocument('Popout');
		document.body.style.setProperty('--font-text-override', 'Inter');
		popout.body.style.setProperty('--font-text-override', 'Noto Sans Mono');
		vi.stubGlobal('activeDocument', popout);
		plugin.settings.polyfillFlags = true;

		await plugin.saveSettings(false, true);

		expect(popout.body.style.getPropertyValue('--font-text-override')).toBe('EmojiAutocompleteFlagPolyfill, Noto Sans Mono');
		expect(document.body.style.getPropertyValue('--font-text-override')).toBe('Inter');
	});

	it.each(['history', 'chevrons-right', 'tags'])('creates the %s icon in the active document', name => {
		const popout = document.implementation.createHTMLDocument('Popout');
		vi.stubGlobal('activeDocument', popout);

		const icon = iconFactory(name);

		expect(icon.ownerDocument).toBe(popout);
		expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
	});

	it('resolves fonts using the popout document and its window', () => {
		const frame = document.createElement('iframe');
		document.body.append(frame);
		const popoutWindow = frame.contentWindow;
		vi.stubGlobal('activeWindow', popoutWindow);
		vi.stubGlobal('activeDocument', frame.contentDocument);
		const computedStyle = vi.spyOn(popoutWindow, 'getComputedStyle').mockReturnValue({ fontFamily: 'Popout Font' });

		const stacks = getEmojiFontStacks();

		expect(stacks).toEqual(['Popout Font']);
		expect(computedStyle).toHaveBeenCalledTimes(2);
		expect(computedStyle.mock.calls.every(([probe]) => probe.ownerDocument === frame.contentDocument)).toBe(true);
		expect(frame.contentDocument.body.childElementCount).toBe(0);
	});

	it('creates the rendering canvas in the active document', () => {
		const frame = document.createElement('iframe');
		document.body.append(frame);
		vi.stubGlobal('activeDocument', frame.contentDocument);
		const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

		const supported = createEmojiSupportChecker(['Popout Font']);

		expect(getContext).toHaveBeenCalledTimes(1);
		expect(getContext.mock.contexts[0].ownerDocument).toBe(frame.contentDocument);
		expect(supported('😄')).toBe(true);
	});
});

describe('icon errors', () => {
	it('throws an Error object when given an unknown icon', () => {
		const createUnknownIcon = () => iconFactory('unknown');

		expect(createUnknownIcon).toThrow(Error);
	});
});
