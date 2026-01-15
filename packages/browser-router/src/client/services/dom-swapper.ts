/**
 * DOM morphing service for client-side navigation.
 * @module dom-swapper
 */

import morphdom from 'morphdom';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';
const DEFAULT_STYLESHEET_TIMEOUT = 5000;

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
 * Collects hrefs of active stylesheets, excluding preloaded ones.
 */
function getExistingStylesheetHrefs(): Set<string> {
	return new Set(
		Array.from(
			document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]:not([data-eco-preload])'),
		).map((link) => link.href),
	);
}

/**
 * Finds stylesheets in new document not present in current document.
 */
function getNewStylesheets(newDocument: Document, existingHrefs: Set<string>): HTMLLinkElement[] {
	return Array.from(newDocument.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter(
		(link) => !existingHrefs.has(link.href),
	);
}

/**
 * Downloads a stylesheet without applying it using `media="not all"`.
 * Stores original media in dataset for later activation.
 */
function preloadStylesheet(link: HTMLLinkElement, timeout = DEFAULT_STYLESHEET_TIMEOUT): Promise<void> {
	return new Promise<void>((resolve) => {
		const newLink = document.createElement('link');
		newLink.rel = 'stylesheet';
		newLink.href = link.href;
		newLink.media = 'not all';
		newLink.dataset.ecoPreload = '';
		if (link.media && link.media !== 'all') {
			newLink.dataset.ecoTargetMedia = link.media;
		}

		const timeoutId = setTimeout(resolve, timeout);

		newLink.onload = () => {
			clearTimeout(timeoutId);
			resolve();
		};
		newLink.onerror = () => {
			clearTimeout(timeoutId);
			resolve();
		};

		document.head.appendChild(newLink);
	});
}

/**
 * Activates preloaded stylesheets by restoring their media attribute.
 * Used when View Transitions are disabled to apply styles before DOM swap.
 */
function activatePreloadedStylesheets(): void {
	for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[data-eco-preload]')) {
		const targetMedia = link.dataset.ecoTargetMedia;
		link.media = targetMedia || 'all';
		delete link.dataset.ecoPreload;
		delete link.dataset.ecoTargetMedia;
	}
}

/**
 * Removes preloaded stylesheets after morphdom has inserted the real ones.
 */
function removePreloadedStylesheets(): void {
	for (const link of document.head.querySelectorAll('link[data-eco-preload]')) {
		link.remove();
	}
}

/**
 * Preloads multiple stylesheets in parallel.
 */
function preloadStylesheets(links: HTMLLinkElement[]): Promise<void[]> {
	return Promise.all(links.map((link) => preloadStylesheet(link)));
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
	 * Downloads with `media="not all"` (cached but not applied).
	 * When `activate=true`, immediately applies styles (for non-View-Transition mode).
	 * When `activate=false`, styles remain hidden until morphdom inserts real links.
	 */
	async preloadStylesheets(newDocument: Document, activate = false): Promise<void> {
		const existingStylesheetHrefs = getExistingStylesheetHrefs();
		const newStylesheetLinks = getNewStylesheets(newDocument, existingStylesheetHrefs);

		if (newStylesheetLinks.length > 0) {
			await preloadStylesheets(newStylesheetLinks);
			if (activate) {
				activatePreloadedStylesheets();
			}
		}
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

		removePreloadedStylesheets();
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
