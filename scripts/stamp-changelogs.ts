import path from 'node:path';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

const CHANGELOG_PLACEHOLDER = '## [UNRELEASED] — TBD';

/**
 * Recursively finds all CHANGELOG.md files under the given directory.
 */
function findChangelogs(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules') continue;
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...findChangelogs(full));
		} else if (entry === 'CHANGELOG.md') {
			results.push(full);
		}
	}
	return results;
}

/**
 * Replaces the [UNRELEASED] — TBD placeholder in a CHANGELOG file with the
 * given version and date. Returns true if the file was updated.
 */
function stampChangelog(filePath: string, version: string, date: string): boolean {
	const content = readFileSync(filePath, 'utf-8');
	if (!content.includes(CHANGELOG_PLACEHOLDER)) return false;
	const stamped = content.replace(CHANGELOG_PLACEHOLDER, `## [${version}] — ${date}`);
	writeFileSync(filePath, stamped, 'utf-8');
	return true;
}

/**
 * Stamps all CHANGELOG.md files under the packages directory that contain the
 * unreleased placeholder with the given version and today's date.
 */
export function stampAllChangelogs(version: string, logger: Logger): void {
	const packagesRoot = path.resolve(import.meta.dirname, '../packages');
	const today = new Date().toISOString().slice(0, 10);
	let count = 0;

	for (const changelog of findChangelogs(packagesRoot)) {
		if (stampChangelog(changelog, version, today)) {
			logger.info(`Stamped ${changelog}`);
			count++;
		}
	}

	if (count === 0) {
		logger.info('No CHANGELOG placeholders found — nothing to stamp.');
	} else {
		logger.info(`Stamped ${count} CHANGELOG(s) with v${version}`);
	}
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const appLogger = new Logger('[@ecopages/stamp-changelogs]');
	if (!rootPackage.version) {
		throw new Error('Root package.json does not have a version');
	}
	stampAllChangelogs(rootPackage.version, appLogger);
}
