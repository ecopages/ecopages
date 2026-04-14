/**
 * Escapes a string for safe use inside a double-quoted HTML attribute value.
 *
 * @param value Raw attribute value.
 * @returns Escaped attribute-safe string.
 */
export function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
