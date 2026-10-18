function escapeMarkupContent(value: string, apostropheReference?: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return apostropheReference ?? character;
		}
	});
}

/**
 * Escapes a string for HTML text while retaining the numeric apostrophe reference.
 *
 * @param value Raw HTML text.
 * @returns Escaped HTML content.
 */
export function escapeHtml(value: string): string {
	return escapeMarkupContent(value, '&#39;');
}

/**
 * Escapes a string for safe use inside a double-quoted HTML attribute value.
 *
 * @param value Raw attribute value.
 * @returns Escaped attribute-safe string.
 */
export function escapeHtmlAttribute(value: string): string {
	return escapeMarkupContent(value);
}

/**
 * Escapes a string for safe use as XML text content (e.g. `<loc>` values).
 *
 * @param value Raw text node value.
 * @returns Escaped XML-safe string.
 */
export function escapeXmlText(value: string): string {
	return escapeMarkupContent(value, '&apos;');
}
