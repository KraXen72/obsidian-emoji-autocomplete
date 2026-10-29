import { readFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version) throw new Error('Pass the release version as the first argument.');

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split('\n');
const heading = `## ${version} - `;
const start = lines.findIndex(line => line.startsWith(heading));
if (start === -1) throw new Error(`No changelog entry found for ${version}.`);

const nextHeading = lines.findIndex((line, index) => index > start && line.startsWith('## '));
const end = nextHeading === -1 ? lines.length : nextHeading;
const notes = lines.slice(start + 1, end).join('\n').trim();
if (!notes) throw new Error(`The changelog entry for ${version} is empty.`);

process.stdout.write(`${notes}\n`);
