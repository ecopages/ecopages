import { describe, expect, it } from 'vitest';
import { ReactPagePayloadService } from './react-page-payload.service.ts';

describe('ReactPagePayloadService', () => {
	it('emits a v1 envelope with flat page props when moduleUrl is provided', () => {
		const service = new ReactPagePayloadService();
		const html = service.buildRouterPageDataScript({ slug: 'intro', params: {} }, '/assets/page.js');

		expect(html).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"/assets/page.js","props":{"slug":"intro","params":{}}}</script>',
		);
	});

	it('emits legacy flat props when moduleUrl is absent', () => {
		const service = new ReactPagePayloadService();
		expect(service.buildRouterPageDataScript({ slug: 'legacy' })).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"slug":"legacy"}</script>',
		);
	});
});
