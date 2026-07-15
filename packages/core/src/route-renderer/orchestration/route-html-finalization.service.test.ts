import { describe, expect, it, vi } from 'vitest';
import type { IntegrationRendererRenderOptions } from '../../types/public-types.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';

describe('route-html-finalization.service', () => {
	it('returns an empty plan when no document attributes or contributions exist', () => {
		const plan = buildRouteHtmlFinalization({
			renderOptions: {} as IntegrationRendererRenderOptions,
			getDocumentAttributes: () => undefined,
			getHtmlDocumentContributions: () => undefined,
			applyAttributesToHtmlElement: (html) => html,
		});

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

		const plan = buildRouteHtmlFinalization({
			renderOptions: {} as IntegrationRendererRenderOptions,
			getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
			getHtmlDocumentContributions: () => [{ placement: 'head-append', html: '<meta name="test" />' }],
			applyAttributesToHtmlElement,
		});

		expect(plan.htmlContributions).toEqual([{ placement: 'head-append', html: '<meta name="test" />' }]);
		expect(plan.finalizeHtml?.('<html><body><main>Page</main></body></html>')).toContain(
			'data-eco-document-owner="react-router"',
		);
		expect(applyAttributesToHtmlElement).toHaveBeenCalledWith('<html><body><main>Page</main></body></html>', {
			'data-eco-document-owner': 'react-router',
		});
	});
});
