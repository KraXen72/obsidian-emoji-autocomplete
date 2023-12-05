import uFuzzy from "@leeoniya/ufuzzy";
import { gemoji, type Gemoji } from "gemoji";

export function checkForInputBlock(
	cmEditor: CodeMirror.Editor,
	cursorPos: CodeMirror.Position,
): boolean {
	const tokenType = cmEditor.getTokenAt(cursorPos, true).type;
	return (typeof tokenType !== "string") ||
		(tokenType.indexOf("code") === -1 && tokenType.indexOf("math") === -1); // "code" matches "inline-code" or "codeblock"
}

export function gemojiFromShortcode(shortcode: string, emojiList?: Gemoji[]) {
	let match: Gemoji;
	const candidates = emojiList ?? gemoji;
	for (const candidate of candidates) {
		if (candidate.names.some(n => n === shortcode)) {
			match = candidate;
			break;
		}
	}
	return match
}

export function slimHighlight(str: string, range: [number, number]) {
	const [start, end] = range;
	return `${str.slice(0, start)}<span class="ES-hl">${str.slice(start, end)}</span>${str.slice(end)}`
}

export const iconHistory = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m4-1v5l4 2"/></g></svg>`