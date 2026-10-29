import { describe, expect, it } from 'vitest';
import { applyEmojiExtras, computeHistory } from '../src/main';

describe('emoji aliases and tags', () => {
	it('adds single and multiple aliases when their source emoji exists', () => {
		const emoji = { names: ['smile'], tags: ['happy'], emoji: '😄' };
		const missing = { names: ['wave'], tags: [], emoji: '👋' };

		applyEmojiExtras([emoji, missing], { smile: ['grin', 'joyful'], unknown: 'absent' }, { smile: 'cheerful' });

		expect(emoji.names).toEqual(['smile', 'grin', 'joyful']);
		expect(emoji.tags).toEqual(['happy', 'cheerful']);
		expect(missing).toEqual({ names: ['wave'], tags: [], emoji: '👋' });
	});

	it('adds multiple tags when the emoji matches an existing alias', () => {
		const emoji = { names: ['thumbsup', '+1'], tags: [], emoji: '👍' };

		applyEmojiExtras([emoji], { '+1': 'approve' }, { '+1': ['yes', 'good'] });

		expect(emoji.names).toEqual(['thumbsup', '+1', 'approve']);
		expect(emoji.tags).toEqual(['yes', 'good']);
	});
});

describe('emoji history', () => {
	it('increments an existing entry without changing the original history', () => {
		const history = Object.freeze({ smile: 2, wave: 1 });

		const updated = computeHistory(history, 'smile', 2);

		expect(updated).toEqual({ smile: 3, wave: 1 });
		expect(history).toEqual({ smile: 2, wave: 1 });
	});

	it('keeps all entries when the history reaches its limit', () => {
		const history = { smile: 2 };

		const updated = computeHistory(history, 'wave', 2);

		expect(updated).toEqual({ smile: 2, wave: 1 });
	});

	it('evicts the least used existing entry when a new entry exceeds the limit', () => {
		const history = { smile: 10, wave: 2 };

		const updated = computeHistory(history, 'heart', 2);

		expect(updated).toEqual({ smile: 10, heart: 1 });
	});

	it('keeps the newly selected emoji when every count is tied', () => {
		const history = { smile: 1 };

		const updated = computeHistory(history, 'wave', 1);

		expect(updated).toEqual({ wave: 1 });
	});
});
