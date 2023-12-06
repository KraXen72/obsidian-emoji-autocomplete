import { MarkdownPostProcessor } from "obsidian";
import { nameToEmoji } from 'gemoji'

const skippedTagTypes = ["code", "mjx"]
const shortcodeRegex = /[:][^\s:][^ \n:]*[:]/g

export default class EmojiMarkdownPostProcessor {

  static emojiProcessor: MarkdownPostProcessor = (el: HTMLElement) => {
		const matches = el.innerText.match(shortcodeRegex)
		if (matches === null) return;
		matches.forEach(shortcode => EmojiMarkdownPostProcessor.emojiReplace(shortcode, el)); 
	}

	static emojiReplace(shortcode: string, el: HTMLElement){
		if ((typeof el.tagName ==="string") && (skippedTagTypes.some(tagType => el.tagName.toLowerCase().includes(tagType)))) return false;
		if (el.hasChildNodes()){
			el.childNodes.forEach((child: ChildNode) => this.emojiReplace(shortcode, child as HTMLElement));
		} else {
			if (!el.textContent.includes(shortcode)) return false;
			const sc = shortcode.replace(/^:/, '').replace(/:$/, '')
			const emoji = nameToEmoji[sc]
			if (typeof emoji === "undefined") return false;
			el.textContent = el.textContent.replace(shortcode, emoji);
		}
	}
}
