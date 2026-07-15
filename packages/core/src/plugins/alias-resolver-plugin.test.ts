import assert from 'node:assert/strict';
import fs, { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import type { EcoBuildOnResolveResult } from '../build/build-types.ts';
import { createAliasResolverPlugin } from './alias-resolver-plugin.ts';
import {
	loadTsconfigPathPrefixes,
	resolveProjectImportPath,
	isBarePackageImportSpecifier,
} from './tsconfig-import-resolver.ts';

function writeTsconfig(projectRoot: string, paths: Record<string, string[]>): void {
	fs.writeFileSync(
		path.join(projectRoot, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					paths,
				},
			},
			null,
			2,
		),
		'utf8',
	);
}

test('resolveProjectImportPath resolves tsconfig paths via oxc-resolver', () => {
	const projectRoot = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-tsconfig-resolver-'));
	const srcDir = path.join(projectRoot, 'src');
	const layoutDir = path.join(srcDir, 'layouts');
	const sharedDir = path.join(srcDir, 'shared', 'query');
	fs.mkdirSync(sharedDir, { recursive: true });
	fs.writeFileSync(path.join(sharedDir, 'query-provider.tsx'), 'export const QueryProvider = () => null;\n', 'utf8');
	writeTsconfig(projectRoot, {
		'@/*': ['./src/*'],
	});

	try {
		const fromFile = path.join(layoutDir, 'query-root-layout.tsx');
		assert.equal(
			realpathSync(resolveProjectImportPath(projectRoot, fromFile, '@/shared/query/query-provider') ?? ''),
			realpathSync(path.join(sharedDir, 'query-provider.tsx')),
		);
		assert.deepEqual(loadTsconfigPathPrefixes(projectRoot), ['@/']);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test('loadTsconfigPathPrefixes parses tsconfig files with glob patterns in include', () => {
	const projectRoot = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-tsconfig-glob-'));
	fs.writeFileSync(
		path.join(projectRoot, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					paths: {
						'@/*': ['./src/*'],
					},
				},
				include: ['**/*.ts', '**/*.tsx', '../../packages/ui/src/**/*.tsx'],
			},
			null,
			2,
		),
		'utf8',
	);

	try {
		assert.deepEqual(loadTsconfigPathPrefixes(projectRoot), ['@/']);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test('isBarePackageImportSpecifier distinguishes npm packages from tsconfig path aliases', () => {
	const projectRoot = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-bare-import-'));
	writeTsconfig(projectRoot, {
		'@/*': ['./src/*'],
		'~/*': ['./src/*'],
	});

	try {
		assert.equal(isBarePackageImportSpecifier('@tanstack/react-query', projectRoot), true);
		assert.equal(isBarePackageImportSpecifier('@/shared/query-provider', projectRoot), false);
		assert.equal(isBarePackageImportSpecifier('~/shared/query-provider', projectRoot), false);
		assert.equal(isBarePackageImportSpecifier('./relative', projectRoot), false);
		assert.equal(isBarePackageImportSpecifier('node:fs', projectRoot), false);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test('createAliasResolverPlugin resolves tsconfig path aliases to concrete barrel targets', async () => {
	const projectRoot = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-alias-resolver-'));
	const srcDir = path.join(projectRoot, 'src');
	const layoutDir = path.join(srcDir, 'layouts', 'base-layout');
	fs.mkdirSync(layoutDir, { recursive: true });
	fs.writeFileSync(path.join(layoutDir, 'base-layout.kita.tsx'), 'export const BaseLayout = {};\n', 'utf8');
	fs.writeFileSync(path.join(layoutDir, 'index.ts'), "export * from './base-layout.kita';\n", 'utf8');
	writeTsconfig(projectRoot, {
		'@/*': ['./src/*'],
	});

	try {
		const registrations: Array<{
			filter: RegExp;
			callback: (args: {
				path: string;
				importer?: string;
			}) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
		}> = [];
		const plugin = createAliasResolverPlugin(projectRoot);
		const importer = path.join(srcDir, 'pages', 'index.tsx');

		plugin.setup({
			onResolve(options, callback) {
				registrations.push({ filter: options.filter, callback });
			},
			onLoad() {},
			module() {},
		});

		assert.ok(registrations.length > 0);
		const resolved = await registrations[0]?.callback({ path: '@/layouts/base-layout', importer });
		assert.equal(realpathSync(resolved?.path ?? ''), realpathSync(path.join(layoutDir, 'base-layout.kita.tsx')));
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});
