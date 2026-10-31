import obsidianmd from 'eslint-plugin-obsidianmd';

/** Keep the official rules and options, but make every enabled rule advisory. */
function asWarnings(config) {
	if (!config.rules) return config;

	const warningRules = Object.entries(config.rules).map(([name, setting]) => {
		const [severity, ...options] = Array.isArray(setting) ? setting : [setting];
		const warningSeverity = severity === 0 || severity === 'off' ? 'off' : 'warn';
		return [name, [warningSeverity, ...options]];
	});

	return { ...config, rules: Object.fromEntries(warningRules) };
}

export default [
	{ ignores: ['node_modules/**', 'main.js', 'tests/**', 'scripts/**', 'coverage/**', 'reports/**', '*.mjs'] },
	...obsidianmd.configs.recommended.map(asWarnings),
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: { 'obsidianmd/prefer-active-doc': 'warn' },
	},
	{
		linterOptions: { reportUnusedDisableDirectives: 'warn', reportUnusedInlineConfigs: 'warn' },
	},
];
