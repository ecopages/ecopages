/**
 * Manages DOM morphing during navigation
 * @module
 */

import morphdom from 'morphdom';

/**
 * Default persist attribute - always checked as fallback.
 */
const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

/**
 * Check if an element should be persisted.
 * Checks both user-configured attribute and the default fallback.
 */
function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
}

/**
 * Get persist key for an element.
 * Checks both user-configured attribute and the default fallback.
 */
function getPersistKey(element: Element, persistAttribute: string): string | undefined {
	return element.getAttribute(persistAttribute) || element.getAttribute(DEFAULT_PERSIST_ATTR) || undefined;
}

/**
 * Service for handling DOM manipulation during page transitions.
 * Uses morphdom for efficient DOM diffing, preserving element state.
 */
export class DomSwapper {
	private persistAttribute: string;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	/**
	 * Parse HTML string into a Document
	 */
	parseHTML(html: string): Document {
		const parser = new DOMParser();
		return parser.parseFromString(html, 'text/html');
	}

	/**
	 * Morph the current document head to match the new document.
	 * Uses proper keying to match elements by their identifying attributes.
	 * Elements with persist attribute are never removed.
	 */
	morphHead(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		morphdom(document.head, newDocument.head, {
			/**
			 * Match elements by their identifying attributes to enable proper diffing.
			 * Also matches persisted elements by their persist ID.
			 */
			getNodeKey: (node) => {
				if (node instanceof Element) {
					// Prioritize persist attributes for matching
					const persistId = getPersistKey(node, persistAttr);
					if (persistId) return `persist:${persistId}`;

					const tagName = node.tagName.toLowerCase();
					if (tagName === 'link') return (node as HTMLLinkElement).href;
					if (tagName === 'script') return (node as HTMLScriptElement).src || undefined;
					if (tagName === 'meta') {
						const name = node.getAttribute('name') || node.getAttribute('property');
						return name ? `meta:${name}` : undefined;
					}
					if (tagName === 'title') return 'title';
				}
			},

			/**
			 * Don't remove persisted elements.
			 */
			onBeforeNodeDiscarded: (node) => {
				if (node instanceof Element && isPersisted(node, persistAttr)) {
					return false;
				}
				return true;
			},
		});
	}

	/**
	 * Morph the current document body to match the new document using morphdom.
	 * This efficiently diffs the DOM and only updates what changed,
	 * preserving internal state of unchanged elements.
	 *
	 * Elements marked with the persist attribute are skipped entirely,
	 * preserving their internal state (event listeners, component state, etc.)
	 */
	morphBody(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		morphdom(document.body, newDocument.body, {
			/**
			 * Match elements by persist attribute or id.
			 * This allows morphdom to correctly pair up elements between
			 * the old and new DOM trees.
			 */
			getNodeKey: (node) => {
				if (node instanceof Element) {
					return getPersistKey(node, persistAttr) || node.id || undefined;
				}
			},

			/**
			 * Skip updating persisted elements entirely.
			 * Also skip identical nodes for performance.
			 */
			onBeforeElUpdated: (fromEl, toEl) => {
				if (isPersisted(fromEl, persistAttr)) {
					return false;
				}
				if (fromEl.isEqualNode(toEl)) {
					return false;
				}
				return true;
			},

			/**
			 * Skip processing children of persisted elements.
			 * This ensures the entire subtree is preserved.
			 */
			onBeforeElChildrenUpdated: (fromEl, _toEl) => {
				if (isPersisted(fromEl, persistAttr)) {
					return false;
				}
				return true;
			},
		});
	}
}
