import { describe, expect, it } from 'vitest';
import { LocalsAccessError } from '../../../errors/locals-access-error.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';

describe('buildPreparedRenderOptions static locals guard', () => {
	it('keeps the throwing proxy for ordinary static pages', () => {
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

		expect(() => Reflect.get(result.pageLocals as object, 'sessionUser')).toThrow(LocalsAccessError);
	});
});
