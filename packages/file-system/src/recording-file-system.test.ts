import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from './path.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeFs } from './adapters/node.ts';
import { fileSystem, installFileSystem } from './install.ts';
import { createRecordingFileSystem } from './recording-file-system.ts';

describe('recording file system', () => {
	const restoreFns: Array<() => void> = [];
	const tempDirs: string[] = [];

	afterEach(() => {
		while (restoreFns.length > 0) restoreFns.pop()?.();
		for (const tempDir of tempDirs.splice(0)) nodeFs.remove(tempDir);
	});

	it('records path arguments forwarded to the inner file system', () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-fs-record-')));
		tempDirs.push(rootDir);
		const filePath = path.join(rootDir, 'note.txt');
		writeFileSync(filePath, 'hello', 'utf8');

		const recording = createRecordingFileSystem(nodeFs);
		restoreFns.push(installFileSystem(recording));

		expect(fileSystem.exists(filePath)).toBe(true);
		expect(fileSystem.readFileSync(filePath)).toBe('hello');

		expect(recording.recordedPaths).toEqual([filePath, filePath]);
	});

	it('records and forwards linkNew and linkNewAsync', async () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-fs-record-link-')));
		tempDirs.push(rootDir);
		const source = path.join(rootDir, 'seed.tmp');
		const first = path.join(rootDir, 'first.db');
		const second = path.join(rootDir, 'second.db');
		writeFileSync(source, 'seeded', 'utf8');

		const recording = createRecordingFileSystem(nodeFs);
		restoreFns.push(installFileSystem(recording));

		expect(fileSystem.linkNew(source, first)).toBe(true);
		expect(fileSystem.linkNew(source, first)).toBe(false);
		expect(await fileSystem.linkNewAsync(source, second)).toBe(true);
		expect(await fileSystem.linkNewAsync(source, second)).toBe(false);

		expect(nodeFs.readFileSync(first)).toBe('seeded');
		expect(nodeFs.readFileSync(second)).toBe('seeded');
		expect(recording.recordedPaths).toEqual([source, first, source, first, source, second, source, second]);
	});

	it('restores the previous file system after install', () => {
		const recording = createRecordingFileSystem(nodeFs);
		const restore = installFileSystem(recording);
		restore();

		const rootDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-fs-restore-')));
		tempDirs.push(rootDir);
		const filePath = path.join(rootDir, 'note.txt');
		writeFileSync(filePath, 'hello', 'utf8');

		fileSystem.readFileSync(filePath);
		expect(recording.recordedPaths).toEqual([]);
	});
});
