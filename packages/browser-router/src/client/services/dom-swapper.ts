/**
 * DOM morphing service for client-side navigation
 * @module
 */

import morphdom from 'morphdom';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

/**
 * Checks if an element should be persisted across navigations.
 * @param element - The element to check
 * @param persistAttribute - User-configured persist attribute name
 * @returns True if element has either the configured or default persist attribute
 */
function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
}

/**
 * Gets the persist key for element matching.
 * @param element - The element to get key from
 * @param persistAttribute - User-configured persist attribute name
 * @returns The persist key value or undefined
 */
function getPersistKey(element: Element, persistAttribute: string): string | undefined {
	return element.getAttribute(persistAttribute) || element.getAttribute(DEFAULT_PERSIST_ATTR) || undefined;
}

/**
 * Checks if an element is a hydrated custom element with shadow DOM.
 *
 * Custom elements (identified by hyphen in tag name) that have an attached
 * shadow root have been hydrated and should not be modified by morphdom
 * to preserve their internal state (e.g., Lit components).
 *
 * @param element - The element to check
 * @returns True if element is a hydrated custom element
 */
function isHydratedCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot !== null;
}

/**
 * Service for handling DOM manipulation during page transitions.
 *
 * Uses morphdom for efficient DOM diffing while preserving:
 * - Persisted elements (marked with persist attribute)
 * - Hydrated custom elements with shadow DOM
 * - Declarative shadow DOM templates
 *
 * Also handles re-execution of scripts marked for re-run after navigation.
 */
export class DomSwapper {
	private persistAttribute: string;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	/**
	 * Parses an HTML string into a Document.
	 * @param html - Raw HTML string to parse
	 * @returns Parsed Document object
	 */
	parseHTML(html: string): Document {
		const parser = new DOMParser();
		return parser.parseFromString(html, 'text/html');
	}

	/**
	 * Morphs the current document head to match the new document.
	 *
	 * Uses key-based matching for proper element diffing:
	 * - Scripts matched by `data-eco-script-id` or `src`
	 * - Links matched by `href`
	 * - Meta tags matched by `name` or `property`
	 *
	 * Scripts marked with `data-eco-rerun` that are new to the page are
	 * replaced with fresh clones to force execution.
	 *
	 * @param newDocument - The new document to morph towards
	 */
	morphHead(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		const existingScriptIds = new Set(
			Array.from(document.head.querySelectorAll('script[data-eco-script-id]')).map((s) =>
				s.getAttribute('data-eco-script-id'),
			),
		);

		morphdom(document.head, newDocument.head, {
			getNodeKey: (node) => {
				if (node instanceof Element) {
					const persistId = getPersistKey(node, persistAttr);
					if (persistId) return `persist:${persistId}`;

					const tagName = node.tagName.toLowerCase();
					if (tagName === 'link') return (node as HTMLLinkElement).href;
					if (tagName === 'script') {
						const scriptId = node.getAttribute('data-eco-script-id');
						if (scriptId) return `script:${scriptId}`;
						return (node as HTMLScriptElement).src || undefined;
					}
					if (tagName === 'meta') {
						const name = node.getAttribute('name') || node.getAttribute('property');
						return name ? `meta:${name}` : undefined;
					}
					if (tagName === 'title') return 'title';
				}
			},

			onBeforeNodeDiscarded: (node) => {
				if (node instanceof Element && isPersisted(node, persistAttr)) {
					return false;
				}
				return true;
			},

			onNodeAdded: (node) => {
				if (node.nodeName === 'SCRIPT') {
					const script = node as HTMLScriptElement;
					const scriptId = script.getAttribute('data-eco-script-id');

					if (script.hasAttribute('data-eco-rerun') && scriptId && !existingScriptIds.has(scriptId)) {
						const newScript = document.createElement('script');
						for (const attr of script.attributes) {
							if (attr.name !== 'data-eco-rerun') {
								newScript.setAttribute(attr.name, attr.value);
							}
						}
						newScript.textContent = script.textContent;
						script.replaceWith(newScript);
						return newScript;
					}
				}
				return node;
			},
		});
	}

	/**
	 * Morphs the current document body to match the new document.
	 *
	 * Efficiently diffs the DOM and only updates what changed, preserving:
	 * - Persisted elements (entire subtree preserved)
	 * - Hydrated custom elements with shadow DOM
	 *
	 * After morphing, processes declarative shadow DOM templates and
	 * triggers Lit hydration for newly inserted elements.
	 *
	 * @param newDocument - The new document to morph towards
	 */
	morphBody(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		morphdom(document.body, newDocument.body, {
			getNodeKey: (node) => {
				if (node instanceof Element) {
					return getPersistKey(node, persistAttr) || node.id || undefined;
				}
			},

			onBeforeElUpdated: (fromEl, toEl) => {
				if (isPersisted(fromEl, persistAttr)) return false;
				if (isHydratedCustomElement(fromEl)) return false;
				if (fromEl.isEqualNode(toEl)) return false;
				return true;
			},

			onBeforeElChildrenUpdated: (fromEl, _toEl) => {
				if (isPersisted(fromEl, persistAttr)) return false;
				if (isHydratedCustomElement(fromEl)) return false;
				return true;
			},
		});

		this.processDeclarativeShadowDOM(document.body);
	}

	/**
	 * Processes declarative shadow DOM templates that were dynamically inserted.
	 *
	 * Browsers only process `<template shadowrootmode>` during initial HTML parsing.
	 * When morphdom inserts new elements with DSD templates, they remain as
	 * regular template elements. This method manually attaches them as shadow roots.
	 *
	 * @see https://github.com/patrick-steele-idem/morphdom/issues/127
	 *
	 * @param root - Root element to search for unprocessed templates
	 */
	private processDeclarativeShadowDOM(root: Element | Document | ShadowRoot): void {
		const templates = root.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode], template[shadowroot]');

		for (const template of templates) {
			const mode = (template.getAttribute('shadowrootmode') ||
				template.getAttribute('shadowroot')) as ShadowRootMode;
			const parent = template.parentElement;

			if (parent && !parent.shadowRoot) {
				const shadowRoot = parent.attachShadow({ mode });
				shadowRoot.appendChild(template.content);
				template.remove();

				this.processDeclarativeShadowDOM(shadowRoot);
			}
		}
	}
}
