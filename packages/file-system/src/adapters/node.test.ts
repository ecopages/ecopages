import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { NodeFileSystem } from './node.ts';

test('NodeFileSystem.glob uses native Node glob semantics with ignore support', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-glob-'));
	const fileSystem = new NodeFileSystem();

	fs.mkdirSync(path.join(rootDir, 'nested'), { recursive: true });
	fs.writeFileSync(path.join(rootDir, 'entry.ts'), 'export const entry = true;', 'utf8');
	fs.writeFileSync(path.join(rootDir, 'nested', 'child.ts'), 'export const child = true;', 'utf8');
	fs.writeFileSync(path.join(rootDir, 'nested', 'ignored.ts'), 'export const ignored = true;', 'utf8');

	try {
		const matches = await fileSystem.glob(['**/*.ts', 'nested/*.ts'], {
			cwd: rootDir,
			ignore: ['**/ignored.ts'],
		});

		assert.deepEqual(matches.sort(), ['entry.ts', 'nested/child.ts']);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});