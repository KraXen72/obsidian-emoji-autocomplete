import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

// Bundle the real plugin with a small Obsidian stub, without adding a DOM dependency.
const { outputFiles } = await build({
	stdin: {
		contents: `export { default as EmojiPlugin } from './main';
			export { DEFAULT_SETTINGS } from './settings';
			export { emojiProcessor } from './emojiPostProcessor';
			export { gemoji } from 'gemoji';`,
		resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	external: ['obsidian'],
	platform: 'node',
	format: 'cjs',
	write: false,
});

function loadPlugin() {
	class Plugin {
		saveData() { return Promise.resolve(); }
		addSettingTab() {}
		registerEditorSuggest(suggester) { this.suggester = suggester; }
		registerMarkdownPostProcessor(processor) { this.process = processor; }
	}
	const context = {
		module: { exports: {} },
		Node: { TEXT_NODE: 3 },
		console: { log() {} },
		require: () => ({ Plugin, EditorSuggest: class {}, PluginSettingTab: class {}, Notice: class {} }),
	};
	// Cached settings, suggestions, and Markdown rendering must not measure fonts or layout.
	for (const name of ['document', 'getComputedStyle']) {
		Object.defineProperty(context, name, {
			get() { throw new Error(`Unexpected rendering work: ${name}`); },
		});
	}
	vm.runInNewContext(outputFiles[0].text, context);
	return context.module.exports;
}

/** Track DOM reads and writes; reject APIs that could force layout. */
function createNode(text, children = [], nodeName = '#text') {
	return {
		nodeName,
		nodeType: nodeName === '#text' ? 3 : 1,
		reads: 0,
		writes: 0,
		visits: 0,
		get innerText() { throw new Error('innerText can force layout'); },
		get offsetWidth() { throw new Error('offsetWidth forces layout'); },
		getBoundingClientRect() { throw new Error('Geometry reads force layout'); },
		get childNodes() { this.visits++; return children; },
		get textContent() {
			this.reads++;
			return nodeName === '#text' ? text : children.map(child => child.textContent).join('');
		},
		set textContent(value) { this.writes++; text = value; },
	};
}

async function createCachedPlugin() {
	const { EmojiPlugin, DEFAULT_SETTINGS, gemoji } = loadPlugin();
	const plugin = new EmojiPlugin();
	plugin.settings = structuredClone(DEFAULT_SETTINGS);
	plugin.settings.emojiSupported = Object.fromEntries(gemoji.map(emoji => [emoji.names[0], true]));
	plugin.loadSettings = () => plugin.saveSettings();
	await plugin.onload();
	return plugin;
}

test('Tasks-like text with dates, times, URLs, and unknown shortcodes causes no DOM writes', () => {
	const { emojiProcessor } = loadPlugin();
	const leaves = Array.from({ length: 1000 }, () => createNode('Task due 2026-10-29 12:30 https://example.com :unknown:'));
	const root = createNode('', leaves, 'DIV');
	emojiProcessor(root);
	assert.equal(root.writes, 0);
	assert.equal(root.visits, 1);
	assert.ok(leaves.every(node => node.writes === 0));
});

test('many shortcodes use one DOM traversal and one write per changed text node', () => {
	const { emojiProcessor } = loadPlugin();
	const leaves = Array.from({ length: 1000 }, () => createNode(':smile: '.repeat(10)));
	const branches = leaves.map(node => createNode('', [node], 'SPAN'));
	const root = createNode('', branches, 'DIV');
	let lookups = 0;
	emojiProcessor(root, name => { lookups++; return name === 'smile' ? '😄' : undefined; });
	assert.equal(lookups, 10000);
	assert.equal(root.visits, 1);
	assert.ok(branches.every(node => node.visits === 1 && node.writes === 0));
	assert.ok(leaves.every(node => node.writes === 1 && node.textContent === '😄 '.repeat(10)));
});

test('subsequent rendering does no writes and code/math stay untouched', () => {
	const { emojiProcessor } = loadPlugin();
	const text = createNode(':smile:');
	const code = createNode('', [createNode(':smile:')], 'CODE');
	const math = createNode('', [createNode(':smile:')], 'MJX-CONTAINER');
	const root = createNode('', [text, code, math], 'DIV');
	emojiProcessor(root);
	emojiProcessor(root);
	assert.equal(text.writes, 1);
	assert.equal(code.visits, 0);
	assert.equal(math.visits, 0);
});

test('cached settings changes and history updates do no font or canvas work', async () => {
	const plugin = await createCachedPlugin();
	for (const preferTextSymbols of [false, true]) {
		plugin.settings.preferTextSymbols = preferTextSymbols;
		await plugin.saveSettings();
		plugin.updateHistory('smile');
	}
	assert.equal(plugin.settings.history.smile, 2);
	const text = createNode(':copyright: :minus: :unknown:');
	plugin.process(createNode('', [text], 'DIV'));
	assert.equal(text.textContent, '©\uFE0E ➖ :unknown:');
});

test('Markdown uses indexed lookup instead of scanning the emoji list', async () => {
	const plugin = await createCachedPlugin();
	let emojiReads = 0;
	plugin.emojiList = new Proxy(plugin.emojiList, {
		get(target, key) {
			if (['find', 'filter', 'map', 'forEach', Symbol.iterator].includes(key)) {
				throw new Error('Rendering must not scan the emoji list');
			}
			if (/^\d+$/.test(String(key))) emojiReads++;
			return Reflect.get(target, key);
		},
	});
	const text = createNode(':minus: :smile:');
	plugin.process(createNode('', [text], 'DIV'));
	assert.equal(text.textContent, '➖ 😄');
	assert.equal(emojiReads, 2);
});

test('broad searches only build match objects for the visible result limit', async () => {
	const plugin = await createCachedPlugin();
	const count = plugin.shortcodes.length;
	let rangeReads = 0;
	plugin.suggester.fuzzy.search = () => [[], {
		idx: Array.from({ length: count }, (_, index) => index),
		ranges: new Proxy({}, { get() { rangeReads++; return [0, 1]; } }),
	}, Array.from({ length: count }, (_, index) => index)];
	const suggestions = plugin.suggester.getSuggestions({ query: ':a' });
	assert.equal(suggestions.length, plugin.suggester.resultLimit);
	assert.equal(rangeReads, plugin.suggester.resultLimit);
});
