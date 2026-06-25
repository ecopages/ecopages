import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { Processor } from '../plugins/processor.ts';
import { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../services/module-loading/route-module-build-manifest.ts';
import {
	clearProductionBuildCaches,
	createRouteModuleStaticRenderCacheContext,
	shouldResetStaticExportDirectory,
} from './static-build-invalidation.ts';

describe('static-build-invalidation', () => {
	describe('createRouteModuleStaticRenderCacheContext', () => {
		it('combines config hash and build-input fingerprint', () => {
			const context = createRouteModuleStaticRenderCacheContext({
				absolutePaths: {},
				processors: new Map(),
				integrations: [],
			} as any);

			assert.equal(context.configHash, 'missing');
			assert.equal(context.buildInputsFingerprint, 'stable');
		});
	});

	describe('shouldResetStaticExportDirectory', () => {
		it('always resets when force is true', () => {
			assert.equal(shouldResetStaticExportDirectory({} as any, true), true);
		});

		it('resets when a build-input contributor reports changes', () => {
			const processor = new (class extends Processor {
				override readonly buildPlugins = undefined;
				override readonly plugins = undefined;
				override didChange(): boolean {
					return true;
				}

				override async setup(): Promise<void> {}
				override async teardown(): Promise<void> {}
				override async process(): Promise<unknown> {
					return null;
				}
			})({ name: 'changed-processor' });

			assert.equal(
				shouldResetStaticExportDirectory(
					{
						processors: new Map([['changed-processor', processor]]),
						integrations: [],
						absolutePaths: { workDir: '/tmp/.eco' },
					} as any,
					false,
				),
				true,
			);
		});
	});

	describe('clearProductionBuildCaches', () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), 'ecopages-static-invalidation-'));
			delete process.env.NODE_ENV;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
			delete process.env.NODE_ENV;
		});

		it('is a no-op outside production', () => {
			process.env.NODE_ENV = 'development';
			const ecoDir = join(tempDir, '.eco');
			const manifestPath = join(ecoDir, '.server-modules', ROUTE_MODULE_BUILD_CACHE_FILENAME);
			mkdirSync(join(ecoDir, '.server-modules'), { recursive: true });
			writeFileSync(manifestPath, '{}', 'utf8');

			clearProductionBuildCaches({
				rootDir: tempDir,
				workDir: '.eco',
				absolutePaths: { workDir: ecoDir },
			} as any);

			assert.equal(existsSync(manifestPath), true);
		});

		it('clears persisted production cache manifests', () => {
			process.env.NODE_ENV = 'production';
			const ecoDir = join(tempDir, '.eco');
			const modulesManifest = join(ecoDir, '.server-modules', ROUTE_MODULE_BUILD_CACHE_FILENAME);
			const graphManifest = join(ecoDir, '.server-pages-graph', ROUTE_MODULE_BUILD_CACHE_FILENAME);
			mkdirSync(join(ecoDir, '.server-modules'), { recursive: true });
			mkdirSync(join(ecoDir, '.server-pages-graph'), { recursive: true });
			writeFileSync(modulesManifest, '{}', 'utf8');
			writeFileSync(graphManifest, '{}', 'utf8');

			clearProductionBuildCaches({
				rootDir: tempDir,
				workDir: '.eco',
				absolutePaths: { workDir: ecoDir },
			} as any);

			assert.equal(existsSync(modulesManifest), false);
			assert.equal(existsSync(graphManifest), false);
		});
	});
});
