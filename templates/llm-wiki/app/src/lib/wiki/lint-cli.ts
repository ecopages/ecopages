import { join } from 'node:path';
import { env } from '../env';
import { lintWiki } from './lint';

const result = await lintWiki({
	wikiDir: env.WIKI_DIR,
	sourcesDir: env.SOURCES_DIR,
	wikiRoot: join(env.WIKI_DIR, '..'),
	categoryMode: env.WIKI_CATEGORY_MODE,
	homeSlug: env.WIKI_HOME_SLUG,
});

const errors = result.findings.filter((finding) => finding.severity === 'error');
const warnings = result.findings.filter((finding) => finding.severity === 'warning');

for (const finding of result.findings) {
	const page = finding.page ?? '';
	console.log(`${finding.severity.padEnd(7)} ${finding.code.padEnd(16)} ${page}  ${finding.message}`);
}

console.log(`\nwiki lint: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
