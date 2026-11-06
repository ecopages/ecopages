import morphdom from 'morphdom';
import { ECO_PERSIST_ATTRIBUTE } from '@ecopages/core/client';

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

/**
 * Maps each live body element to a detached copy of the server markup it was rendered from.
 *
 * @remarks
 * A same-URL reload compares this markup with the incoming markup instead of comparing the live element, which
 * always differs once a component or script has touched it.
 */
export type ServerMarkup = WeakMap<Element, Element>;

/**
 * Pairs the elements of two subtrees with the same structure, such as an element and its clone.
 */
function recordServerSubtree(serverMarkup: ServerMarkup, live: Element, server: Element): void {
	serverMarkup.set(live, server);
	const liveDescendants = live.querySelectorAll('*');
	const serverDescendants = server.querySelectorAll('*');
	for (let index = 0; index < liveDescendants.length; index++) {
		serverMarkup.set(liveDescendants[index], serverDescendants[index]);
	}
}

/**
 * Copies a live element as markup, writing each open shadow root back as a declarative `<template>` and
 * recording the copy of every element in `serverMarkup`.
 */
function copyLiveMarkup(element: Element, serverMarkup: ServerMarkup): Element {
	const copy = element.cloneNode(false) as Element;
	serverMarkup.set(element, copy);
	if (element.shadowRoot) {
		const template = document.createElement('template');
		template.setAttribute('shadowrootmode', element.shadowRoot.mode);
		if (element.shadowRoot.delegatesFocus) template.setAttribute('shadowrootdelegatesfocus', '');
		if (element.shadowRoot.clonable) template.setAttribute('shadowrootclonable', '');
		if (element.shadowRoot.serializable) template.setAttribute('shadowrootserializable', '');
		for (const child of element.shadowRoot.childNodes) {
			template.content.append(copyLiveNode(child, serverMarkup));
		}
		copy.append(template);
	}
	for (const child of element.childNodes) {
		copy.append(copyLiveNode(child, serverMarkup));
	}
	return copy;
}

function copyLiveNode(node: Node, serverMarkup: ServerMarkup): Node {
	return node instanceof Element ? copyLiveMarkup(node, serverMarkup) : node.cloneNode(false);
}

/**
 * Records the current body as the server markup of the document the router starts on.
 *
 * @remarks
 * The router cannot read the initial HTML response, so it copies the body as it finds it at start. An element a
 * script changed before then counts as changed on the first same-URL reload and is replaced, as on navigation.
 */
export function recordInitialServerMarkup(serverMarkup: ServerMarkup): void {
	copyLiveMarkup(document.body, serverMarkup);
}

/**
 * @remarks
 * Compares serialized markup because `isEqualNode` ignores the contents of a `<template>`, which hold a
 * declarative shadow root.
 */
function isUnchangedServerMarkup(previous: Element | undefined, incoming: Element | undefined): boolean {
	return previous !== undefined && incoming !== undefined && previous.outerHTML === incoming.outerHTML;
}

function hasSameAttributes(left: Element, right: Element): boolean {
	if (left.attributes.length !== right.attributes.length) return false;
	for (const attr of left.attributes) {
		if (right.getAttribute(attr.name) !== attr.value) return false;
	}
	return true;
}

/**
 * Gives the incoming element the live element's attributes, so the morph keeps attributes a script added.
 */
function adoptLiveAttributes(fromEl: Element, toEl: Element): void {
	for (const attr of Array.from(toEl.attributes)) {
		if (!fromEl.hasAttribute(attr.name)) toEl.removeAttribute(attr.name);
	}
	for (const attr of fromEl.attributes) {
		toEl.setAttribute(attr.name, attr.value);
	}
}

export type MorphBodyOptions = {
	/** Live-to-server element map that the morph reads on a reload and updates for the next one. */
	serverMarkup?: ServerMarkup;
	/**
	 * Set for a reload of the current URL: elements whose server markup did not change are kept as they are.
	 * Needs `serverMarkup`, which holds the previous markup.
	 */
	reload?: boolean;
};

/**
 * @returns Always `true`, to let morphdom update the element and visit its children.
 */
function updateElement(
	fromEl: Element,
	toEl: Element,
	previousServer: Element | undefined,
	incomingServer: Element | undefined,
	serverMarkup: ServerMarkup | undefined,
	reload: boolean,
): true {
	if (reload && previousServer && incomingServer && hasSameAttributes(previousServer, incomingServer)) {
		adoptLiveAttributes(fromEl, toEl);
	}
	if (serverMarkup && incomingServer) serverMarkup.set(fromEl, incomingServer);
	return true;
}

function isLightDomCustomElement(element: Element): boolean {
	return element.localName.includes('-') && element.shadowRoot === null;
}

type DeferredReplacement = { from: Element; to: Element; server: Element | undefined; isCustomElement: boolean };

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
	server: Element | undefined,
	deferred: DeferredReplacement[],
): false {
	deferred.push({
		from: fromEl,
		to: toEl.cloneNode(true) as Element,
		server,
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
function flushDeferredReplacements(deferred: DeferredReplacement[], serverMarkup: ServerMarkup | undefined): void {
	for (const { from, to, server, isCustomElement } of deferred) {
		if (!from.isConnected) continue;
		const newEl = isCustomElement ? materializeCustomElement(to) : (to.cloneNode(true) as Element);
		if (serverMarkup && server) recordServerSubtree(serverMarkup, newEl, server);
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
 *
 * On a reload of the current URL, an element whose server markup is the same in the previous and the incoming
 * document is kept with its state, its runtime attributes and its children, including custom elements and their
 * shadow roots. A changed element is handled as on navigation, except that a plain element whose own server
 * attributes did not change keeps its live attributes while its children are morphed. Rerun scripts do not
 * refresh elements on a reload: a replaced ancestor would drop the unchanged elements inside it, so a rerun
 * script must register handlers idempotently on every element a reload does not replace, which is all but changed custom elements.
 * Elements are paired in tree order, as morphdom pairs them, so inserting or removing an earlier sibling with
 * the same markup moves state to its neighbour.
 */
export function morphBody(
	newDocument: Document,
	persistAttribute: string,
	{ serverMarkup, reload = false }: MorphBodyOptions = {},
): void {
	const deferredReplacements: DeferredReplacement[] = [];
	const refreshUnpersistedElements = !reload && newDocument.querySelector('script[data-eco-rerun]') !== null;
	const retainedRerunContext: Set<Element> = refreshUnpersistedElements
		? findPersistedRerunContext(document.body, persistAttribute)
		: new Set<Element>();
	const incomingServerMarkup = new Map<Element, Element>();
	if (serverMarkup) {
		const serverBody = newDocument.body.cloneNode(true) as Element;
		incomingServerMarkup.set(newDocument.body, serverBody);
		const incoming = newDocument.body.querySelectorAll('*');
		const server = serverBody.querySelectorAll('*');
		for (let index = 0; index < incoming.length; index++) {
			incomingServerMarkup.set(incoming[index], server[index]);
		}
	}

	morphdom(document.body, newDocument.body, {
		getNodeKey: (node) => getBodyMorphKey(node, persistAttribute),
		onBeforeNodeAdded: (node) => {
			const added =
				node instanceof Element && isLightDomCustomElement(node) ? materializeCustomElement(node) : node;
			const server = node instanceof Element ? incomingServerMarkup.get(node) : undefined;
			if (serverMarkup && server && added instanceof Element) recordServerSubtree(serverMarkup, added, server);
			return added;
		},
		onBeforeElUpdated: (fromEl, toEl) => {
			if (isPersisted(fromEl, persistAttribute)) {
				return false;
			}
			const incomingServer = incomingServerMarkup.get(toEl);
			const previousServer = serverMarkup?.get(fromEl);
			if (reload && isUnchangedServerMarkup(previousServer, incomingServer)) {
				return false;
			}
			if (refreshUnpersistedElements) {
				if (fromEl === document.body || retainedRerunContext.has(fromEl)) {
					return updateElement(fromEl, toEl, previousServer, incomingServer, serverMarkup, reload);
				}
				return deferElementReplacement(fromEl, toEl, incomingServer, deferredReplacements);
			}
			if (isHydratedCustomElement(fromEl) || isLightDomCustomElement(fromEl)) {
				return deferElementReplacement(fromEl, toEl, incomingServer, deferredReplacements);
			}

			if (fromEl.isEqualNode(toEl)) {
				if (serverMarkup && incomingServer) recordServerSubtree(serverMarkup, fromEl, incomingServer);
				return false;
			}

			return updateElement(fromEl, toEl, previousServer, incomingServer, serverMarkup, reload);
		},
	});

	flushDeferredReplacements(deferredReplacements, serverMarkup);
	processDeclarativeShadowDOM(document.body);
}
