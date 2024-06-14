import { nameToEmoji } from 'gemoji'

const shortcodeRegex = /[:][^\s:][^ \n:]*[:]/g

export function emojiProcessor(el: HTMLElement) {
	// textContent instead of innerText to avoid forcing style recalculations
	if (el.textContent.indexOf(":") === -1) return;
	const matches = el.textContent.match(shortcodeRegex)
	if (matches == null) return;
	for (let i = 0; i < matches.length; i++) {
		emojiReplace(el, matches[i])
	}
}

function emojiReplace(el: HTMLElement, shortcode: string) {
	if (el.tagName === "CODE" || el.tagName === "MJX") return false;
	if (el.hasChildNodes()) {
		for (let i = 0; i < el.childNodes.length; i++) {
			emojiReplace(el.childNodes[i] as HTMLElement, shortcode);
		}
	} else {
		if (!el.textContent.includes(shortcode)) return false;
		const sc = shortcode.slice(1, -1); // slice off the :
		const emoji = nameToEmoji[sc]
		if (emoji == null) return false;
		el.textContent = el.textContent.replace(shortcode, emoji);
	}
}
