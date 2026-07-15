import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	discoverLayoutRuntimeModuleSpecifiers,
	isProviderRuntimeModulePath,
	isRuntimeProviderLayoutSource,
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

	it('detects eco.layout with generic type parameters', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared', 'query');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: { paths: { '@/*': ['./src/*'] } },
				include: ['**/*.ts', '**/*.tsx'],
			}),
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
				"import type { ReactNode } from 'react';",
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query/query-provider';",
				'export const QueryRootLayout = eco.layout<ReactNode>({',
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

	it('does not follow type-only imports into barrel re-export graphs', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared', 'query');
		const authDir = path.join(projectRoot, 'src', 'domains', 'auth');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		mkdirSync(authDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(authDir, 'index.ts'),
			["export { HeavyForm } from './heavy-form';", "export type { Session } from './session';"].join('\n'),
		);
		writeFileSync(
			path.join(authDir, 'heavy-form.tsx'),
			["import { Button } from '@mui/material';", 'export function HeavyForm() { return <Button />; }'].join(
				'\n',
			),
		);
		writeFileSync(path.join(authDir, 'session.ts'), 'export type Session = { id: string };');

		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import type { Session } from '@/domains/auth';",
				"import { QueryClientProvider } from '@tanstack/react-query';",
				'export function QueryProvider({ children }) { return <QueryClientProvider client={{}}>{children}</QueryClientProvider>; }',
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

	it('does not vendor npm packages from non-provider modules in layout graphs', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const shellDir = path.join(projectRoot, 'src', 'shell');
		const storeDir = path.join(projectRoot, 'src', 'stores');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(shellDir, { recursive: true });
		mkdirSync(storeDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(storeDir, 'chat.store.ts'),
			["import { createStore } from 'zustand';", 'export const chatStore = createStore(() => ({}));'].join('\n'),
		);

		writeFileSync(
			path.join(shellDir, 'app-shell.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { chatStore } from '@/stores/chat.store';",
				'export const AppShell = eco.component({',
				'  render: () => <div>{chatStore.getState()}</div>,',
				'});',
			].join('\n'),
		);

		writeFileSync(
			path.join(layoutsDir, 'app-shell-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { AppShell } from '@/shell/app-shell';",
				'export default eco.layout({',
				'  render: () => <AppShell />,',
				'});',
			].join('\n'),
		);

		expect(
			discoverLayoutRuntimeModuleSpecifiers({
				searchDirs: [layoutsDir],
				projectRoot,
			}),
		).toEqual([]);
	});

	it('excludes workspace and devtools packages from auto-vendoring', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared');
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
				"import { Widget } from '@techn.es/ai-tools-ui';",
				"import { ReactQueryDevtools } from '@tanstack/react-query-devtools';",
				'export function QueryProvider({ children }) {',
				'  return (',
				'    <QueryClientProvider client={{}}>',
				'      <Widget />',
				'      <ReactQueryDevtools />',
				'      {children}',
				'    </QueryClientProvider>',
				'  );',
				'}',
			].join('\n'),
		);

		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query-provider';",
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

	it('does not traverse .server modules when following provider imports', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(sharedDir, 'query-provider.server.ts'),
			["import { createDb } from 'drizzle-orm';", 'export const db = createDb();'].join('\n'),
		);
		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import { QueryClientProvider } from '@tanstack/react-query';",
				"import { db } from './query-provider.server';",
				'export function QueryProvider({ children }) {',
				'  void db;',
				'  return <QueryClientProvider client={{}}>{children}</QueryClientProvider>;',
				'}',
			].join('\n'),
		);
		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query-provider';",
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

	it('vendors only provider runtime packages in stacked layout graphs', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared');
		const shellDir = path.join(projectRoot, 'src', 'shell');
		const storeDir = path.join(projectRoot, 'src', 'stores');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		mkdirSync(shellDir, { recursive: true });
		mkdirSync(storeDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import { QueryClientProvider } from '@tanstack/react-query';",
				'export function QueryProvider({ children }) {',
				'  return <QueryClientProvider client={{}}>{children}</QueryClientProvider>;',
				'}',
			].join('\n'),
		);
		writeFileSync(
			path.join(storeDir, 'chat.store.ts'),
			["import { createStore } from 'zustand';", 'export const chatStore = createStore(() => ({}));'].join('\n'),
		);
		writeFileSync(
			path.join(shellDir, 'app-shell.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { chatStore } from '@/stores/chat.store';",
				'export const AppShell = eco.component({',
				'  render: () => <div>{chatStore.getState()}</div>,',
				'});',
			].join('\n'),
		);
		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query-provider';",
				'export default eco.layout({',
				'  runtimeProvider: true,',
				'  render: ({ children }) => <QueryProvider>{children}</QueryProvider>,',
				'});',
			].join('\n'),
		);
		writeFileSync(
			path.join(layoutsDir, 'app-shell-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { AppShell } from '@/shell/app-shell';",
				'export default eco.layout({',
				'  render: () => <AppShell />',
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

	it('scopes discovery to runtimeProvider layouts when any layout opts in', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-layout-runtime-'));
		const projectRoot = tempDir;
		const layoutsDir = path.join(projectRoot, 'src', 'layouts');
		const sharedDir = path.join(projectRoot, 'src', 'shared');
		const shellDir = path.join(projectRoot, 'src', 'shell');
		mkdirSync(layoutsDir, { recursive: true });
		mkdirSync(sharedDir, { recursive: true });
		mkdirSync(shellDir, { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		writeFileSync(
			path.join(sharedDir, 'query-provider.tsx'),
			[
				"import { QueryClientProvider } from '@tanstack/react-query';",
				'export function QueryProvider({ children }) {',
				'  return <QueryClientProvider client={{}}>{children}</QueryClientProvider>;',
				'}',
			].join('\n'),
		);
		writeFileSync(
			path.join(shellDir, 'theme-provider.tsx'),
			[
				"import { ThemeProvider } from '@mui/material';",
				'export function ShellThemeProvider({ children }) {',
				'  return <ThemeProvider theme={{}}>{children}</ThemeProvider>;',
				'}',
			].join('\n'),
		);
		writeFileSync(
			path.join(layoutsDir, 'query-root-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { QueryProvider } from '@/shared/query-provider';",
				'export default eco.layout({',
				'  runtimeProvider: true,',
				'  render: ({ children }) => <QueryProvider>{children}</QueryProvider>,',
				'});',
			].join('\n'),
		);
		writeFileSync(
			path.join(layoutsDir, 'app-shell-layout.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { ShellThemeProvider } from '@/shell/theme-provider';",
				'export default eco.layout({',
				'  render: ({ children }) => <ShellThemeProvider>{children}</ShellThemeProvider>,',
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

describe('isRuntimeProviderLayoutSource', () => {
	it('detects runtimeProvider layouts', () => {
		expect(
			isRuntimeProviderLayoutSource('export default eco.layout({ runtimeProvider: true, render: () => null });'),
		).toBe(true);
		expect(isRuntimeProviderLayoutSource('export default eco.layout({ render: () => null });')).toBe(false);
	});
});

describe('isProviderRuntimeModulePath', () => {
	it('matches provider modules by file path', () => {
		expect(
			isProviderRuntimeModulePath('/app/src/shared/query-provider.tsx', 'export function QueryProvider() {}'),
		).toBe(true);
		expect(isProviderRuntimeModulePath('/app/src/auth/auth-context.ts', 'export const AuthContext = {}')).toBe(
			true,
		);
	});

	it('matches provider modules by source patterns when the path is neutral', () => {
		expect(
			isProviderRuntimeModulePath(
				'/app/src/shared/session.tsx',
				'export const SessionContext = createContext(null);',
			),
		).toBe(true);
		expect(
			isProviderRuntimeModulePath(
				'/app/src/shared/theme.tsx',
				'export function ThemeProvider({ children }) { return children; }',
			),
		).toBe(true);
	});

	it('rejects non-provider modules', () => {
		expect(isProviderRuntimeModulePath('/app/src/shell/app-shell.tsx', 'export const AppShell = () => null;')).toBe(
			false,
		);
	});
});

describe('normalizeRuntimePackageSpecifier', () => {
	it('normalizes scoped package subpaths to package roots', () => {
		expect(normalizeRuntimePackageSpecifier('@tanstack/react-query')).toBe('@tanstack/react-query');
		expect(normalizeRuntimePackageSpecifier('@mui/material/Button')).toBe('@mui/material');
		expect(normalizeRuntimePackageSpecifier('lodash/debounce')).toBe('lodash');
	});
});
