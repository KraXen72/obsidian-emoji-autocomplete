import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: { alias: { obsidian: fileURLToPath(import.meta.resolve('obsidian-test-mocks/obsidian')) } },
	test: {
		environment: 'jsdom',
		setupFiles: ['tests/support/setup.js'],
		include: ['tests/*.test.js'],
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			reporter: ['text', 'html'],
			thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
		},
	},
});
