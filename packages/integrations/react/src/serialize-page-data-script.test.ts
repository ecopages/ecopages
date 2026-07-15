import { describe, expect, it } from 'vitest';
import {
	escapePageDataJson,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	resolvePageDataDocumentPayload,
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
				moduleUrl: '/assets/pages/docs.js',
				props: { slug: 'intro' },
			}),
		).toBe(
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"/assets/pages/docs.js","props":{"slug":"intro"}}</script>',
		);
	});

	it('should reject malformed envelopes instead of treating them as flat props', () => {
		const malformed = { schemaVersion: 1, moduleUrl: '/x.js', props: null };
		expect(resolveEcoPageDataProps(malformed)).toEqual({});
		expect(resolveEcoPageDataModuleUrl(malformed)).toBeNull();
	});

	it('should keep legacy flat props that include a string schemaVersion field', () => {
		expect(resolveEcoPageDataProps({ schemaVersion: '1.2.3', slug: 'x' })).toEqual({
			schemaVersion: '1.2.3',
			slug: 'x',
		});
	});

	it('should unwrap valid v1 envelopes and keep legacy flat props', () => {
		expect(
			resolveEcoPageDataProps({
				schemaVersion: 1,
				navigationOwner: 'react-router',
				moduleUrl: '/assets/page.js',
				props: { slug: 'intro' },
			}),
		).toEqual({ slug: 'intro' });
		expect(resolveEcoPageDataProps({ slug: 'legacy' })).toEqual({ slug: 'legacy' });
	});

	it('should build envelopes from flat props and an explicit module URL', () => {
		expect(
			resolvePageDataDocumentPayload({ slug: 'intro' }, { moduleUrl: '/assets/page.js' }),
		).toEqual({
			schemaVersion: 1,
			navigationOwner: 'react-router',
			moduleUrl: '/assets/page.js',
			props: { slug: 'intro' },
		});
	});
});
