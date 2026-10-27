import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { assertProductionDistComplete } from './production-dist-complete.ts';
import { PRODUCTION_ROUTES_FILENAME } from './production-route-list.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from './server/server-modules-manifest.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';

describe('assertProductionDistComplete', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	function writeJson(filePath: string, payload: unknown): void {
		fileSystem.ensureDir(path.dirname(filePath));
		writeFileSync(filePath, `${JSON.stringify(payload)}\n`);
	}

	function createCompleteDist(buildId = 'build-1') {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-dist-complete-'));
		tempDirs.push(rootDir);
		const serverDir = path.join(rootDir, 'dist', SERVER_BUNDLE_DIR);
		fileSystem.ensureDir(serverDir);
		writeFileSync(path.join(serverDir, SERVER_BUNDLE_FILENAME), 'export {};\n');
		writeFileSync(path.join(serverDir, 'page.mjs'), 'export {};\n');
		writeJson(path.join(serverDir, 'manifest.json'), {
			serverEntry: SERVER_BUNDLE_FILENAME,
			buildId,
		});
		writeJson(path.join(serverDir, PRODUCTION_ROUTES_FILENAME), {
			buildId,
			routes: [],
		});
		writeJson(path.join(serverDir, SERVER_MODULES_MANIFEST_FILENAME), {
			buildId,
			modules: { 'src/pages/index.tsx': 'page.mjs' },
		});
		return rootDir;
	}

	it('accepts a dist/ whose manifests share one build id and whose listed files exist', () => {
		const rootDir = createCompleteDist();
		expect(() => assertProductionDistComplete(rootDir, 'dist')).not.toThrow();
	});

	it('rejects manifests that disagree on the build id', () => {
		const rootDir = createCompleteDist('build-a');
		writeFileSync(
			path.join(rootDir, 'dist', SERVER_BUNDLE_DIR, PRODUCTION_ROUTES_FILENAME),
			`${JSON.stringify({ buildId: 'build-b', routes: [] })}\n`,
		);
		expect(() => assertProductionDistComplete(rootDir, 'dist')).toThrow(/disagree on the build id/);
	});

	it('rejects a listed server module that is missing', () => {
		const rootDir = createCompleteDist();
		fileSystem.remove(path.join(rootDir, 'dist', SERVER_BUNDLE_DIR, 'page.mjs'));
		expect(() => assertProductionDistComplete(rootDir, 'dist')).toThrow(
			/The production server module .*page\.mjs is missing/,
		);
	});

	it('reports a corrupt server-modules map as invalid', () => {
		const rootDir = createCompleteDist();
		writeFileSync(
			path.join(rootDir, 'dist', SERVER_BUNDLE_DIR, SERVER_MODULES_MANIFEST_FILENAME),
			'{ invalid json',
		);
		expect(() => assertProductionDistComplete(rootDir, 'dist')).toThrow(
			/The production server-modules map .* is invalid or unreadable/,
		);
	});
});
