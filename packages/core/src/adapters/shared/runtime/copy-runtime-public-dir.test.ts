import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { copyRuntimePublicDirIfChanged } from './copy-runtime-public-dir.ts';

describe('copyRuntimePublicDirIfChanged', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	it('copies new files and skips byte-identical destinations', () => {
		const sourceDir = mkdtempSync(path.join(tmpdir(), 'eco-public-src-'));
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-dest-'));
		tempDirs.push(sourceDir, destinationDir);

		writeFileSync(path.join(sourceDir, 'logo.txt'), 'same', 'utf8');
		writeFileSync(path.join(sourceDir, 'fresh.txt'), 'new', 'utf8');
		writeFileSync(path.join(destinationDir, 'logo.txt'), 'same', 'utf8');
		writeFileSync(path.join(destinationDir, 'stale.txt'), 'old', 'utf8');

		copyRuntimePublicDirIfChanged(sourceDir, destinationDir);

		expect(fileSystem.readFileSync(path.join(destinationDir, 'fresh.txt'))).toBe('new');
		expect(fileSystem.readFileSync(path.join(destinationDir, 'logo.txt'))).toBe('same');
		expect(fileSystem.exists(path.join(destinationDir, 'stale.txt'))).toBe(true);
	});
});
