import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { isDeclaredAppPackageImport, isWorkspacePackageImport } from './app-package-declarations.ts';

test('isWorkspacePackageImport detects workspace protocol dependencies', () => {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-workspace-'));
	writeFileSync(
		path.join(rootDir, 'package.json'),
		JSON.stringify({
			dependencies: {
				'@ecopages/core': 'workspace:*',
			},
		}),
		'utf-8',
	);

	assert.equal(isWorkspacePackageImport('@ecopages/core', rootDir), true);
	assert.equal(isWorkspacePackageImport('react', rootDir), false);
});

test('isDeclaredAppPackageImport detects app-declared dependencies', () => {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-declared-'));
	writeFileSync(
		path.join(rootDir, 'package.json'),
		JSON.stringify({
			dependencies: {
				react: '^18.0.0',
			},
		}),
		'utf-8',
	);

	assert.equal(isDeclaredAppPackageImport('react', rootDir), true);
	assert.equal(isDeclaredAppPackageImport('left-pad', rootDir), false);
});
