import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { copyDeclaredServerFiles } from './copy-server-files.ts';
import { SERVER_BUNDLE_DIR } from '../utils/resolve-entry-file.ts';

describe('copyDeclaredServerFiles', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	function createApp(serverFiles?: string[]) {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-files-'));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		fileSystem.ensureDir(path.join(distDir, SERVER_BUNDLE_DIR));
		return {
			rootDir,
			distDir: 'dist',
			serverFiles,
			absolutePaths: { distDir },
		} as unknown as EcoPagesAppConfig;
	}

	it('copies declared files into dist/server/ by basename', async () => {
		const appConfig = createApp(['data/*.json']);
		mkdirSync(path.join(appConfig.rootDir, 'data'), { recursive: true });
		writeFileSync(path.join(appConfig.rootDir, 'data/messages.json'), '{"ok":true}\n');

		await copyDeclaredServerFiles(appConfig);

		expect(readFileSync(path.join(appConfig.rootDir, 'dist/server/messages.json'), 'utf8')).toBe('{"ok":true}\n');
	});

	it('rejects a declared file that would overwrite an existing dist/server/ artifact', async () => {
		const appConfig = createApp(['data/*.mjs']);
		mkdirSync(path.join(appConfig.rootDir, 'data'), { recursive: true });
		writeFileSync(path.join(appConfig.rootDir, 'data/app.mjs'), 'export const fromApp = true;\n');
		writeFileSync(path.join(appConfig.rootDir, 'dist/server/app.mjs'), 'export const generated = true;\n');

		await expect(copyDeclaredServerFiles(appConfig)).rejects.toThrow(/would overwrite app\.mjs/);
	});

	it('rejects two declared files that share a basename', async () => {
		const appConfig = createApp(['a/*.txt', 'b/*.txt']);
		mkdirSync(path.join(appConfig.rootDir, 'a'), { recursive: true });
		mkdirSync(path.join(appConfig.rootDir, 'b'), { recursive: true });
		writeFileSync(path.join(appConfig.rootDir, 'a/note.txt'), 'a\n');
		writeFileSync(path.join(appConfig.rootDir, 'b/note.txt'), 'b\n');

		await expect(copyDeclaredServerFiles(appConfig)).rejects.toThrow(/serverFiles copy collision/);
	});
});
