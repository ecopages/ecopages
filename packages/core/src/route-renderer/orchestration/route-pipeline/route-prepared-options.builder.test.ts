import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	RouteRendererOptions,
} from '../../../types/contracts.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';

describe('buildPreparedRenderOptions static pages', () => {
	it('gives a static page no locals and keeps them out of its page props', () => {
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<unknown>;
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
		} as EcoPagesAppConfig;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate,
				Layouts: [],
				props: {},
				metadata: { title: 'Page', description: 'Page' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig,
		});

		expect(result.locals).toBeUndefined();
		expect(result.pageProps).toEqual({ params: {}, query: {} });
		expect(result).not.toHaveProperty('pageLocals');
	});
});
