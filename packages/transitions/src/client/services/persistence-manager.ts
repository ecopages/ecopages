/**
 * Manages element persistence across navigations
 * @module
 */

/**
 * Service for handling DOM element persistence during page transitions
 */
export class PersistenceManager {
	private persistAttribute: string;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	/**
	 * Collect elements marked for persistence from the current document
	 */
	collectPersistedElements(): Map<string, Element> {
		const elements = new Map<string, Element>();
		const selector = `[${this.persistAttribute}]`;

		for (const element of document.querySelectorAll(selector)) {
			const id = element.getAttribute(this.persistAttribute);
			if (id) {
				elements.set(id, element);
			}
		}

		return elements;
	}

	/**
	 * Restore persisted elements to the new DOM by replacing placeholders
	 */
	restorePersistedElements(persistedElements: Map<string, Element>): void {
		for (const [id, element] of persistedElements) {
			const placeholder = document.querySelector(`[${this.persistAttribute}="${id}"]`);

			if (placeholder) {
				placeholder.replaceWith(element);
			}
		}
	}
}
