/** Build shortcode markup with alternating start/end match offsets highlighted. */
export function slimHighlight(str: string, r: readonly number[]) {
	const el = createDiv({ cls: "EA-shortcode" })
	el.appendText(str.slice(0, r[0]))
	for (let i = 0; i < r.length; i = i+2) {
		el.createSpan({ cls: 'EA-hl' }).setText(str.slice(r[i], r[i+1]))
		el.appendText(str.slice(r[i+1], r[i+2]))
	}
	return el
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
