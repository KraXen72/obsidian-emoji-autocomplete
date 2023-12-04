import { MarkdownPostProcessor } from "obsidian";
import { gemojiFromShortcode } from "./util";

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
			el.textContent = el.textContent.replace(shortcode, gemojiFromShortcode(shortcode).emoji);
		}
	}
}
