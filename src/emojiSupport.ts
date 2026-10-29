const FONT_SIZE = 32;
const CANVAS_SIZE = FONT_SIZE * 2;
const MAX_EMOJI_WIDTH = FONT_SIZE * 1.5;

/** Resolve Obsidian's text and interface stacks, including theme and user overrides. */
export function getEmojiFontStacks(): string[] {
	const probe = document.createElement('span');
	probe.style.position = 'absolute';
	probe.style.visibility = 'hidden';
	document.body.appendChild(probe);

	try {
		probe.className = 'EA-emoji';
		const textFontStack = getComputedStyle(probe).fontFamily;
		probe.className = '';
		probe.style.fontFamily = 'var(--font-interface)';
		const interfaceFontStack = getComputedStyle(probe).fontFamily;

		return [...new Set([textFontStack, interfaceFontStack])];
	} finally {
		probe.remove();
	}
}

/**
 * Create a reusable canvas check for a single visible color emoji in each font stack.
 * Width is a heuristic for detecting sequences rendered as separate glyphs.
 */
export function createEmojiSupportChecker(fontStacks: readonly string[]): (emoji: string) => boolean {
	const canvas = document.createElement('canvas');
	canvas.width = CANVAS_SIZE;
	canvas.height = CANVAS_SIZE;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	// keep emoji available when the browser cannot provide a canvas.
	if (!context) return () => true;

	// canvas dimensions must be set before configuring drawing state.
	context.textBaseline = 'alphabetic';

	function render(emoji: string, color: string): Uint8ClampedArray {
		context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
		context.fillStyle = color;
		context.fillText(emoji, 0, FONT_SIZE * 1.5);
		return context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
	}

	return emoji => {
		for (const fontStack of fontStacks) {
			context.font = `${FONT_SIZE}px ${fontStack}`;
			const renderedWidth = context.measureText(emoji).width;
			// allow normal variation in emoji metrics, but reject two full-width glyphs.
			if (renderedWidth > MAX_EMOJI_WIDTH) return false;

			// color emoji keep their colors; fallback text changes with fillStyle.
			const redPixels = render(emoji, '#ff0000');
			const bluePixels = render(emoji, '#0000ff');
			let hasVisiblePixels = false;
			for (let index = 0; index < redPixels.length; index++) {
				const channel = redPixels[index];
				if (channel !== bluePixels[index]) return false;

				const isAlphaChannel = index % 4 === 3;
				if (isAlphaChannel && channel > 0) hasVisiblePixels = true;
			}
			if (!hasVisiblePixels) return false;
		}
		return true;
	};
}
