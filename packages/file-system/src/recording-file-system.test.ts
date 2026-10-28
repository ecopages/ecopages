import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-fs-record-'));
		tempDirs.push(rootDir);
		const filePath = path.join(rootDir, 'note.txt');
		writeFileSync(filePath, 'hello', 'utf8');

		const recording = createRecordingFileSystem(nodeFs);
		restoreFns.push(installFileSystem(recording));

		expect(fileSystem.exists(filePath)).toBe(true);
		expect(fileSystem.readFileSync(filePath)).toBe('hello');

		expect(recording.recordedPaths).toEqual([filePath, filePath]);
	});

	it('restores the previous file system after install', () => {
		const recording = createRecordingFileSystem(nodeFs);
		const restore = installFileSystem(recording);
		restore();

		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-fs-restore-'));
		tempDirs.push(rootDir);
		const filePath = path.join(rootDir, 'note.txt');
		writeFileSync(filePath, 'hello', 'utf8');

		fileSystem.readFileSync(filePath);
		expect(recording.recordedPaths).toEqual([]);
	});
});
