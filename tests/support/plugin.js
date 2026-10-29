import { gemoji } from 'gemoji';
import { App, Editor } from 'obsidian';
import EmojiPlugin from '../../src/main';
import manifest from '../../manifest.json';

/** Start the real plugin against the library's isolated, in-memory Obsidian host. */
export async function startPlugin(settings = {}) {
	const app = new App();
	const plugin = new EmojiPlugin(app, manifest);
	plugin.data__ = {
		history: {},
		emojiSupported: Object.fromEntries(gemoji.map(emoji => [emoji.names[0], true])),
		...structuredClone(settings),
	};
	await plugin.onload();
	return {
		plugin,
		app,
		suggester: plugin.editorSuggests__[0],
		process: plugin.markdownPostProcessors__[0],
	};
}

/** Create a selection context backed by the library's in-memory text editor. */
export function createEditorContext(suggester, query) {
	const editor = new Editor();
	editor.setValue(`before ${query} after`);
	const start = { line: 0, ch: 'before '.length };
	const end = { line: 0, ch: start.ch + query.length };
	suggester.context = { query, start, end, editor };
	return editor;
}
