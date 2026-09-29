import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import cliJson from '../packages/ecopages/package.json' with { type: 'json' };
import rootJson from '../package.json' with { type: 'json' };
import { syncRootVersionFromCli, withPackageVersion } from './sync-root-version.ts';

test('withPackageVersion replaces only the version field and keeps tabs', () => {
	const source = '{\n\t"name": "@ecopages/ecopages",\n\t"version": "0.2.0-rc.4",\n\t"private": true\n}\n';
	assert.equal(
		withPackageVersion(source, '0.2.0'),
		'{\n\t"name": "@ecopages/ecopages",\n\t"version": "0.2.0",\n\t"private": true\n}\n',
	);
});

test('syncRootVersionFromCli copies the CLI version onto the root manifest', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'sync-root-version-'));
	const rootPath = path.join(dir, 'package.json');
	const cliPath = path.join(dir, 'cli.json');
	writeFileSync(rootPath, '{\n\t"name": "root",\n\t"version": "0.2.0-rc.4"\n}\n');
	writeFileSync(cliPath, '{"name":"ecopages","version":"0.2.0"}\n');

	const first = syncRootVersionFromCli(rootPath, cliPath);
	assert.deepEqual(first, { version: '0.2.0', changed: true });
	assert.equal(readFileSync(rootPath, 'utf8'), '{\n\t"name": "root",\n\t"version": "0.2.0"\n}\n');

	const second = syncRootVersionFromCli(rootPath, cliPath);
	assert.deepEqual(second, { version: '0.2.0', changed: false });
});

test('workspace root version matches the published CLI', () => {
	assert.equal(rootJson.version, cliJson.version);
});
