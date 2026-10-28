import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createViewReference } from './view-reference.ts';
import { resolveStaticView } from './resolve-static-view.ts';

describe('resolveStaticView', () => {
	const importedPaths: string[] = [];
	const appConfig = {
		appRuntime: {
			moduleLoader: {
				importModule: async (options: { filePath: string }) => {
					importedPaths.push(options.filePath);
					return { default: { name: 'loaded' } };
				},
			},
		},
	} as unknown as EcoPagesAppConfig;

	it('loads an imported view through the app module loader', async () => {
		const filePath = path.join('/app', 'src', 'views', 'post.kita.tsx');
		const loader = resolveStaticView(appConfig, createViewReference(filePath, 'kitajs'));
		assert.equal(loader.filePath, path.resolve(filePath));
		await loader();
		assert.deepEqual(importedPaths, [path.resolve(filePath)]);
	});

	it('keeps a view loader and records identity.file from an eco.page component', async () => {
		const existingLoader = async () => ({ default: eco.page({ render: () => 'ok' }) });
		assert.equal(resolveStaticView(appConfig, existingLoader), existingLoader);

		const filePath = path.join('/app', 'src', 'views', 'inline.kita.tsx');
		const view = eco.page({ render: () => 'ok' });
		view.config = {
			identity: { id: 'inline', file: filePath, integration: 'kitajs' },
		};
		const loader = resolveStaticView(appConfig, view);
		assert.equal(loader.filePath, filePath);
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
