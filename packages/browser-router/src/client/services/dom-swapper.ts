/**
 * DOM morphing service for client-side navigation.
 * @module dom-swapper
 */

import morphdom from 'morphdom';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

/**
 * Checks if element has a persist attribute (custom or default).
 */
function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
}

/**
 * Extracts persist key from element for morphdom matching.
 */
function getPersistKey(element: Element, persistAttribute: string): string | undefined {
	return element.getAttribute(persistAttribute) || element.getAttribute(DEFAULT_PERSIST_ATTR) || undefined;
}

/**
 * Detects hydrated custom elements (with shadow DOM) that should skip morphing.
 */
function isHydratedCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot !== null;
}

/**
 * Handles DOM manipulation during client-side page transitions.
 *
 * Preserves persisted elements, hydrated custom elements, and declarative shadow DOM.
 * Uses morphdom for efficient diffing with stylesheet preloading to prevent FOUC.
 */
export class DomSwapper {
	private persistAttribute: string;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	/**
	 * Parses HTML string into a Document, injecting a temporary base tag for URL resolution.
	 */
	parseHTML(html: string, url?: URL): Document {
		const parser = new DOMParser();
		const htmlToParse = url ? `<base href="${url.href}" data-eco-injected>${html}` : html;
		return parser.parseFromString(htmlToParse, 'text/html');
	}

	/**
	 * Preloads new stylesheets from target document to prevent FOUC.
	 *
	 * Discovers stylesheet links in the target document that aren't present in the
	 * current document, creates corresponding link elements, and waits for all to
	 * load before resolving. Includes a 5-second timeout per stylesheet.
	 *
	 * Listeners are attached before setting `href` to ensure load events are captured
	 * even when the resource is already cached.
	 *
	 * @param newDocument - The parsed document containing stylesheets to preload
	 */
	async preloadStylesheets(newDocument: Document): Promise<void> {
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

	/**
	 * Morphs document head using key-based element matching.
	 *
	 * Keys: scripts by `data-eco-script-id`/`src`, links by `href`, meta by `name`/`property`.
	 * Re-executes scripts marked with `data-eco-rerun`. Filters injected base tag.
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
				if (node instanceof Element && node.tagName === 'BASE' && node.hasAttribute('data-eco-injected')) {
					return document.createTextNode('');
				}

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
	 * Morphs document body, preserving persisted elements and hydrated custom elements.
	 * Processes declarative shadow DOM templates after morphing.
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
	 * Replaces body content in a single operation to prevent intermediate paints.
	 * Preserves persisted elements by moving them to the new body.
	 * Use when View Transitions are disabled for flash-free swaps.
	 */
	replaceBody(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		const persistedElements = document.body.querySelectorAll(`[${persistAttr}], [${DEFAULT_PERSIST_ATTR}]`);
		const persistedMap = new Map<string, Element>();

		for (const el of persistedElements) {
			const key = getPersistKey(el, persistAttr);
			if (key) {
				persistedMap.set(key, el);
			}
		}

		for (const [key, oldEl] of persistedMap) {
			const placeholder = newDocument.body.querySelector(
				`[${persistAttr}="${key}"], [${DEFAULT_PERSIST_ATTR}="${key}"]`,
			);
			if (placeholder) {
				placeholder.replaceWith(oldEl);
			}
		}

		document.body.replaceChildren(...newDocument.body.childNodes);
		this.processDeclarativeShadowDOM(document.body);
	}

	/**
	 * Manually attaches declarative shadow DOM templates inserted by morphdom.
	 * Browsers only process `<template shadowrootmode>` during initial parse.
	 * @see https://github.com/patrick-steele-idem/morphdom/issues/127
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
