import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createImportedViewPlugin, getImportedViewPaths, IMPORTED_VIEW_PLUGIN_NAME } from './imported-view-plugin.ts';
import { viewReferenceModuleSource } from './view-reference.ts';

describe('imported-view-plugin', () => {
	it('loads Integration-owned files as view references and leaves other files alone', () => {
		const appConfig = {
			integrations: [{ name: 'kitajs', extensions: ['.kita.tsx'] }],
		} as unknown as EcoPagesAppConfig;
		const plugin = createImportedViewPlugin(appConfig);

		assert.equal(plugin.name, IMPORTED_VIEW_PLUGIN_NAME);

		let onLoad: ((args: { path: string }) => { contents: string; loader: string } | undefined) | undefined;
		plugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoad = callback as typeof onLoad;
			},
		} as never);

		const viewPath = path.join('/app', 'src', 'views', 'post.kita.tsx');
		assert.deepEqual(onLoad?.({ path: viewPath }), {
			contents: viewReferenceModuleSource(viewPath, 'kitajs'),
			loader: 'js',
		});
		assert.deepEqual(getImportedViewPaths(appConfig), [path.resolve(viewPath)]);
		assert.equal(onLoad?.({ path: path.join('/app', 'src', 'handlers', 'api.ts') }), undefined);
		assert.equal(onLoad?.({ path: path.join('/app', 'node_modules', 'kitajs', 'button.kita.tsx') }), undefined);
	});

	it('leaves the server entry as a real module when an Integration owns its extension', () => {
		const appConfig = {
			integrations: [{ name: 'string', extensions: ['.ts'] }],
		} as unknown as EcoPagesAppConfig;
		const entryPath = path.join('/app', 'app.ts');
		const plugin = createImportedViewPlugin(appConfig, { entryPath });

		let onLoad: ((args: { path: string }) => { contents: string; loader: string } | undefined) | undefined;
		plugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoad = callback as typeof onLoad;
			},
		} as never);

		assert.equal(onLoad?.({ path: entryPath }), undefined);
		assert.deepEqual(onLoad?.({ path: path.join('/app', 'src', 'views', 'latest.ts') })?.loader, 'js');
	});
});
