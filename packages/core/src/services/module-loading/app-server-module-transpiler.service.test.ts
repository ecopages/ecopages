import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	createAppServerModuleTranspiler,
	getAppHostModuleLoader,
	getAppModuleLoader,
	setAppHostModuleLoader,
	shouldAppUseHostModuleLoader,
} from './app-server-module-transpiler.service.ts';

describe('app server module transpiler runtime state', () => {
	it('stores and exposes an abstract host module loader on app runtime state', () => {
		const appConfig = {
			runtime: {},
		} as any;
		const hostModuleLoader = async (id: string) => ({ id });

		setAppHostModuleLoader(appConfig, hostModuleLoader);

		assert.equal(getAppHostModuleLoader(appConfig), hostModuleLoader);
	});

	it('exposes host ownership when a host module loader is configured', () => {
		const hostModuleLoader = async (id: string) => ({ id });
		const appConfig = {
			rootDir: '/app',
			runtime: {
				hostModuleLoader,
			},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig);

		assert.equal(moduleLoader.owner, 'host');
	});

	it('creates a server transpiler that uses the app module loader', () => {
		const hostModuleLoader = async (id: string) => ({ id });
		const appConfig = {
			rootDir: '/app',
			runtime: {
				hostModuleLoader,
			},
		} as any;

		const transpiler = createAppServerModuleTranspiler(appConfig);

		assert.ok(transpiler);
		assert.equal(getAppHostModuleLoader(appConfig), hostModuleLoader);
	});

	it('keeps Ecopages integration modules on the framework transpiler path', () => {
		const appConfig = {
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			templatesExt: ['.kita.tsx', '.lit.tsx'],
		} as any;

		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/runtime/helpers.ts'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/index.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/includes/html.kita.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/layouts/base-layout.kita.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/counter.lit.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/components/counter.lit.tsx'), false);
	});

	it('prefers the host module loader for framework-owned modules when a host runtime provides one', () => {
		const appConfig = {
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			runtime: {
				hostModuleLoader: async (id: string) => ({ id }),
			},
			templatesExt: ['.kita.tsx', '.lit.tsx'],
		} as any;

		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/runtime/helpers.ts'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/index.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/includes/html.kita.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/layouts/base-layout.kita.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/counter.lit.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/components/counter.lit.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/docs.md'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/react-content.mdx'), false);
	});
});
