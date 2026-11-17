import { describe, expect, it } from 'vitest';
import {
	ECO_PAGE_DATA_TIERS_KEY,
	createEcoPageDataManifestV1,
	escapePageDataJson,
	isEcoPageDataManifestV1,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	resolveEcoPageDataTiers,
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

	it('should lift the reserved tiers key into the envelope when serializing a router document', () => {
		const html = serializePageDataManifestScript({
			moduleUrl: '/assets/page.js',
			props: { id: '1', [ECO_PAGE_DATA_TIERS_KEY]: [{ user: 'Ada' }] },
		});
		const payload = JSON.parse(/>(.*)<\/script>/s.exec(html)![1]!) as Record<string, unknown>;

		expect(payload.tiers).toEqual([{ user: 'Ada' }]);
		expect(payload.props).toEqual({ id: '1' });
		expect(JSON.stringify(payload.props)).not.toContain(ECO_PAGE_DATA_TIERS_KEY);
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
		expect(resolvePageDataDocumentPayload({ slug: 'intro' }, { moduleUrl: '/assets/page.js' })).toEqual({
			schemaVersion: 1,
			navigationOwner: 'react-router',
			moduleUrl: '/assets/page.js',
			props: { slug: 'intro' },
		});
	});

	describe('layout tier props', () => {
		const envelope = { schemaVersion: 1, navigationOwner: 'react-router', moduleUrl: '/p.js', props: { a: 1 } };

		it('should carry tiers on the envelope only when given', () => {
			expect(createEcoPageDataManifestV1({ moduleUrl: '/p.js', props: {} })).not.toHaveProperty('tiers');
			expect(
				createEcoPageDataManifestV1({ moduleUrl: '/p.js', props: {}, tiers: [{ user: 'Ada' }] }),
			).toMatchObject({
				schemaVersion: 1,
				tiers: [{ user: 'Ada' }],
			});
		});

		it('should resolve tiers from an envelope and from the reserved flat key', () => {
			expect(resolveEcoPageDataTiers({ ...envelope, tiers: [{ user: 'Ada' }, {}] })).toEqual([
				{ user: 'Ada' },
				{},
			]);
			expect(resolveEcoPageDataTiers({ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: [{ user: 'Ada' }] })).toEqual([
				{ user: 'Ada' },
			]);
			expect(resolveEcoPageDataTiers(envelope)).toBeUndefined();
			expect(resolveEcoPageDataTiers({ a: 1 })).toBeUndefined();
			expect(resolveEcoPageDataTiers(null)).toBeUndefined();
		});

		it.each([
			['a string', 'x'],
			['an object', {}],
			['an entry that is an array', [[]]],
			['a null entry', [null]],
			['a scalar entry', [1]],
		])('should ignore tiers that are %s without rejecting the envelope', (_name, tiers) => {
			const payload = { ...envelope, tiers };
			expect(isEcoPageDataManifestV1(payload)).toBe(true);
			expect(resolveEcoPageDataTiers(payload)).toBeUndefined();
			expect(resolveEcoPageDataTiers({ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: tiers })).toBeUndefined();
			expect(resolveEcoPageDataProps(payload)).toEqual({ a: 1 });
		});

		it('should never return the reserved key as page props', () => {
			expect(resolveEcoPageDataProps({ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: [{ user: 'Ada' }] })).toEqual({ a: 1 });
			expect(resolveEcoPageDataProps({ ...envelope, tiers: [{}] })).toEqual({ a: 1 });
		});

		it('should lift the reserved key into the envelope when wrapping', () => {
			expect(
				resolvePageDataDocumentPayload(
					{ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: [{ user: 'Ada' }] },
					{ moduleUrl: '/p.js' },
				),
			).toEqual({ ...envelope, tiers: [{ user: 'Ada' }] });
		});

		it('should drop an invalid reserved key when wrapping and keep it flat when not wrapping', () => {
			expect(
				resolvePageDataDocumentPayload({ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: 'x' }, { moduleUrl: '/p.js' }),
			).toEqual(envelope);
			expect(resolvePageDataDocumentPayload({ a: 1, [ECO_PAGE_DATA_TIERS_KEY]: [{ u: 1 }] })).toEqual({
				a: 1,
				[ECO_PAGE_DATA_TIERS_KEY]: [{ u: 1 }],
			});
		});
	});
});
