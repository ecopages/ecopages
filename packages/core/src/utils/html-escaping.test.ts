import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeHtmlAttribute, escapeXmlText } from './html-escaping.ts';

describe('markup escaping', () => {
	it('preserves context-specific escaping through the shared implementation', () => {
		const value = `&<>"'`;

		expect(escapeHtml(value)).toBe('&amp;&lt;&gt;&quot;&#39;');
		expect(escapeHtmlAttribute(value)).toBe("&amp;&lt;&gt;&quot;'");
		expect(escapeXmlText(value)).toBe('&amp;&lt;&gt;&quot;&apos;');
	});
});
