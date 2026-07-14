import { expect, test } from 'vitest';
import { getDocsLlmUrlFromPathname } from '@/lib/docs/docs-llm-url';

test('getDocsLlmUrlFromPathname maps docs paths to markdown URLs', () => {
	expect(getDocsLlmUrlFromPathname('/docs/getting-started/introduction')).toBe(
		'/docs-llm/getting-started/introduction.md',
	);
	expect(getDocsLlmUrlFromPathname('/docs/getting-started/introduction/')).toBe(
		'/docs-llm/getting-started/introduction.md',
	);
});

test('getDocsLlmUrlFromPathname returns null for non-docs paths', () => {
	expect(getDocsLlmUrlFromPathname('/')).toBeNull();
	expect(getDocsLlmUrlFromPathname('/docs/getting-started')).toBeNull();
});
