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

	it('does not add a Layout a Page passes as eco.page({ layout }) as an entry', () => {
		const rootDir = path.fromNative(mkdtempSync(path.join(os.tmpdir(), 'server-module-layout-refs-')));
		roots.push(rootDir);
		mkdirSync(path.join(rootDir, 'src/pages'), { recursive: true });
		mkdirSync(path.join(rootDir, 'src/shells'), { recursive: true });
		const page = path.join(rootDir, 'src/pages/index.tsx');
		writeFileSync(
			page,
			"import { Outer } from '../shells/outer.tsx';\nexport default eco.page({ layout: Outer, render: () => null });\n",
		);
		writeFileSync(path.join(rootDir, 'src/shells/outer.tsx'), 'export const Outer = () => null;\n');

		const entries = collectServerModuleEntries({
			appConfig: { rootDir, absolutePaths: {}, processors: new Map() } as unknown as EcoPagesAppConfig,
			router: { templateRoutes: [{ filePath: page }] },
		});

		assert.deepEqual(entries, [path.resolve(page)]);
	});
});
