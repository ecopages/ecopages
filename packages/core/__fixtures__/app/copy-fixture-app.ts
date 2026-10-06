import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fixtureAppDir = import.meta.dirname;
const FIXTURE_COPY_SKIPPED = new Set(['node_modules', '.eco', 'dist']);

/**
 * Copies this fixture app into a new temp directory and returns its real path; the caller removes it.
 *
 * @remarks
 * Suites that edit sources or write build output work on a private copy, so parallel suites that read
 * this folder never see a half-edited source or a half-written cache. `node_modules` is linked, not copied.
 */
export function copyFixtureApp(): string {
	const appDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-fixture-app-')));
	try {
		cpSync(fixtureAppDir, appDir, {
			recursive: true,
			filter: (source) => !FIXTURE_COPY_SKIPPED.has(path.relative(fixtureAppDir, source)),
		});
		symlinkSync(path.join(fixtureAppDir, 'node_modules'), path.join(appDir, 'node_modules'), 'dir');
	} catch (error) {
		rmSync(appDir, { recursive: true, force: true });
		throw error;
	}
	return appDir;
}
