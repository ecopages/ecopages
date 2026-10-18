import { lstatSync, mkdtempSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import {
	copyRuntimePublicDirIfChanged,
	copyRuntimePublicFile,
	copyRuntimePublicFileIfChanged,
} from './copy-runtime-public-dir.ts';

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

	it('preserves symlinked public assets', () => {
		const sourceDir = mkdtempSync(path.join(tmpdir(), 'eco-public-link-src-'));
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-link-dest-'));
		tempDirs.push(sourceDir, destinationDir);

		const targetPath = path.join(sourceDir, 'asset.txt');
		const sourceLinkPath = path.join(sourceDir, 'linked.txt');
		writeFileSync(targetPath, 'asset', 'utf8');
		symlinkSync(targetPath, sourceLinkPath);

		copyRuntimePublicDirIfChanged(sourceDir, destinationDir);

		const destinationLinkPath = path.join(destinationDir, 'linked.txt');
		expect(lstatSync(destinationLinkPath).isSymbolicLink()).toBe(true);
		expect(readlinkSync(destinationLinkPath)).toBe(targetPath);
	});
});

describe('copyRuntimePublicFileIfChanged', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	it('copies a changed file and creates its destination directory', () => {
		const sourceDir = mkdtempSync(path.join(tmpdir(), 'eco-public-file-src-'));
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-file-dest-'));
		tempDirs.push(sourceDir, destinationDir);

		const sourcePath = path.join(sourceDir, 'logo.txt');
		const destinationPath = path.join(destinationDir, 'nested', 'logo.txt');
		writeFileSync(sourcePath, 'logo', 'utf8');

		copyRuntimePublicFileIfChanged(sourcePath, destinationPath);

		expect(fileSystem.readFileSync(destinationPath)).toBe('logo');
	});

	it('replaces a destination symlink even when its target has matching bytes', () => {
		const sourceDir = mkdtempSync(path.join(tmpdir(), 'eco-public-file-link-src-'));
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-file-link-dest-'));
		tempDirs.push(sourceDir, destinationDir);

		const sourcePath = path.join(sourceDir, 'logo.txt');
		const linkedTargetPath = path.join(sourceDir, 'linked-target.txt');
		const destinationPath = path.join(destinationDir, 'logo.txt');
		writeFileSync(sourcePath, 'logo', 'utf8');
		writeFileSync(linkedTargetPath, 'logo', 'utf8');
		symlinkSync(linkedTargetPath, destinationPath);

		copyRuntimePublicFileIfChanged(sourcePath, destinationPath);

		expect(lstatSync(destinationPath).isFile()).toBe(true);
		expect(lstatSync(destinationPath).isSymbolicLink()).toBe(false);
		expect(fileSystem.readFileSync(destinationPath)).toBe('logo');
		expect(fileSystem.readFileSync(linkedTargetPath)).toBe('logo');
	});

	it('does nothing when the source file is missing', () => {
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-file-missing-'));
		tempDirs.push(destinationDir);

		copyRuntimePublicFileIfChanged(path.join(destinationDir, 'missing.txt'), path.join(destinationDir, 'copy.txt'));

		expect(fileSystem.exists(path.join(destinationDir, 'copy.txt'))).toBe(false);
	});

	it('copies files asynchronously for watcher events', async () => {
		const sourceDir = mkdtempSync(path.join(tmpdir(), 'eco-public-async-src-'));
		const destinationDir = mkdtempSync(path.join(tmpdir(), 'eco-public-async-dest-'));
		tempDirs.push(sourceDir, destinationDir);

		const sourcePath = path.join(sourceDir, 'logo.txt');
		const destinationPath = path.join(destinationDir, 'nested', 'logo.txt');
		writeFileSync(sourcePath, 'logo', 'utf8');

		await copyRuntimePublicFile(sourcePath, destinationPath);

		await expect(fileSystem.readFile(destinationPath)).resolves.toBe('logo');
	});
});
