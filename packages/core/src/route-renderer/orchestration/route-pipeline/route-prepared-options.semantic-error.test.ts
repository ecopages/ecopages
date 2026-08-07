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

describe('buildPreparedRenderOptions semantic error templates', () => {
	it('uses safe empty locals when the matcher passes locals: {}', () => {
		const Page = (() => '<main>Not found</main>') as unknown as EcoPageComponent<unknown>;
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
		} as EcoPagesAppConfig;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/404.tsx',
				params: {},
				query: {},
				locals: {},
			} as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate,
				Layouts: [],
				props: {},
				metadata: { title: 'Not found', description: 'Not found' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig,
		});

		expect(result.locals).toEqual({});
		expect(result.pageLocals).toEqual({});
		expect(() => Reflect.get(result.pageLocals as object, 'sessionUser')).not.toThrow(LocalsAccessError);
	});
});
