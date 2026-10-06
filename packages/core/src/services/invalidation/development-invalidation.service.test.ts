import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import { Processor } from '../../plugins/processor.js';
import { DevelopmentInvalidationService } from './development-invalidation.service.ts';
import {
	CounterServerInvalidationState,
	setAppServerInvalidationState,
} from '../runtime-state/server-invalidation-state.service.ts';
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
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
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
			invalidateServerModules: true,
		});
	});

	it('does not treat siblings that share a directory prefix as inside it', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.planFileChange('/test/project/src/public/logo.svg')).toMatchObject({ category: 'public-asset' });
		for (const sibling of ['src/public-api/client.ts', 'src/pages-old/a.ts', 'src/includes-old/a.ts']) {
			expect(service.planFileChange(`/test/project/${sibling}`)).toMatchObject({ category: 'server-source' });
		}
		expect(service.planFileChange('/test/project/src-old/a.ts')).toMatchObject({ category: 'other' });
	});

	it('matches directory and root-relative additionalWatchPaths', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['src/registry'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/src/registry/widget.ts')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/registry')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/pages/index.tsx')).toBe(false);
	});

	it('matches universal additionalWatchPaths globs under the root directory', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['**/*'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/elsewhere/widget.ts')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/elsewhere/widget.ts')).toBe(false);
	});

	it('matches additionalWatchPaths globs with intermediate directories', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['content/**/*.md'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/content/blog/post.md')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/post.md')).toBe(false);
	});

	it('matches a leading ** glob at any depth inside the root directory only', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['**/*.config.ts'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/packages/ui/vite.config.ts')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/not-a.config.ts.bak')).toBe(false);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/config.ts')).toBe(false);
		expect(service.matchesAdditionalWatchPaths('/elsewhere/vite.config.ts')).toBe(false);
	});

	it('anchors additionalWatchPaths globs at the root directory', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['*.css'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/global.css')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/global.css')).toBe(false);
	});

	it('matches additionalWatchPaths globs under a root directory with glob characters', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/home/me/[client]/site' });
		appConfig.additionalWatchPaths = ['content/**/*.md'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/home/me/[client]/site/content/blog/post.md')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/home/me/[client]/site/src/post.md')).toBe(false);
	});

	it('matches additionalWatchPaths globs outside the root directory and with literal brackets', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['../shared/**/*.ts', '/abs/data/*.json', 'src/pages/[[]slug]/*.md'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/shared/lib/format.ts')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/lib/format.ts')).toBe(false);
		expect(service.matchesAdditionalWatchPaths('/abs/data/site.json')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/pages/[slug]/intro.md')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/src/pages/s/intro.md')).toBe(false);
	});

	it('matches dot segments only through pattern segments that start with a dot', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.additionalWatchPaths = ['**/*.md', '.github/**/*.yml'];
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.matchesAdditionalWatchPaths('/test/project/docs/intro.md')).toBe(true);
		expect(service.matchesAdditionalWatchPaths('/test/project/.cache/intro.md')).toBe(false);
		expect(service.matchesAdditionalWatchPaths('/test/project/docs/.draft.md')).toBe(false);
		expect(service.matchesAdditionalWatchPaths('/test/project/.github/workflows/ci.yml')).toBe(true);
	});

	it('delegates server invalidation versioning to the app-owned invalidation state', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		const invalidationState = new CounterServerInvalidationState();
		setAppServerInvalidationState(appConfig, invalidationState);
		const invalidateDevelopmentGraph = vi.fn(() => {});
		appConfig.runtime = {
			...(appConfig.runtime ?? {}),
			appModuleLoader: {
				importModule: async <T = unknown>() => ({}) as T,
				invalidateDevelopmentGraph,
			},
		};
		const service = new DevelopmentInvalidationService(appConfig);

		expect(invalidationState.getServerInvalidationVersion()).toBe(0);

		service.invalidateServerModules(['/test/project/src/components/Button.tsx']);
		expect(invalidationState.getServerInvalidationVersion()).toBe(1);
		expect(invalidateDevelopmentGraph).toHaveBeenCalledTimes(1);
	});

	it('clears persisted route-module entries before a route imports them', async () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'ecopages-development-invalidation-'));
		const cacheDir = path.join(rootDir, '.eco/.server-modules');
		const manifestPath = path.join(cacheDir, ROUTE_MODULE_BUILD_CACHE_FILENAME);

		try {
			const appConfig = await finalizeEcoPagesConfig({ rootDir });
			const service = new DevelopmentInvalidationService(appConfig);
			const staleManifest = JSON.stringify({
				corePackageVersion: 'stale',
				entries: { '/test/project/src/pages/index.tsx': {} },
			});
			mkdirSync(cacheDir, { recursive: true });
			writeFileSync(manifestPath, staleManifest);

			service.invalidateServerModules([path.join(rootDir, 'src/content/docs/intro.mdx')]);
			expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toMatchObject({ entries: {} });
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('does not treat watch-only processors as asset owners', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		appConfig.processors.set('content', new ContentCollectionProcessor());

		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.planFileChange('/test/project/src/content/docs/getting-started.mdx')).toMatchObject({
			category: 'server-source',
			invalidateServerModules: true,
			delegateToHmr: true,
			processorHandledAsset: false,
		});
	});

	it('classifies eco.config and dotenv files as runtime-restart', async () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'ecopages-runtime-restart-'));
		const configPath = path.join(rootDir, 'eco.config.ts');
		const envPath = path.join(rootDir, '.env');

		try {
			writeFileSync(configPath, 'export default {}');
			writeFileSync(envPath, 'ECOPAGES_PORT=3000\n');
			const appConfig = await finalizeEcoPagesConfig({ rootDir }, { configFilePath: configPath });
			const service = new DevelopmentInvalidationService(appConfig);

			expect(service.planFileChange(configPath)).toMatchObject({ category: 'runtime-restart' });
			expect(service.planFileChange(envPath)).toMatchObject({ category: 'runtime-restart' });
			expect(service.planFileChange(path.join(rootDir, 'src/pages/index.tsx'))).not.toMatchObject({
				category: 'runtime-restart',
			});
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
