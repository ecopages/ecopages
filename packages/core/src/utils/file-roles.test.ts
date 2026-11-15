import { expect, test } from 'vitest';
import { findMisplacedRole, matchRoleSuffix, isPrivatePath, isServerOnlyModuleSpecifier } from './file-roles.ts';

test.each([
	'./db.server.ts',
	'./db.server',
	'/app/auth.server.js',
	'pkg/db.server.mjs',
	'./db.server?raw',
	'./db.server#module',
	'./db.server.ts?raw#x',
	'./db.server.cjs',
	'./db.server.tsx?v=1',
	'./x.server/db.server.ts',
	'/a/b/c/db.server.jsx',
])('classifies %s as server-only', (specifier) => {
	expect(isServerOnlyModuleSpecifier(specifier)).toBe(true);
});

test.each([
	'./server.ts',
	'./db.serverless.ts',
	'./server/db.ts',
	'./db.client.ts',
	'./db.client?file=auth.server.ts',
	'./card.server.kita.tsx',
	'server.ts',
	'.server',
	'./.server.ts',
	'./x.server/db.ts',
	'./x.server/',
	'./db.client?x=y/db.server',
])('allows browser module %s', (specifier) => {
	expect(isServerOnlyModuleSpecifier(specifier)).toBe(false);
});

test.each([
	['users.api.ts', 'api'],
	['card.server.tsx', 'server'],
	['counter.script.js', 'script'],
	['widget.script.jsx', 'script'],
	['about.tsx', undefined],
	['server.tsx', undefined],
	['card.server.kita.tsx', undefined],
])('reads the role of %s as %s', (file, role) => {
	expect(matchRoleSuffix(file)?.role).toBe(role);
});

test.each([
	['card.server.kita.tsx', 'server'],
	['nav.script.lit.tsx', 'script'],
	['users.api.html', 'api'],
	['db.server.test.ts', 'server'],
	['blog/card.server.kita.tsx', 'server'],
])('finds the misplaced role segment in %s', (file, role) => {
	expect(findMisplacedRole(file)).toBe(role);
});

test.each([
	'db.server.ts',
	'counter.script.tsx',
	'users.api.js',
	'server.tsx',
	'api.ts',
	'v1.2.html',
	'a.kita.tsx',
	'dir.server/page.tsx',
])('finds no misplaced role segment in %s', (file) => {
	expect(findMisplacedRole(file)).toBeUndefined();
});

test.each([
	['_card.tsx', true],
	['_parts/card.tsx', true],
	['blog/_card.tsx', true],
	['blog/card_1.tsx', false],
	['blog/post.tsx', false],
])('reads %s as private: %s', (file, expected) => {
	expect(isPrivatePath(file)).toBe(expected);
});

test('finds the role suffix an extension ends with', () => {
	expect(matchRoleSuffix('.server.tsx')?.suffix).toBe('.server.tsx');
	expect(matchRoleSuffix('.kita.tsx')).toBeUndefined();
});
