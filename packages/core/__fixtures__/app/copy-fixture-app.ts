import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const coreFixtureAppDir = import.meta.dirname;
const FIXTURE_COPY_SKIPPED = /^(?:node_modules|dist(?:-.+)?|\.eco(?:-.+)?)$/;

/**
 * Copies a fixture app into a new directory and returns its real path; the caller removes it.
 *
 * @remarks
 * Suites that edit sources or write build output work on a private copy, so parallel suites that read
 * the source folder never see a half-edited source or a half-written cache. `node_modules` is linked, not
 * copied, and top-level build output and caches (`dist`, `dist-*`, `.eco`, `.eco-*`) are left out.
 * `sourceDir` defaults to this fixture app and may name any other workspace app, such as an e2e fixture.
 * The copy goes to a fresh temp directory unless `destinationDir` is given; that folder is emptied first.
 */
export function copyFixtureApp(sourceDir: string = coreFixtureAppDir, destinationDir?: string): string {
	if (destinationDir) {
		rmSync(destinationDir, { recursive: true, force: true });
		mkdirSync(destinationDir, { recursive: true });
	}
	const appDir = realpathSync(destinationDir ?? mkdtempSync(path.join(tmpdir(), 'eco-fixture-app-')));
	try {
		cpSync(sourceDir, appDir, {
			recursive: true,
			filter: (source) => !FIXTURE_COPY_SKIPPED.test(path.relative(sourceDir, source)),
		});
		symlinkSync(path.join(sourceDir, 'node_modules'), path.join(appDir, 'node_modules'), 'dir');
	} catch (error) {
		rmSync(appDir, { recursive: true, force: true });
		throw error;
	}
	return appDir;
}
