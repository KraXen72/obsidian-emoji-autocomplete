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