import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import {
	createServerBundleStagingDirectory,
	publishServerBundleDirectory,
	resolvePublishedServerBundlePaths,
} from './server-bundle-publication.ts';

describe('server bundle publication', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) rmSync(tempDir, { recursive: true, force: true });
	});

	function createFixture(): { rootDir: string; serverOutdir: string } {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-publication-'));
		tempDirs.push(rootDir);
		const serverOutdir = path.join(rootDir, 'dist', '.server');
		fileSystem.ensureDir(serverOutdir);
		return { rootDir, serverOutdir };
	}

	it('publishes one complete staged generation', () => {
		const { rootDir, serverOutdir } = createFixture();
		writeFileSync(path.join(serverOutdir, 'app.mjs'), 'old app');
		writeFileSync(path.join(serverOutdir, 'eco.config.mjs'), 'old config');

		const stagingDir = createServerBundleStagingDirectory(serverOutdir);
		writeFileSync(path.join(stagingDir, 'app.mjs'), 'new app');
		writeFileSync(path.join(stagingDir, 'eco.config.mjs'), 'new config');

		publishServerBundleDirectory(stagingDir, serverOutdir);

		expect(readFileSync(path.join(serverOutdir, 'app.mjs'), 'utf8')).toBe('new app');
		expect(readFileSync(path.join(serverOutdir, 'eco.config.mjs'), 'utf8')).toBe('new config');
		expect(readdirSync(path.join(rootDir, 'dist')).filter((entry) => entry.includes('.previous-'))).toEqual([]);
	});

	it('restores the previous generation when publication fails', () => {
		const { rootDir, serverOutdir } = createFixture();
		writeFileSync(path.join(serverOutdir, 'app.mjs'), 'old app');

		expect(() => publishServerBundleDirectory(path.join(rootDir, 'missing-staging'), serverOutdir)).toThrow();

		expect(readFileSync(path.join(serverOutdir, 'app.mjs'), 'utf8')).toBe('old app');
	});

	it('maps staged outputs to their published paths', () => {
		const { serverOutdir } = createFixture();
		const stagingDir = createServerBundleStagingDirectory(serverOutdir);

		expect(resolvePublishedServerBundlePaths([path.join(stagingDir, 'app.mjs')], stagingDir, serverOutdir)).toEqual(
			[path.join(serverOutdir, 'app.mjs')],
		);
		expect(() =>
			resolvePublishedServerBundlePaths([path.join(stagingDir, '..', 'escaped.mjs')], stagingDir, serverOutdir),
		).toThrow(/escaped its staging directory/);
	});
});
