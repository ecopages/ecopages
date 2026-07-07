import morphdom from 'morphdom';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
}

function isHydratedCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot !== null;
}

/**
 * Returns the only body-morph keys that browser-router should trust.
 *
 * @remarks
 * morphdom defaults to treating every `id` attribute as a structural key.
 * That is fragile for content-heavy pages where repeated heading ids or other
 * invalid-but-common markup can appear. Browser-router only needs stable keys
 * for explicitly persisted nodes, so all other elements fall back to normal
 * tree-order diffing.
 */
function getBodyMorphKey(element: Node, persistAttribute: string): string | undefined {
	if (!(element instanceof Element)) {
		return undefined;
	}

	return element.getAttribute(persistAttribute) || element.getAttribute(DEFAULT_PERSIST_ATTR) || undefined;
}

function isLightDomCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot === null;
}

/**
 * @returns Always `false` to tell morphdom to skip updating this element.
 *
 * @remarks
 * Replacing elements during morphdom traversal mutates the live DOM tree,
 * which can cause morphdom to skip siblings or process stale nodes.
 * Deferring the replacement until after morphdom finishes avoids this.
 */
function replaceCustomElement(fromEl: Element, toEl: Element, deferred: Array<{ from: Element; to: Element }>): false {
	deferred.push({ from: fromEl, to: toEl.cloneNode(true) as Element });
	return false;
}

function materializeCustomElement(element: Element): Element {
	const materializedElement = document.createElement(element.localName);
	for (const attr of element.attributes) {
		materializedElement.setAttribute(attr.name, attr.value);
	}
	materializedElement.innerHTML = element.innerHTML;
	return materializedElement;
}

/**
 * @remarks
 * Each element is recreated via `document.createElement` so the browser fires
 * the full custom element lifecycle (`disconnectedCallback` on the old instance,
 * `connectedCallback` on the new one). Elements that were already removed during
 * the morph pass are skipped via the `isConnected` guard.
 */
function flushDeferredCustomElementReplacements(deferred: Array<{ from: Element; to: Element }>): void {
	for (const { from, to } of deferred) {
		if (!from.isConnected) continue;
		const newEl = materializeCustomElement(to);
		from.replaceWith(newEl);
	}
}

/**
 * Manually attaches declarative shadow DOM templates.
 *
 * @remarks
 * Browsers only process `<template shadowrootmode>` during initial parse.
 */
export function processDeclarativeShadowDOM(root: Element | Document | ShadowRoot): void {
	const templates = root.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode], template[shadowroot]');

	for (const template of templates) {
		const mode = (template.getAttribute('shadowrootmode') || template.getAttribute('shadowroot')) as ShadowRootMode;
		const parent = template.parentElement;

		if (parent && !parent.shadowRoot) {
			const shadowRoot = parent.attachShadow({ mode });
			shadowRoot.appendChild(template.content);
			template.remove();

			processDeclarativeShadowDOM(shadowRoot);
		}
	}
}

/**
 * Morphs document body using morphdom.
 *
 * @remarks
 * Preserves persisted elements and hydrated custom elements.
 * Light-DOM custom elements are fully replaced to trigger proper
 * disconnectedCallback → connectedCallback lifecycle.
 */
export function morphBody(newDocument: Document, persistAttribute: string): void {
	const deferredReplacements: Array<{ from: Element; to: Element }> = [];

	morphdom(document.body, newDocument.body, {
		getNodeKey: (node) => getBodyMorphKey(node, persistAttribute),
		onBeforeNodeAdded: (node) => {
			if (node instanceof Element && isLightDomCustomElement(node)) {
				return materializeCustomElement(node);
			}

			return node;
		},
		onBeforeElUpdated: (fromEl, toEl) => {
			if (isPersisted(fromEl, persistAttribute)) {
				return false;
			}
			if (isHydratedCustomElement(fromEl)) {
				return replaceCustomElement(fromEl, toEl, deferredReplacements);
			}

			if (isLightDomCustomElement(fromEl)) {
				return replaceCustomElement(fromEl, toEl, deferredReplacements);
			}

			if (fromEl.isEqualNode(toEl)) {
				return false;
			}

			return true;
		},
	});

	flushDeferredCustomElementReplacements(deferredReplacements);
	processDeclarativeShadowDOM(document.body);
}

/**
 * Replaces body content in a single operation.
 *
 * @remarks
 * Preserves persisted elements by moving them to the new body.
 * Use when View Transitions are disabled.
 */
export function replaceBody(newDocument: Document, persistAttribute: string): void {
	const persistedElements = document.body.querySelectorAll(`[${persistAttribute}], [${DEFAULT_PERSIST_ATTR}]`);
	const persistedMap = new Map<string, Element>();

	for (const el of persistedElements) {
		const key = el.getAttribute(persistAttribute) || el.getAttribute(DEFAULT_PERSIST_ATTR);
		if (key) {
			persistedMap.set(key, el);
		}
	}

	for (const [key, oldEl] of persistedMap) {
		const placeholder = newDocument.body.querySelector(
			`[${persistAttribute}="${key}"], [${DEFAULT_PERSIST_ATTR}="${key}"]`,
		);
		if (placeholder) {
			placeholder.replaceWith(oldEl);
		}
	}

	document.body.replaceChildren(...Array.from(newDocument.body.childNodes));
	processDeclarativeShadowDOM(document.body);
}
