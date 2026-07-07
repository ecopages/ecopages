/**
 * Preloads new stylesheets from target document to prevent FOUC.
 *
 * @remarks
 * Discovers stylesheet links in the target document that aren't present in the
 * current document, creates corresponding link elements, and waits for all to
 * load before resolving. This follows Turbo's approach of waiting for stylesheets
 * before any DOM updates.
 */
export async function preloadStylesheets(newDocument: Document): Promise<void> {
	const existingHrefs = new Set(
		Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href),
	);

	const newStylesheetLinks = Array.from(
		newDocument.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
	).filter((link) => !existingHrefs.has(link.href));

	if (newStylesheetLinks.length === 0) {
		return;
	}

	const TIMEOUT = 5000;
	const loadPromises = newStylesheetLinks.map((link) => {
		return new Promise<void>((resolve) => {
			const newLink = document.createElement('link');
			newLink.rel = 'stylesheet';
			newLink.media = link.media || 'all';

			const timeoutId = setTimeout(() => {
				cleanup();
				resolve();
			}, TIMEOUT);

			const cleanup = () => {
				clearTimeout(timeoutId);
				newLink.onload = null;
				newLink.onerror = null;
			};

			newLink.onload = () => {
				cleanup();
				resolve();
			};

			newLink.onerror = () => {
				cleanup();
				resolve();
			};

			newLink.href = link.href;
			document.head.appendChild(newLink);
		});
	});

	await Promise.all(loadPromises);
}
