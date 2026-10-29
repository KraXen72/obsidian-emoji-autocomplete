import { nameToEmoji } from 'gemoji';

const shortcodeRegex = /[:][^\s:][^ \n:]*[:]/g;
type EmojiResolver = (shortcode: string) => string | undefined;

/** Resolve database shortcode names without accepting inherited object properties. */
export function emojiFromShortcode(shortcode: string): string | undefined {
	return Object.prototype.hasOwnProperty.call(nameToEmoji, shortcode) ? nameToEmoji[shortcode] : undefined;
}

/** Replace shortcodes in rendered Markdown, leaving code and math nodes intact. */
export function emojiProcessor(
	el: HTMLElement,
	resolveEmoji: EmojiResolver = emojiFromShortcode,
): void {
	// textContent avoids the layout work caused by innerText.
	if (!el.textContent?.includes(':')) return;

	replaceShortcodes(el, resolveEmoji);
}

function replaceShortcodes(node: Node, resolveEmoji: EmojiResolver): void {
	if (node.nodeName === 'CODE' || node.nodeName.startsWith('MJX')) return;

	if (node.nodeType !== Node.TEXT_NODE) {
		node.childNodes.forEach(child => replaceShortcodes(child, resolveEmoji));
		return;
	}

	const text = node.textContent ?? '';
	if (!text.includes(':')) return;

	const replaced = text.replace(shortcodeRegex, shortcode => {
		const name = shortcode.slice(1, -1);
		return resolveEmoji(name) ?? shortcode;
	});
	// avoid mutation notifications and rendering work when nothing was replaced.
	if (replaced !== text) node.textContent = replaced;
}
