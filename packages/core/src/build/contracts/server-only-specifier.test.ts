import { expect, test } from 'vitest';
import { isServerOnlyModuleSpecifier } from '@ecopages/core/build/contracts/server-only-specifier';

test.each([
	'./db.server.ts',
	'./db.server',
	'/app/auth.server.js',
	'pkg/db.server.mjs',
	'./db.server?raw',
	'./db.server#module',
])('classifies %s as server-only', (specifier) => {
	expect(isServerOnlyModuleSpecifier(specifier)).toBe(true);
});

test.each(['./server.ts', './db.serverless.ts', './server/db.ts', './db.client.ts', './db.client?file=auth.server.ts'])(
	'allows browser module %s',
	(specifier) => {
		expect(isServerOnlyModuleSpecifier(specifier)).toBe(false);
	},
);
