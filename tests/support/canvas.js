import { vi } from 'vitest';

/** Supply deterministic glyph pixels at the canvas boundary, independent of installed fonts. */
export function installCanvas(glyphForFont = () => ({})) {
	const contexts = [];
	const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
		const context = {
			canvas: this,
			font: '',
			fillStyle: '',
			textBaseline: '',
			clearRect() {},
			fillText(emoji) { this.emoji = emoji; },
			measureText(emoji) { return { width: glyphForFont(this.font, emoji).width ?? 32 }; },
			getImageData() {
				const glyph = glyphForFont(this.font, this.emoji);
				if (glyph.blank) return { data: new Uint8ClampedArray(8) };
				const pixel = this.fillStyle === '#ff0000' ? [255, 0, 0, 255] : [0, 0, 255, 255];
				const coloredPixel = [250, 180, 20, 255];
				return { data: new Uint8ClampedArray([
					...coloredPixel,
					...(glyph.text ? pixel : coloredPixel),
				]) };
			},
		};
		contexts.push(context);
		return context;
	});
	return { getContext, contexts };
}
