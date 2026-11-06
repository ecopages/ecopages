import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'vitest';
import type { EcoBuildOnLoadArgs, EcoBuildOnLoadResult } from '../contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createImportedViewPlugin, getImportedViewPaths, IMPORTED_VIEW_PLUGIN_NAME } from './imported-view-plugin.ts';
import { viewReferenceModuleSource } from './view-reference.ts';

type OnLoad = (args: EcoBuildOnLoadArgs) => EcoBuildOnLoadResult | undefined;

function setupPlugin(appConfig: EcoPagesAppConfig, options: { entryPath?: string } = {}) {
	const plugin = createImportedViewPlugin(appConfig, options);
	const handlers: Array<{ filter: RegExp; callback: OnLoad }> = [];
	plugin.setup({
		onLoad(loadOptions: { filter: RegExp }, callback: unknown) {
			handlers.push({ filter: loadOptions.filter, callback: callback as OnLoad });
		},
	} as never);
	const load = (filePath: string) => {
		for (const handler of handlers) {
			const result = handler.filter.test(filePath) ? handler.callback({ path: filePath }) : undefined;
			if (result) {
				return result;
			}
		}
		return undefined;
	};
	return { plugin, load };
}

describe('imported-view-plugin', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	function createApp(files: Record<string, string>): string {
		const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-plugin-')));
		roots.push(rootDir);
		for (const [relativePath, source] of Object.entries(files)) {
			const filePath = path.join(rootDir, relativePath);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, source, 'utf8');
		}
		return rootDir;
	}

	it('loads Integration-owned files as view references and leaves other files alone', () => {
		const rootDir = createApp({
			'src/views/post.kita.tsx': 'export default eco.page({ render: () => <h1 /> });\n',
			'src/handlers/api.ts': 'export const handler = () => null;\n',
		});
		const appConfig = {
			rootDir,
			integrations: [{ name: 'kitajs', extensions: ['.kita.tsx'] }],
		} as unknown as EcoPagesAppConfig;
		const { plugin, load } = setupPlugin(appConfig);

		assert.equal(plugin.name, IMPORTED_VIEW_PLUGIN_NAME);

		const viewPath = path.join(rootDir, 'src', 'views', 'post.kita.tsx');
		assert.deepEqual(load(viewPath), {
			contents: viewReferenceModuleSource(viewPath, 'kitajs'),
			loader: 'js',
		});
		assert.deepEqual(getImportedViewPaths(appConfig), [path.resolve(viewPath)]);
		assert.equal(load(path.join(rootDir, 'src', 'handlers', 'api.ts')), undefined);
		assert.equal(load(path.join(rootDir, 'node_modules', 'kitajs', 'button.kita.tsx')), undefined);
	});

	it('leaves a file of plain components as a real module', () => {
		const rootDir = createApp({
			'src/lib/search/search-icon.tsx': 'export function SearchIcon() {\n\treturn <svg />;\n}\n',
		});
		const appConfig = {
			rootDir,
			integrations: [{ name: 'ecopages-jsx', extensions: ['.tsx'] }],
		} as unknown as EcoPagesAppConfig;
		const { load } = setupPlugin(appConfig);

		assert.equal(load(path.join(rootDir, 'src', 'lib', 'search', 'search-icon.tsx')), undefined);
		assert.deepEqual(getImportedViewPaths(appConfig), []);
	});

	it('leaves the server entry as a real module when an Integration owns its extension', () => {
		const rootDir = createApp({
			'app.ts': 'export default {};\n',
			'src/views/latest.ts': 'export default {};\n',
		});
		const appConfig = {
			rootDir,
			integrations: [{ name: 'string', extensions: ['.ts'] }],
		} as unknown as EcoPagesAppConfig;
		const entryPath = path.join(rootDir, 'app.ts');
		const { load } = setupPlugin(appConfig, { entryPath });

		assert.equal(load(entryPath), undefined);
		assert.deepEqual(load(path.join(rootDir, 'src', 'views', 'latest.ts'))?.loader, 'js');
	});
});
