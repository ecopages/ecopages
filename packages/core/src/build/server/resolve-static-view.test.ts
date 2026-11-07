import assert from 'node:assert/strict';
import { path } from '@ecopages/file-system/path';
import { describe, it } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createViewReference } from './view-reference.ts';
import { resolveStaticView } from './resolve-static-view.ts';

describe('resolveStaticView', () => {
	const importedPaths: string[] = [];
	const rootDir = path.resolve('/app');
	const appConfig = {
		rootDir,
		appRuntime: {
			moduleLoader: {
				importModule: async (options: { filePath: string }) => {
					importedPaths.push(options.filePath);
					return { default: { name: 'loaded' } };
				},
			},
		},
	} as unknown as EcoPagesAppConfig;

	it('loads an imported view, named relative to the app root, through the app module loader', async () => {
		const filePath = path.join(rootDir, 'src', 'views', 'post.kita.tsx');
		const loader = resolveStaticView(appConfig, createViewReference('src/views/post.kita.tsx', 'kitajs'));
		assert.equal(loader.filePath, filePath);
		await loader();
		assert.deepEqual(importedPaths, [filePath]);
	});

	it('keeps a view loader and records identity.file from an eco.page component', async () => {
		const existingLoader = async () => ({ default: eco.page({ render: () => 'ok' }) });
		assert.equal(resolveStaticView(appConfig, existingLoader), existingLoader);

		const view = eco.page({ render: () => 'ok' });
		view.config = {
			identity: { id: 'inline', file: 'src/views/inline.kita.tsx', integration: 'kitajs' },
		};
		const loader = resolveStaticView(appConfig, view);
		assert.equal(loader.filePath, path.join(rootDir, 'src', 'views', 'inline.kita.tsx'));
		assert.equal((await loader()).default, view);
	});

	it('rejects string and URL view paths', () => {
		assert.throws(
			() => resolveStaticView(appConfig, './src/views/post.kita' as never),
			/String and URL view paths are removed/,
		);
		assert.throws(
			() => resolveStaticView(appConfig, new URL('file:///app/src/views/post.kita') as never),
			/String and URL view paths are removed/,
		);
	});
});
