import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setup, teardown } from 'obsidian-test-mocks/setup';

setup();
afterAll(teardown);

beforeEach(() => {
	document.head.replaceChildren();
	document.body.replaceChildren();
	document.body.removeAttribute('style');
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.head.replaceChildren();
	document.body.replaceChildren();
});
