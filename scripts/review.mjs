import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ESLint } from 'eslint';

const reportDirectory = path.resolve('reports');
const htmlReportPath = path.join(reportDirectory, 'obsidian-review.html');
const markdownReportPath = path.join(reportDirectory, 'obsidian-review.md');
const htmlEscapes = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

function escapeHtml(text) {
	return String(text).replace(/[&<>"']/g, character => htmlEscapes[character]);
}

/** Link file locations to the reviewed commit when running in GitHub Actions. */
function formatLocation(file, line) {
	const location = `${file}:${line}`;
	const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_SHA } = process.env;
	if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_SHA) return location;

	const encodedPath = file.split('/').map(encodeURIComponent).join('/');
	const commitUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_SHA}`;
	return `[${location}](${commitUrl}/${encodedPath}#L${line})`;
}

function formatSummary(results) {
	const findings = [];

	for (const result of results) {
		const file = path.relative(process.cwd(), result.filePath).split(path.sep).join('/');

		for (const message of result.messages) {
			const location = formatLocation(file, message.line ?? 1);
			const description = escapeHtml(message.message);
			const rule = escapeHtml(message.ruleId ?? 'parser');
			findings.push(`- ${location}: ${description} (${rule})`);
		}
	}

	const lines = [
		'## Obsidian advisory review',
		'',
		'Informational only; these checks do not gate builds or releases.',
		'',
		...findings,
	];
	if (findings.length === 0) lines.push('No findings.');

	return `${lines.join('\n')}\n`;
}

async function writeReports(html, markdown) {
	const writes = [
		writeFile(htmlReportPath, html),
		writeFile(markdownReportPath, markdown),
	];
	if (process.env.GITHUB_STEP_SUMMARY) {
		writes.push(appendFile(process.env.GITHUB_STEP_SUMMARY, markdown));
	}

	await Promise.all(writes);
}

try {
	await mkdir(reportDirectory, { recursive: true });

	const eslint = new ESLint();
	const results = await eslint.lintFiles(['src/**/*.ts', 'package.json']);
	const formatter = await eslint.loadFormatter('html');

	await writeReports(formatter.format(results), formatSummary(results));

	const findingCount = results.reduce((total, result) => total + result.messages.length, 0);
	console.log(`Obsidian advisory review: ${findingCount} findings. Open ${htmlReportPath} for details.`);
} catch (error) {
	// checker failures are advisory too; replace stale reports without gating other work.
	console.warn('Obsidian advisory review could not finish:', error);

	const message = escapeHtml(error instanceof Error ? error.message : error);
	const markdown = `## Obsidian advisory review\n\nThe checker could not finish: ${message}\n`;
	const html = `<!doctype html>
<meta charset="utf-8">
<title>Obsidian advisory review</title>
<h1>Review unavailable</h1>
<p>${message}</p>`;

	await writeReports(html, markdown).catch(reportError => {
		console.warn('Could not write advisory reports:', reportError);
	});
}
