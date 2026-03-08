import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repository root resolved from this script location.
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Source file extensions scanned by the portability checks.
 */
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

/**
 * A portability rule applied across one or more repository roots.
 */
type Check = {
	id: string;
	roots: string[];
	message: string;
	match: (relativePath: string, content: string) => number[];
	shouldSkip?: (relativePath: string) => boolean;
};

/**
 * A concrete portability violation found during scanning.
 */
type Violation = {
	checkId: string;
	message: string;
	relativePath: string;
	line: number;
	text: string;
};

/**
 * Recursively lists source files under a directory while skipping generated and vendor folders.
 */
async function listFiles(dirPath: string): Promise<string[]> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === '.git' ||
					entry.name === 'dist' ||
					entry.name === '.eco'
				) {
					return [];
				}

				return listFiles(fullPath);
			}

			return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
		}),
	);

	return files.flat();
}

/**
 * Returns every 1-based line number whose source text matches the provided pattern.
 * Comment-only lines are ignored so documentation examples do not fail the guardrail.
 */
function findMatchingLines(pattern: RegExp, content: string): number[] {
	const matches: number[] = [];
	const lines = content.split('\n');

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
			continue;
		}

		pattern.lastIndex = 0;
		if (pattern.test(line)) {
			matches.push(index + 1);
		}
	}

	return matches;
}

/**
 * Portability checks that enforce the current runtime-neutral authoring policy.
 */
const checks: Check[] = [
	{
		id: 'package-bun-fs',
		roots: ['packages'],
		message: 'Direct Bun filesystem APIs are not allowed in Ecopages packages outside @ecopages/file-system.',
		shouldSkip: (relativePath) =>
			relativePath.startsWith('packages/file-system/src/') ||
			relativePath.includes('/test/') ||
			relativePath.includes('.test.'),
		match: (relativePath, content) =>
			relativePath.startsWith('packages/') ? findMatchingLines(/\bBun\.(write|file)\b/, content) : [],
	},
	{
		id: 'app-runtime-subpaths',
		roots: ['apps', 'examples', 'playground', 'e2e'],
		message:
			'Apps, examples, playgrounds, and fixtures should use the root @ecopages/core exports instead of runtime subpaths.',
		match: (_relativePath, content) => findMatchingLines(/@ecopages\/core\/(bun|node)(?:\/[^'"\s]+)?/, content),
	},
];

/**
 * Runs every portability check and reports actionable violations.
 */
async function main(): Promise<void> {
	const violations: Violation[] = [];

	for (const check of checks) {
		for (const root of check.roots) {
			const absoluteRoot = path.join(rootDir, root);
			const files = await listFiles(absoluteRoot);

			for (const filePath of files) {
				const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
				if (check.shouldSkip?.(relativePath)) {
					continue;
				}

				const content = await readFile(filePath, 'utf8');
				const lines = content.split('\n');
				for (const line of check.match(relativePath, content)) {
					violations.push({
						checkId: check.id,
						message: check.message,
						relativePath,
						line,
						text: lines[line - 1]?.trim() ?? '',
					});
				}
			}
		}
	}

	if (violations.length === 0) {
		console.log('Portability checks passed');
		return;
	}

	console.error('Portability checks failed:\n');
	for (const violation of violations) {
		console.error(`- [${violation.checkId}] ${violation.relativePath}:${violation.line}`);
		console.error(`  ${violation.message}`);
		if (violation.text) {
			console.error(`  ${violation.text}`);
		}
	}

	process.exitCode = 1;
}

await main();
