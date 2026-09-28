/**
 * Escapes a string for safe use inside a double-quoted HTML attribute value.
 *
 * @param value Raw attribute value.
 * @returns Escaped attribute-safe string.
 */
export function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Escapes a string for safe use as XML text content (e.g. `<loc>` values).
 *
 * @param value Raw text node value.
 * @returns Escaped XML-safe string.
 */
export function escapeXmlText(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
