import { describe, expect, it, afterEach } from 'vitest';
import { readPageDataDocument } from './page-data-reader.ts';

function installPageDataScript(content: string): void {
	const script = { id: '__ECO_PAGE_DATA__', textContent: content };
	(globalThis as { document?: { getElementById: (id: string) => typeof script | null } }).document = {
		getElementById: (id: string) => (id === '__ECO_PAGE_DATA__' ? script : null),
	};
}

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
});
