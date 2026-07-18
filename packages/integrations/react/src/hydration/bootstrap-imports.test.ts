import { describe, expect, it } from 'vitest';
import { resolveHydrationBootstrapImports } from './bootstrap-imports.ts';

const vendorImports = {
	react: '/assets/vendors/react.js',
	reactDomClient: '/assets/vendors/react-dom.js',
	reactJsxRuntime: '/assets/vendors/react.js',
	reactJsxDevRuntime: '/assets/vendors/react.js',
	reactDom: '/assets/vendors/react-dom.js',
	useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
	pageLayoutNormalization: '/assets/vendors/page-layout-normalization.js',
	layoutCompose: '/assets/vendors/layout-compose.js',
	router: '/assets/vendors/react-router-esm.js',
};

describe('resolveHydrationBootstrapImports', () => {
	it('returns vendor URLs when browser runtime imports are enabled', () => {
		expect(
			resolveHydrationBootstrapImports({
				useBrowserRuntimeImports: true,
				runtimeImports: vendorImports,
				routerAdapterImportPath: '@ecopages/react-router/browser',
			}),
		).toEqual({
			reactImportPath: '/assets/vendors/react.js',
			reactDomClientImportPath: '/assets/vendors/react-dom.js',
			routerImportPath: '/assets/vendors/react-router-esm.js',
			layoutComposeImportPath: '/assets/vendors/layout-compose.js',
			pageLayoutNormalizationImportPath: '/assets/vendors/page-layout-normalization.js',
		});
	});

	it('returns bare package names when browser runtime imports are disabled', () => {
		expect(
			resolveHydrationBootstrapImports({
				useBrowserRuntimeImports: false,
				runtimeImports: vendorImports,
				routerAdapterImportPath: '@ecopages/react-router/browser',
			}),
		).toEqual({
			reactImportPath: 'react',
			reactDomClientImportPath: 'react-dom/client',
			routerImportPath: '@ecopages/react-router/browser',
			layoutComposeImportPath: '@ecopages/react/layout-compose',
			pageLayoutNormalizationImportPath: '@ecopages/core/eco/page-layout-normalization',
		});
	});
});
