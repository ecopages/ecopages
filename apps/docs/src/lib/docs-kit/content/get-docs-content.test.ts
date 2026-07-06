import { expect, test, vi } from 'vitest';

vi.mock('@/lib/docs-kit/config', () => ({
	getDocsKit: () => ({
		content: {
			sections: [
				{
					id: 'getting-started',
					title: 'Getting Started',
					pages: [
						{
							slug: 'introduction',
							title: 'Introduction',
							description: 'Intro.',
							content: () => 'content',
						},
					],
				},
			],
		},
	}),
}));

import { getDocsContent } from './get-docs-content';

test('getDocsContent resolves imported MDX modules from site content', () => {
	expect(getDocsContent('getting-started', 'introduction')()).toBe('content');
});

test('getDocsContent rejects unknown pages', () => {
	expect(() => getDocsContent('missing', 'page')).toThrow(/Unknown docs page/);
});
