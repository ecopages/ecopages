import morphdom from 'morphdom';
import { ECO_PERSIST_ATTRIBUTE } from '@ecopages/core/router/navigation-pipeline';

function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(ECO_PERSIST_ATTRIBUTE);
}

function isHydratedCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot !== null;
}

/**
 * Finds the persisted path and custom-element descendants retained during rerun refreshes.
 *
 * @remarks
 * Custom elements may bind listeners to their children in `connectedCallback`. Their descendants
 * must remain the same nodes when a persisted element keeps the custom-element host connected.
 */
function findPersistedRerunContext(root: Element, persistAttribute: string): Set<Element> {
	const retainedElements = new Set<Element>();
	for (const element of root.querySelectorAll('*')) {
		if (!isPersisted(element, persistAttribute)) continue;
		let parent = element.parentElement;
		while (parent && parent !== root) {
			retainedElements.add(parent);
			if (parent.localName.includes('-')) {
				for (const descendant of parent.querySelectorAll('*')) {
					retainedElements.add(descendant);
				}
			}
			parent = parent.parentElement;
		}
	}
	return retainedElements;
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

	return element.getAttribute(persistAttribute) || element.getAttribute(ECO_PERSIST_ATTRIBUTE) || undefined;
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
function deferElementReplacement(
	fromEl: Element,
	toEl: Element,
	deferred: Array<{ from: Element; to: Element; isCustomElement: boolean }>,
): false {
	deferred.push({
		from: fromEl,
		to: toEl.cloneNode(true) as Element,
		isCustomElement: fromEl.localName.includes('-'),
	});
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
 * Custom elements are recreated via `document.createElement` so the browser fires
 * their full lifecycle. Elements already removed during the morph pass are skipped.
 */
function flushDeferredReplacements(deferred: Array<{ from: Element; to: Element; isCustomElement: boolean }>): void {
	for (const { from, to, isCustomElement } of deferred) {
		if (!from.isConnected) continue;
		const newEl = isCustomElement ? materializeCustomElement(to) : (to.cloneNode(true) as Element);
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
 * Preserves persisted elements and hydrated custom elements when their ancestor
 * structure remains compatible. Rerun scripts refresh matching non-persisted
 * elements so freshly activated handlers do not accumulate on nodes retained by
 * morphdom.
 *
 * @remarks
 * Persisted nodes and their ancestors remain in place while other matching
 * elements are refreshed, so rerun scripts that add handlers to retained nodes
 * must register them idempotently. Descendants of custom elements on that path
 * also remain the same nodes when their markup stays structurally compatible;
 * changed child markup can replace nodes without reconnecting the host, so
 * components must handle rebinding.
 * Light-DOM custom elements are fully replaced to trigger their
 * disconnectedCallback → connectedCallback lifecycle.
 */
export function morphBody(newDocument: Document, persistAttribute: string): void {
	const deferredReplacements: Array<{ from: Element; to: Element; isCustomElement: boolean }> = [];
	const refreshUnpersistedElements = newDocument.querySelector('script[data-eco-rerun]') !== null;
	const retainedRerunContext: Set<Element> = refreshUnpersistedElements
		? findPersistedRerunContext(document.body, persistAttribute)
		: new Set<Element>();

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
			if (refreshUnpersistedElements) {
				if (fromEl === document.body || retainedRerunContext.has(fromEl)) {
					return true;
				}
				return deferElementReplacement(fromEl, toEl, deferredReplacements);
			}
			if (isHydratedCustomElement(fromEl)) {
				return deferElementReplacement(fromEl, toEl, deferredReplacements);
			}

			if (isLightDomCustomElement(fromEl)) {
				return deferElementReplacement(fromEl, toEl, deferredReplacements);
			}

			if (fromEl.isEqualNode(toEl)) {
				return false;
			}

			return true;
		},
	});

	flushDeferredReplacements(deferredReplacements);
	processDeclarativeShadowDOM(document.body);
}
