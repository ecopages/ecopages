import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.js';
import { Processor } from '../../plugins/processor.js';
import { DevelopmentInvalidationService } from './development-invalidation.service.ts';
import { InMemoryDevGraphService, setAppDevGraphService } from '../runtime-state/dev-graph.service.ts';
import { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../module-loading/route-module-build-manifest.ts';

class StylesheetProcessor extends Processor {
	buildPlugins = [];
	plugins = [];

	constructor() {
		super({
			name: 'css',
			watch: {
				paths: ['/test/project/src'],
				extensions: ['.css'],
			},
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
		});
	}

	override async setup(): Promise<void> {}

	override async teardown(): Promise<void> {}

	override async process<T>(input: T): Promise<T> {
		return input;
	}
}

class ContentCollectionProcessor extends Processor {
	buildPlugins = [];
	plugins = [];

	constructor() {
		super({
			name: 'ecopages-content-processor',
			watch: {
				paths: ['/test/project/src/content/docs'],
				extensions: ['mdx'],
			},
		});
	}

	override async setup(): Promise<void> {}

	override async teardown(): Promise<void> {}

	override async process<T>(input: T): Promise<T> {
		return input;
	}
}

describe('DevelopmentInvalidationService', () => {
	it('classifies route, include, processor-owned, and additional-watch changes explicitly', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		appConfig.additionalWatchPaths = ['**/*.config.ts'];
		appConfig.processors.set('css', new StylesheetProcessor());

		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.planFileChange('/test/project/src/pages/index.tsx')).toMatchObject({
			category: 'route-source',
			invalidateServerModules: true,
			refreshRoutes: true,
			delegateToHmr: true,
		});
		expect(service.planFileChange('/test/project/src/includes/seo.kita.tsx')).toMatchObject({
			category: 'include-source',
			invalidateServerModules: true,
			reloadBrowser: false,
			delegateToHmr: true,
		});
		expect(service.planFileChange('/test/project/src/views/explicit-team-view.kita.tsx')).toMatchObject({
			category: 'explicit-server-view',
			invalidateServerModules: true,
			reloadBrowser: false,
			delegateToHmr: true,
		});
		expect(service.planFileChange('/test/project/src/styles/main.css')).toMatchObject({
			category: 'processor-owned-asset',
			invalidateServerModules: false,
			processorHandledAsset: true,
		});
		expect(service.planFileChange('/test/project/tailwind.config.ts')).toMatchObject({
			category: 'additional-watch',
			reloadBrowser: true,
			invalidateServerModules: false,
		});
	});

	it('delegates server invalidation versioning to the app-owned dev graph service', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		const devGraphService = new InMemoryDevGraphService();
		setAppDevGraphService(appConfig, devGraphService);
		const invalidateDevelopmentGraph = vi.fn(() => {});
		appConfig.runtime = {
			...(appConfig.runtime ?? {}),
			appModuleLoader: {
				owner: 'app',
				importModule: async <T = unknown>() => ({}) as T,
				invalidateDevelopmentGraph,
			},
		};
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.getServerModuleInvalidationVersion()).toBe(0);

		service.invalidateServerModules(['/test/project/src/components/Button.tsx']);
		expect(service.getServerModuleInvalidationVersion()).toBe(1);
		expect(invalidateDevelopmentGraph).toHaveBeenCalledTimes(1);

		service.resetRuntimeState(['/test/project/src/pages/index.tsx']);
		expect(service.getServerModuleInvalidationVersion()).toBe(3);
		expect(invalidateDevelopmentGraph).toHaveBeenCalledTimes(2);
	});

	it('clears persisted route-module entries before a route imports them', async () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'ecopages-development-invalidation-'));
		const cacheDir = path.join(rootDir, '.eco/.server-modules');
		const manifestPath = path.join(cacheDir, ROUTE_MODULE_BUILD_CACHE_FILENAME);

		try {
			const appConfig = await new ConfigBuilder().setRootDir(rootDir).build();
			const service = new DevelopmentInvalidationService(appConfig);
			const staleManifest = JSON.stringify({
				corePackageVersion: 'stale',
				entries: { '/test/project/src/pages/index.tsx': {} },
			});
			mkdirSync(cacheDir, { recursive: true });
			writeFileSync(manifestPath, staleManifest);

			service.invalidateServerModules([path.join(rootDir, 'src/content/docs/intro.mdx')]);
			expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toMatchObject({ entries: {} });

			writeFileSync(manifestPath, staleManifest);
			service.resetRuntimeState([path.join(rootDir, 'src/content/docs/intro.mdx')]);
			expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toMatchObject({ entries: {} });
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('does not treat watch-only processors as asset owners', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		appConfig.processors.set('content', new ContentCollectionProcessor());

		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.planFileChange('/test/project/src/content/docs/getting-started.mdx')).toMatchObject({
			category: 'server-source',
			invalidateServerModules: true,
			delegateToHmr: true,
			processorHandledAsset: false,
		});
	});

	it('notifies registered script entrypoint change handlers', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		const handler = vi.fn(async () => {});
		const service = new DevelopmentInvalidationService(appConfig);

		service.registerRegisteredScriptEntrypointChangeHandler(handler);
		await service.notifyRegisteredScriptEntrypointChange('/test/project/src/components/widget.tsx');

		expect(handler).toHaveBeenCalledWith('/test/project/src/components/widget.tsx');
	});
});
