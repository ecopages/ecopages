import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const CANONICAL_PLACEHOLDER = '## [UNRELEASED] — TBD';
const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');

function findChangelogs(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === 'dist') continue;
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...findChangelogs(full));
			continue;
		}
		if (entry === 'CHANGELOG.md') {
			results.push(full);
		}
	}
	return results;
}

function main(): void {
	const mismatches: string[] = [];

	for (const changelogPath of findChangelogs(packagesRoot)) {
		const content = readFileSync(changelogPath, 'utf-8');
		const relativePath = path.relative(repoRoot, changelogPath);

		if (/## \[[^\]]*beta[^\]]*\]/i.test(content)) {
			mismatches.push(`${relativePath} (contains beta version header)`);
		}

		if (!content.includes('[UNRELEASED]')) {
			continue;
		}

		if (!content.includes(CANONICAL_PLACEHOLDER)) {
			mismatches.push(relativePath);
		}
	}

	if (mismatches.length > 0) {
		throw new Error(
			`CHANGELOG placeholder check failed:\n${mismatches.map((m) => `- ${m}`).join('\n')}\nExpected canonical placeholder: ${CANONICAL_PLACEHOLDER}`,
		);
	}

	console.log('All CHANGELOG placeholders are valid.');
}

main();
