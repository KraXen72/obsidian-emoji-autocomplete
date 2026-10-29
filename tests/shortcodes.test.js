import { beforeEach, describe, expect, it } from 'vitest';
import { emojiProcessor } from '../src/emojiPostProcessor';

describe('Markdown shortcode rendering', () => {
	let root;

	beforeEach(() => {
		root = document.createElement('div');
		document.body.append(root);
	});

	it('replaces repeated and nested shortcodes while preserving elements and attributes', () => {
		root.innerHTML = ':smile: <a href="https://example.com/:smile:">:heart: <strong>:smile:</strong></a> :smile:';
		const link = root.querySelector('a');

		emojiProcessor(root);

		expect(root.textContent).toBe('😄 ❤️ 😄 😄');
		expect(root.querySelector('a')).toBe(link);
		expect(link.getAttribute('href')).toBe('https://example.com/:smile:');
		expect(root.querySelector('strong').textContent).toBe('😄');
	});

	it.each(['CODE', 'MJX', 'MJX-CONTAINER'])('leaves shortcodes untouched when inside %s', tag => {
		const excluded = document.createElement(tag);
		excluded.innerHTML = '<span>:smile:</span>';
		root.append(excluded, document.createTextNode(':smile:'));

		emojiProcessor(root);

		expect(excluded.textContent).toBe(':smile:');
		expect(root.lastChild.textContent).toBe('😄');
	});

	it('leaves unknown names, dates, URLs, and incomplete shortcodes unchanged', () => {
		const text = '12:30 https://example.com :unknown: :not an emoji: :smile';
		root.textContent = text;

		emojiProcessor(root);

		expect(root.textContent).toBe(text);
	});

	it('preserves comments and does not combine shortcodes split across elements', () => {
		root.innerHTML = '<!-- :smile: -->:smi<span>le:</span>';

		emojiProcessor(root);

		expect(root.firstChild.textContent).toBe(' :smile: ');
		expect(root.textContent).toBe(':smile:');
	});

	it('uses a supplied resolver for custom aliases and retains unresolved names', () => {
		root.textContent = ':custom: :missing:';

		emojiProcessor(root, name => name === 'custom' ? '👍' : undefined);

		expect(root.textContent).toBe('👍 :missing:');
	});

	it.each(['constructor', 'toString', '__proto__'])('preserves unknown name %s even when it is an object property', name => {
		root.textContent = `:${name}:`;

		emojiProcessor(root);

		expect(root.textContent).toBe(`:${name}:`);
	});

	it('does not retain regex state between separate rendering calls', () => {
		const other = document.createElement('div');
		root.textContent = ':smile:';
		other.textContent = ':heart:';

		emojiProcessor(root);
		emojiProcessor(other);

		expect(root.textContent).toBe('😄');
		expect(other.textContent).toBe('❤️');
	});
});
