import { describe, expect, it, afterEach } from 'vitest';
import {
	getDevPageDataReaderBootstrapSource,
	getProdPageDataReaderBootstrapSource,
	readPageDataDocument,
	type ReadPageDataDocumentResult,
} from './page-data-reader.ts';

function installPageDataScript(content: string | null): void {
	const script = content === null ? null : { id: '__ECO_PAGE_DATA__', textContent: content };
	(globalThis as { document?: { getElementById: (id: string) => typeof script } }).document = {
		getElementById: (id: string) => (id === '__ECO_PAGE_DATA__' ? script : null),
	};
}

function readViaBootstrap(source: string, readerName: 'readPageDataDocument' | 'rd'): ReadPageDataDocumentResult {
	const reader = new Function(`${source}; return ${readerName};`)() as () => ReadPageDataDocumentResult;
	return reader();
}

const fixtures: Array<{ name: string; content: string | null; expected: ReadPageDataDocumentResult }> = [
	{
		name: 'v1 envelope',
		content: JSON.stringify({
			schemaVersion: 1,
			navigationOwner: 'react-router',
			moduleUrl: '/assets/page.js',
			props: { slug: 'intro' },
		}),
		expected: {
			moduleUrl: '/assets/page.js',
			props: { slug: 'intro' },
		},
	},
	{
		name: 'legacy flat props',
		content: JSON.stringify({ slug: 'legacy' }),
		expected: { props: { slug: 'legacy' } },
	},
	{
		name: 'malformed numeric envelope',
		content: JSON.stringify({ schemaVersion: 1, moduleUrl: '/x.js', props: null }),
		expected: { props: {} },
	},
	{
		name: 'legacy string schemaVersion field',
		content: JSON.stringify({ schemaVersion: '1.2.3', slug: 'x' }),
		expected: { props: { schemaVersion: '1.2.3', slug: 'x' } },
	},
	{
		name: 'missing script',
		content: null,
		expected: { props: {} },
	},
	{
		name: 'invalid JSON',
		content: 'not-json',
		expected: { props: {} },
	},
];

describe('page-data-reader', () => {
	afterEach(() => {
		delete (globalThis as { document?: unknown }).document;
	});

	it('should read v1 envelopes from __ECO_PAGE_DATA__', () => {
		installPageDataScript(
			JSON.stringify({
				schemaVersion: 1,
				navigationOwner: 'react-router',
				moduleUrl: '/assets/page.js',
				props: { slug: 'intro' },
			}),
		);

		expect(readPageDataDocument()).toEqual({
			moduleUrl: '/assets/page.js',
			props: { slug: 'intro' },
		});
	});

	it('should fall back to legacy flat props', () => {
		installPageDataScript(JSON.stringify({ slug: 'legacy' }));

		expect(readPageDataDocument()).toEqual({ props: { slug: 'legacy' } });
	});

	it('keeps inlined bootstrap readers aligned with readPageDataDocument', () => {
		const devSource = getDevPageDataReaderBootstrapSource();
		const prodSource = getProdPageDataReaderBootstrapSource();

		for (const fixture of fixtures) {
			installPageDataScript(fixture.content);
			expect(readPageDataDocument(), fixture.name).toEqual(fixture.expected);
			expect(readViaBootstrap(devSource, 'readPageDataDocument'), `dev:${fixture.name}`).toEqual(
				fixture.expected,
			);
			expect(readViaBootstrap(prodSource, 'rd'), `prod:${fixture.name}`).toEqual(fixture.expected);
		}
	});
});
