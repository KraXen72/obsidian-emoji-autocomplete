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

const cmp = new Intl.Collator('en').compare;

/** @see https://github.com/leeoniya/uFuzzy/blob/main/demos/compare.html#L295 */
export function typeAheadSort(info: uFuzzy.Info, haystack: string[], needle: string)  {
	let { idx, chars, terms, interLft2, interLft1, start, intraIns, interIns } = info;

	return idx.map((v, i) => i).sort((ia, ib) => (
		// most contig chars matched
		chars[ib] - chars[ia] ||
		// least char intra-fuzz (most contiguous)
		intraIns[ia] - intraIns[ib] ||
		// earliest start of match
		start[ia] - start[ib] ||
		// shortest match first
		haystack[idx[ia]].length - haystack[idx[ib]].length ||
		// most prefix bounds, boosted by full term matches
		(
			(terms[ib] + interLft2[ib] + 0.5 * interLft1[ib]) -
			(terms[ia] + interLft2[ia] + 0.5 * interLft1[ia])
		) ||
		// highest density of match (least span)
		//	span[ia] - span[ib] ||
		// highest density of match (least term inter-fuzz)
		interIns[ia] - interIns[ib] ||
		// alphabetic
		cmp(haystack[idx[ia]], haystack[idx[ib]])
	))
};