import { describe, expect, it } from 'vitest';
import { escapePageDataJson, serializePageDataScript } from './serialize-page-data-script.ts';

describe('serialize-page-data-script', () => {
	it('should escape less-than in serialized page data', () => {
		expect(escapePageDataJson({ title: '<script>alert(1)</script>' })).toBe(
			'{"title":"\\u003cscript>alert(1)\\u003c/script>"}',
		);
	});

	it('should emit the canonical page data script tag', () => {
		expect(serializePageDataScript({ count: 1 })).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"count":1}</script>',
		);
	});
});
