import { describe, expect, it } from 'vitest';
import { ECO_PAGE_DATA_TIERS_KEY } from './page-data-manifest.ts';
import { PagePayloadService } from './page-payload.ts';

describe('PagePayloadService', () => {
	it('emits a v1 envelope with flat page props when moduleUrl is provided', () => {
		const service = new PagePayloadService();
		const html = service.buildRouterPageDataScript({ slug: 'intro', params: {} }, '/assets/page.js');

		expect(html).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"/assets/page.js","props":{"slug":"intro","params":{}}}</script>',
		);
	});

	it('emits legacy flat props when moduleUrl is absent', () => {
		const service = new PagePayloadService();
		expect(service.buildRouterPageDataScript({ slug: 'legacy' })).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"slug":"legacy"}</script>',
		);
	});

	it('puts the layout tiers in the envelope, not in the page props, for a router document behind a non-React shell', () => {
		const service = new PagePayloadService();
		const pageProps = service.buildSerializedPageProps({
			pageProps: { slug: 'intro' },
			params: {},
			query: {},
			layoutTiers: [{ user: 'Ada' }],
		});

		const html = service.buildRouterPageDataScript(pageProps, '/assets/page.js');
		const payload = JSON.parse(/>(.*)<\/script>/s.exec(html)![1]!) as Record<string, unknown>;

		expect(payload.tiers).toEqual([{ user: 'Ada' }]);
		expect(payload.props).toEqual({ slug: 'intro', params: {}, query: {} });
		expect(html).not.toContain(ECO_PAGE_DATA_TIERS_KEY);
	});
});
