import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { IntegrationRendererRenderOptions } from '../../../types/public-types.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';

const disabledDevToolbarConfig = {
	devToolbar: { enabled: false },
} as EcoPagesAppConfig;

function createContext(
	overrides: Partial<Parameters<typeof buildRouteHtmlFinalization>[0]> = {},
): Parameters<typeof buildRouteHtmlFinalization>[0] {
	return {
		appConfig: disabledDevToolbarConfig,
		watch: false,
		integrationName: 'test',
		renderOptions: {} as IntegrationRendererRenderOptions,
		getDocumentAttributes: () => undefined,
		getHtmlDocumentContributions: () => undefined,
		applyAttributesToHtmlElement: (html) => html,
		...overrides,
	};
}

describe('route-html-finalization.service', () => {
	it('returns an empty plan when no document attributes or contributions exist', () => {
		const plan = buildRouteHtmlFinalization(createContext());

		expect(plan).toEqual({});
	});

	it('stamps document attributes on the captured route HTML', () => {
		const applyAttributesToHtmlElement = vi.fn((html: string, attributes: Record<string, string>) => {
			return html.replace(
				'<html',
				`<html ${Object.entries(attributes)
					.map(([key, value]) => `${key}="${value}"`)
					.join(' ')}`,
			);
		});

		const plan = buildRouteHtmlFinalization(
			createContext({
				getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
				getHtmlDocumentContributions: () => [{ placement: 'head-append', html: '<meta name="test" />' }],
				applyAttributesToHtmlElement,
			}),
		);

		expect(plan.htmlContributions).toEqual([{ placement: 'head-append', html: '<meta name="test" />' }]);
		expect(plan.finalizeHtml?.('<html><body><main>Page</main></body></html>')).toContain(
			'data-eco-document-owner="react-router"',
		);
		expect(applyAttributesToHtmlElement).toHaveBeenCalledWith('<html><body><main>Page</main></body></html>', {
			'data-eco-document-owner': 'react-router',
		});
	});

	it('prepends robots meta when metadata.robots differs from defaults', () => {
		const plan = buildRouteHtmlFinalization(
			createContext({
				renderOptions: {
					metadata: { title: 'Admin', description: '', robots: { index: false, follow: false } },
				} as IntegrationRendererRenderOptions,
				getHtmlDocumentContributions: () => [{ placement: 'head-append', html: '<meta name="test" />' }],
			}),
		);

		expect(plan.htmlContributions).toEqual([
			{ placement: 'head-append', html: '<meta name="robots" content="noindex, nofollow">' },
			{ placement: 'head-append', html: '<meta name="test" />' },
		]);
	});

	it('does not append the dev toolbar manifest when devToolbar.package is unset', () => {
		const plan = buildRouteHtmlFinalization(
			createContext({
				appConfig: {} as EcoPagesAppConfig,
				watch: true,
				renderOptions: {
					file: '/tmp/src/pages/index.tsx',
				} as IntegrationRendererRenderOptions,
			}),
		);

		expect(plan.htmlContributions ?? []).toEqual([]);
	});

	it('appends the dev toolbar manifest when watch mode is enabled', () => {
		const plan = buildRouteHtmlFinalization(
			createContext({
				appConfig: { devToolbar: { enabled: true, package: '@ecopages/dev-toolbar' } } as EcoPagesAppConfig,
				watch: true,
				renderOptions: {
					file: '/tmp/src/pages/index.tsx',
				} as IntegrationRendererRenderOptions,
			}),
		);

		expect(plan.htmlContributions?.[0]?.placement).toBe('body-append');
		expect(plan.htmlContributions?.[0]?.html).toContain('__ECO_DEV_MANIFEST__');
		expect(plan.htmlContributions?.[0]?.html).toContain('"route":"/tmp/src/pages/index.tsx"');
	});
});
