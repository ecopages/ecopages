import { describe, expect, test } from 'vitest';
import { highlightToHtml, resolveLanguage } from './pierre-highlight';

const DOCS_LANGUAGES = [
	'typescript',
	'ts',
	'tsx',
	'js',
	'javascript',
	'css',
	'html',
	'json',
	'bash',
	'sh',
	'yaml',
	'markdown',
	'mdx',
	'dockerfile',
];

describe('resolveLanguage', () => {
	test.each(DOCS_LANGUAGES)('keeps %s, which the docs fence, and does not fall back to text', (name) => {
		expect(resolveLanguage(name)).toBe(name);
	});

	test('falls back to text for an unknown, empty or missing language', () => {
		expect(resolveLanguage('nope')).toBe('text');
		expect(resolveLanguage('')).toBe('text');
		expect(resolveLanguage(undefined)).toBe('text');
	});
});

describe('highlightToHtml', () => {
	test('wraps each line in a .line span and escapes html characters', () => {
		const html = highlightToHtml('<a href="x">&</a>\nsecond', 'html');

		expect(html.match(/class="line"/g)).toHaveLength(2);
		expect(html).toContain('&lt;');
		expect(html).toContain('&amp;');
		expect(html).not.toContain('<a href');
		expect(html).toMatch(/^<pre style="[^"]*--shiki-light-bg:/);
	});

	test('draws no line for the final newline', () => {
		expect(highlightToHtml('a\nb\n', 'ts').match(/class="line"/g)).toHaveLength(2);
		expect(highlightToHtml('a\n', 'ts').match(/class="line"/g)).toHaveLength(1);
		expect(highlightToHtml('a\n\n', 'ts').match(/class="line"/g)).toHaveLength(2);
	});
});
