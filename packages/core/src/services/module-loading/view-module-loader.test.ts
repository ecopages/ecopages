import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'vitest';
import { createViewModuleLoader } from './view-module-loader.ts';

describe('createViewModuleLoader', () => {
	it('resolves integration shorthand paths against templatesExt', async () => {
		const rootDir = fs.mkdtempSync(path.join(import.meta.dirname, '.view-module-loader-'));
		const viewsDir = path.join(rootDir, 'src', 'views');
		fs.mkdirSync(viewsDir, { recursive: true });
		const viewPath = path.join(viewsDir, 'sample.kita.tsx');
		fs.writeFileSync(
			viewPath,
			["import { eco } from '@ecopages/core';", 'export default eco.page({ render: () => "ok" });'].join('\n'),
			'utf8',
		);

		const importModule = async (options: { filePath: string }) => {
			assert.equal(options.filePath, viewPath);
			return { default: () => 'ok' };
		};

		const appConfig = {
			rootDir,
			templatesExt: ['.kita.tsx'],
			runtime: {
				serverModuleTranspiler: { importModule },
			},
		} as unknown as Parameters<typeof createViewModuleLoader>[0];

		const loader = createViewModuleLoader(appConfig, './src/views/sample.kita');
		await loader();

		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	it('resolves URL registrations and preserves missing paths for import errors', async () => {
		const rootDir = fs.mkdtempSync(path.join(import.meta.dirname, '.view-module-loader-'));
		const viewsDir = path.join(rootDir, 'src', 'views');
		fs.mkdirSync(viewsDir, { recursive: true });
		const viewPath = path.join(viewsDir, 'sample.kita.tsx');
		fs.writeFileSync(viewPath, 'export default () => "ok";', 'utf8');

		const importedPaths: string[] = [];
		const importModule = async (options: { filePath: string }) => {
			importedPaths.push(options.filePath);
			if (options.filePath.endsWith('missing.kita')) {
				throw new Error('missing view module');
			}
			return { default: () => 'ok' };
		};
		const appConfig = {
			rootDir,
			templatesExt: ['.kita.tsx'],
			runtime: { serverModuleTranspiler: { importModule } },
		} as unknown as Parameters<typeof createViewModuleLoader>[0];

		try {
			await createViewModuleLoader(appConfig, pathToFileURL(viewPath))();
			await assert.rejects(
				createViewModuleLoader(appConfig, './src/views/missing.kita')(),
				/missing view module/,
			);
			assert.deepEqual(importedPaths, [viewPath, path.join(rootDir, 'src', 'views', 'missing.kita')]);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
