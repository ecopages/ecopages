import { describe, expect, it } from 'vitest';
import {
	ECO_PAGE_MODULE_PROP,
	escapePageDataJson,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	serializePageDataManifestScript,
	serializePageDataScript,
} from './serialize-page-data-script.ts';

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

	it('should emit a versioned manifest with module identity and props', () => {
		expect(
			serializePageDataManifestScript({
				module: '/assets/pages/docs.js',
				props: { slug: 'intro' },
			}),
		).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"v":1,"navigationOwner":"react-router","module":"/assets/pages/docs.js","props":{"slug":"intro"}}</script>',
		);
		expect(ECO_PAGE_MODULE_PROP).toBe('__ecoPageModule');
	});

	it('should reject malformed envelopes instead of treating them as flat props', () => {
		const malformed = { v: 1, module: '/x.js', props: null };
		expect(resolveEcoPageDataProps(malformed)).toEqual({});
		expect(resolveEcoPageDataModuleUrl(malformed)).toBeNull();
	});

	it('should unwrap valid v1 envelopes and keep legacy flat props', () => {
		expect(
			resolveEcoPageDataProps({
				v: 1,
				navigationOwner: 'react-router',
				module: '/assets/page.js',
				props: { slug: 'intro' },
			}),
		).toEqual({ slug: 'intro' });
		expect(resolveEcoPageDataProps({ slug: 'legacy' })).toEqual({ slug: 'legacy' });
	});
});
