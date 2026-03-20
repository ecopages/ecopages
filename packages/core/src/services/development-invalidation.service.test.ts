import { describe, expect, it } from 'vitest';
import { ConfigBuilder } from '../config/config-builder.ts';
import { Processor } from '../plugins/processor.ts';
import { DevelopmentInvalidationService } from './development-invalidation.service.ts';
import { InMemoryDevGraphService, setAppDevGraphService } from './dev-graph.service.ts';

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

	async setup(): Promise<void> {}

	async teardown(): Promise<void> {}

	async process<T>(input: T): Promise<T> {
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
			reloadBrowser: true,
			delegateToHmr: false,
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
		const service = new DevelopmentInvalidationService(appConfig);

		expect(service.getServerModuleInvalidationVersion()).toBe(0);

		service.invalidateServerModules(['/test/project/src/components/Button.tsx']);
		expect(service.getServerModuleInvalidationVersion()).toBe(1);

		service.resetRuntimeState(['/test/project/src/pages/index.tsx']);
		expect(service.getServerModuleInvalidationVersion()).toBe(3);
	});
});