// import { gemoji, type Gemoji } from "gemoji";

export function checkForInputBlock(
	cmEditor: CodeMirror.Editor,
	cursorPos: CodeMirror.Position,
): boolean {
	const tokenType = cmEditor.getTokenAt(cursorPos, true).type;
	return (typeof tokenType !== "string") ||
		(tokenType.indexOf("code") === -1 && tokenType.indexOf("math") === -1); // "code" matches "inline-code" or "codeblock"
}

// export function gemojiFromShortcode(shortcode: string, emojiList?: Gemoji[]) {
// 	let match: Gemoji;
// 	const candidates = emojiList ?? gemoji;
// 	for (const candidate of candidates) {
// 		if (candidate.names.some(n => n === shortcode)) {
// 			match = candidate;
// 			break;
// 		}
// 	}
// 	return match
// }

export function slimHighlight(str: string, r: [number, number]) {
	const el = createDiv({ cls: "EA-shortcode" })
	el.appendText(str.slice(0, r[0]))
	for (let i = 0; i < r.length; i = i+2) {
		el.createSpan({ cls: 'EA-hl' }).setText(str.slice(r[i], r[i+1]))
		el.appendText(str.slice(r[i+1], r[i+2]))
	}
	return el
}

let ctx: CanvasRenderingContext2D = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

const CANVAS_HEIGHT = 25;
const CANVAS_WIDTH = 20;
const textSize = Math.floor(CANVAS_HEIGHT / 2);

// Initialize convas context
ctx.font = textSize + 'px Arial, Sans-Serif';
ctx.textBaseline = 'top';
ctx.canvas.width = CANVAS_WIDTH * 2;
ctx.canvas.height = CANVAS_HEIGHT;

/** 
 * modified emoji support checker. original credit:
 * @see https://github.com/koala-interactive/is-emoji-supported/blob/master/src/is-emoji-supported.ts
 */
export function isEmojiSupported(unicode: string) {
	ctx.clearRect(0, 0, CANVAS_WIDTH * 2, CANVAS_HEIGHT);

	// Draw in red on the left
	ctx.fillStyle = '#FF0000';
	ctx.fillText(unicode, 0, 22);

	// Draw in blue on right
	ctx.fillStyle = '#0000FF';
	ctx.fillText(unicode, CANVAS_WIDTH, 22);

	const a = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
	const count = a.length;
	let i = 0;

	// Search the first visible pixel
	for (; i < count && !a[i + 3]; i += 4);

	// No visible pixel
	if (i >= count) {
		return false;
	}

	// Emoji has immutable color, so we check the color of the emoji in two different colors
	// the result show be the same.
	const x = CANVAS_WIDTH + ((i / 4) % CANVAS_WIDTH);
	const y = Math.floor(i / 4 / CANVAS_WIDTH);
	const b = ctx.getImageData(x, y, 1, 1).data;

	if (a[i] !== b[0] || a[i + 2] !== b[2]) {
		return false;
	}

	// Some emojis are a contraction of different ones, so if it's not
	// supported, it will show multiple characters
	if (ctx.measureText(unicode).width >= CANVAS_WIDTH) {
		return false;
	}

	// Supported
	return true;
}

const materialIconsSVGattr = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24' }
const materialIconsSVGattr2 = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
	'stroke-width': 2
}
export function iconFactory(icon: 'history' | 'chevrons-right' | 'tags') {
	switch (icon) {
		case 'history': {
			const iconHistory = createSvg('svg', { attr: {
				...materialIconsSVGattr,
				width: 16,
				height: 16,
			}})
			const iconHistoryG = iconHistory.createSvg('g', { attr: materialIconsSVGattr2 })
			iconHistoryG.createSvg('path', { attr: { d: 'M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8' }});
			iconHistoryG.createSvg('path', { attr: { d: 'M3 3v5h5m4-1v5l4 2' }});
			return iconHistory
		}
		case 'chevrons-right': {
			const iconChevronsRight = createSvg('svg', { attr: {
				...materialIconsSVGattr,
				width: 20,
				height: 20,
			}})
			iconChevronsRight.createSvg('path', { attr: {
				...materialIconsSVGattr2,
				d: 'm6 17l5-5l-5-5m7 10l5-5l-5-5'
			}})
			return iconChevronsRight;
		}
		case 'tags': {
			const iconTags = createSvg('svg', { attr: {
				...materialIconsSVGattr,
				width: 16,
				height: 16,
			}})
			const iconTagsG = iconTags.createSvg('g', { attr: materialIconsSVGattr2 })
			iconTagsG.createSvg('path', { attr: { d: 'M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5ZM6 9.01V9' } })
			iconTagsG.createSvg('path', { attr: { d: 'm15 5l6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19' } })
			return iconTags;
		}
		default:
			throw `unknown icon name ${icon}`
			break;
	}
}