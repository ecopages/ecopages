import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	discoverLayoutRuntimeModuleSpecifiers,
	normalizeRuntimePackageSpecifier,
} from './discover-layout-runtime-modules.ts';

describe('discoverLayoutRuntimeModuleSpecifiers', () => {
	let tempDir = '';

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
			tempDir = '';
		}
	});

	it('discovers npm packages reachable from eco.layout render trees', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const srcDir = path.join(projectRoot, 'src');
		const layoutsDir = path.join(srcDir, 'layouts');
		const sharedDir = path.join(srcDir, 'shared');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import { QueryClientProvider } from '@tanstack/react-query';",
				'export function QueryProvider({ children }: { children: React.ReactNode }) {',
				'  return <QueryClientProvider client={{} as never}>{children}</QueryClientProvider>;',
				'}',
			].join('\n'),
		);

		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '../shared/query-provider';",
				'export default eco.layout({',
				'  render: ({ children }) => <QueryProvider>{children}</QueryProvider>,',
				'});',
			].join('\n'),
		);

		expect(
			discoverLayoutRuntimeModuleSpecifiers({
				searchDirs: [layoutsDir],
				projectRoot,
			}),
		).toEqual(['@tanstack/react-query']);
	});

	it('follows tsconfig path aliases through oxc-resolver', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const srcDir = path.join(projectRoot, 'src');
		const layoutsDir = path.join(srcDir, 'layouts');
		const sharedDir = path.join(srcDir, 'shared', 'query');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import { QueryClientProvider } from '@tanstack/react-query';",
				'export function QueryProvider({ children }: { children: React.ReactNode }) {',
				'  return <QueryClientProvider client={{} as never}>{children}</QueryClientProvider>;',
				'}',
			].join('\n'),
		);

		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query/query-provider';",
				'export default eco.layout({',
				'  render: ({ children }) => <QueryProvider>{children}</QueryProvider>,',
				'});',
			].join('\n'),
		);

		expect(
			discoverLayoutRuntimeModuleSpecifiers({
				searchDirs: [layoutsDir],
				projectRoot,
			}),
		).toEqual(['@tanstack/react-query']);
	});

	it('ignores non-layout files and already-vendored react packages', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const layoutsDir = path.join(tempDir, 'layouts');
		mkdirSync(layoutsDir, { recursive: true });

		writeFileSync(
			path.join(layoutsDir, 'helper.tsx'),
			["import { useState } from 'react';", 'export const count = () => useState(0);'].join('\n'),
		);

		writeFileSync(
			path.join(layoutsDir, 'root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { useState } from 'react';",
				'export default eco.layout({',
				'  render: ({ children }) => { const [_state] = useState(0); return children; },',
				'});',
			].join('\n'),
		);

		expect(
			discoverLayoutRuntimeModuleSpecifiers({
				searchDirs: [layoutsDir],
				routerImportPath: '@ecopages/react-router/browser',
			}),
		).toEqual([]);
	});
});

describe('normalizeRuntimePackageSpecifier', () => {
	it('normalizes scoped package subpaths to package roots', () => {
		expect(normalizeRuntimePackageSpecifier('@tanstack/react-query')).toBe('@tanstack/react-query');
		expect(normalizeRuntimePackageSpecifier('@mui/material/Button')).toBe('@mui/material');
		expect(normalizeRuntimePackageSpecifier('lodash/debounce')).toBe('lodash');
	});
});
