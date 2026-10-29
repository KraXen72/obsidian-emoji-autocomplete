/** Build shortcode markup with alternating start/end match offsets highlighted. */
export function slimHighlight(text: string, ranges: readonly number[]) {
	const shortcode = createDiv({ cls: 'EA-shortcode' });
	shortcode.appendText(text.slice(0, ranges[0]));

	for (let index = 0; index < ranges.length; index += 2) {
		const start = ranges[index];
		const end = ranges[index + 1];
		const nextStart = ranges[index + 2];

		shortcode.createSpan({ cls: 'EA-hl' }).setText(text.slice(start, end));
		shortcode.appendText(text.slice(end, nextStart));
	}

	return shortcode;
}

const iconDefinitions = {
	history: {
		size: 16,
		paths: [
			'M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8',
			'M3 3v5h5m4-1v5l4 2',
		],
	},
	'chevrons-right': {
		size: 20,
		paths: ['m6 17l5-5l-5-5m7 10l5-5l-5-5'],
	},
	tags: {
		size: 16,
		paths: [
			'M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5ZM6 9.01V9',
			'm15 5l6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19',
		],
	},
} as const;

/** Create a suggestion icon in the active document. */
export function iconFactory(name: keyof typeof iconDefinitions) {
	if (!Object.prototype.hasOwnProperty.call(iconDefinitions, name)) {
		throw new Error(`Unknown icon name: ${String(name)}`);
	}

	const definition = iconDefinitions[name];
	const container = activeDocument.createDocumentFragment();
	const icon = container.createSvg('svg', {
		attr: {
			xmlns: 'http://www.w3.org/2000/svg',
			viewBox: '0 0 24 24',
			width: definition.size,
			height: definition.size,
		},
	});
	const group = icon.createSvg('g', {
		attr: {
			fill: 'none',
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 2,
		},
	});

	for (const path of definition.paths) {
		group.createSvg('path', { attr: { d: path } });
	}

	return icon;
}
