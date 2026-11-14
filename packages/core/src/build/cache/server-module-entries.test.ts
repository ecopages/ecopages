import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, it } from 'vitest';
import { Processor } from '../../plugins/processor.ts';
import { collectServerModuleEntries } from './server-module-entries.ts';
import { createImportedViewPlugin } from '../server/imported-view-plugin.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';

class ExtraEntryProcessor extends Processor {
	constructor(private readonly extraEntries: string[]) {
		super({ name: 'extra-entry-processor' });
	}

	override async setup(): Promise<void> {}

	override listProductionServerModuleEntries(): string[] {
		return this.extraEntries;
	}
}

describe('collectServerModuleEntries', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('includes Processor production server module entries that exist on disk', async () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(os.tmpdir(), 'server-module-entries-')));
		roots.push(rootDir);
		const existing = path.join(rootDir, 'posts.ts');
		const missing = path.join(rootDir, 'missing.ts');
		writeFileSync(existing, 'export const entries = [];\n');
		mkdirSync(path.join(rootDir, 'src'), { recursive: true });

		const entries = collectServerModuleEntries({
			appConfig: {
				rootDir,
				templatesExt: ['.tsx'],
				absolutePaths: {},
				processors: new Map([['extra', new ExtraEntryProcessor([existing, missing])]]),
			} as unknown as EcoPagesAppConfig,
			router: { templateRoutes: [] },
		});

		assert.deepEqual(entries, [path.resolve(existing)]);
	});

	it('includes views the server-entry plugin recorded', () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(os.tmpdir(), 'server-module-imported-views-')));
		roots.push(rootDir);
		const viewPath = path.join(rootDir, 'latest-view.kita.tsx');
		writeFileSync(viewPath, 'export default {};\n');
		mkdirSync(path.join(rootDir, 'src'), { recursive: true });

		const appConfig = {
			rootDir,
			templatesExt: ['.kita.tsx'],
			integrations: [{ name: 'kitajs', extensions: ['.kita.tsx'] }],
			absolutePaths: {},
			processors: new Map(),
		} as unknown as EcoPagesAppConfig;

		const plugin = createImportedViewPlugin(appConfig);
		let onLoad: ((args: { path: string }) => unknown) | undefined;
		plugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoad = callback as typeof onLoad;
			},
		} as never);
		onLoad?.({ path: viewPath });

		const entries = collectServerModuleEntries({
			appConfig,
			router: { templateRoutes: [] },
		});

		assert.deepEqual(entries, [path.resolve(viewPath)]);
	});

	it('includes the layouts a Page passes as eco.page({ layout }), wherever they live, and no other file', () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(os.tmpdir(), 'server-module-layout-refs-')));
		roots.push(rootDir);
		const write = (file: string, source: string) => {
			const target = path.join(rootDir, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, source);
			return target;
		};
		const page = write(
			'src/pages/index.tsx',
			[
				"import { eco } from '@ecopages/core';",
				"import { AppShell } from '../shells/app-shell';",
				"import { Inner } from '../shells/inner';",
				"import { Outer } from '../shells/outer.tsx';",
				'export default eco.page({ layout: [Outer, { component: Inner, props: () => ({}) }], render: () => null });',
				'void AppShell;',
			].join('\n'),
		);
		const outer = write('src/shells/outer.tsx', 'export const Outer = () => null;\n');
		const inner = write('src/shells/inner.tsx', 'export const Inner = () => null;\n');
		write('src/shells/app-shell.tsx', 'export const AppShell = () => null;\n');
		write('src/layouts/utils.tsx', 'export const util = 1;\n');

		const entries = collectServerModuleEntries({
			appConfig: { rootDir, absolutePaths: {}, processors: new Map() } as unknown as EcoPagesAppConfig,
			router: { templateRoutes: [{ filePath: page }] },
		});

		assert.deepEqual(entries.sort(), [page, outer, inner].map((file) => path.resolve(file)).sort());
	});
});
