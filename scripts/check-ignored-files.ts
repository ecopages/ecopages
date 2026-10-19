import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

function git(args: string[], input?: string): string {
	return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Tracked files that an ignore rule also matches.
 *
 * @remarks
 * `pnpm pack` and `changeset publish` apply the repository ignore rules, so a tracked source file
 * that matches one builds and tests fine but is dropped from the published tarball.
 */
const ignored = git(['ls-files', '-ci', '--exclude-standard', '-z']).split('\0').filter(Boolean);

if (ignored.length === 0) {
	console.log('No tracked file matches an ignore rule.');
} else {
	const fields = git(['check-ignore', '-v', '--no-index', '--stdin', '-z'], `${ignored.join('\0')}\0`).split('\0');
	console.error(`${ignored.length} tracked file(s) match an ignore rule and would be left out of packed packages:`);
	for (let index = 0; index + 3 < fields.length; index += 4) {
		const [source, line, pattern, file] = fields.slice(index, index + 4);
		console.error(`  ${file}\n    ignored by "${pattern}" (${source}:${line})`);
	}
	console.error('Narrow the ignore rule so it no longer matches these files.');
	process.exitCode = 1;
}
