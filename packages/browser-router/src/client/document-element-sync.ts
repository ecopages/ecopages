/**
 * Helpers for synchronizing selected root `<html>` attributes during client-side navigation.
 * @module
 */

/**
 * Synchronizes a selected set of root `<html>` attributes from an incoming document
 * onto the current live document.
 *
 * Attributes listed here are treated as document-owned metadata. Attributes not
 * listed remain untouched on the live document so client-managed state can survive
 * across navigation swaps.
 *
 * @param currentDocument - The live document being updated
 * @param newDocument - The parsed incoming document for the next page
 * @param attributes - Root `<html>` attributes to synchronize
 */
export function syncDocumentElementAttributes(
	currentDocument: Document,
	newDocument: Document,
	attributes: readonly string[],
): void {
	const currentHtml = currentDocument.documentElement;
	const nextHtml = newDocument.documentElement;

	for (const attributeName of attributes) {
		const nextValue = nextHtml.getAttribute(attributeName);

		if (nextValue === null) {
			currentHtml.removeAttribute(attributeName);
			continue;
		}

		if (currentHtml.getAttribute(attributeName) !== nextValue) {
			currentHtml.setAttribute(attributeName, nextValue);
		}
	}
}
