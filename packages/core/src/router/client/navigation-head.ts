import {
	activateNavigationScripts as startNavigationScriptQueue,
	type ScriptActivation,
} from '../../client/navigation-scripts/activation.ts';
import {
	collectRerunScripts,
	isNonExecutableHeadScript,
	isRerunScript,
	shouldPersistExecutableInlineHeadScript,
	toRerunScriptActivation,
} from '../../client/navigation-scripts/index.ts';
import { getNavigationScriptIdentity } from '../../client/navigation-scripts/identity.ts';
import { ECO_PERSIST_ATTRIBUTE } from '../../client/navigation-attributes.ts';

export type NavigationHeadUpdate = {
	scriptActivations: ScriptActivation[];
	rerunScriptActivations: ScriptActivation[];
	requiresReload: boolean;
	commit(): void;
	cancel(): void;
};

type StagedStylesheet = {
	link: HTMLLinkElement;
	loaded: Promise<boolean>;
	users: number;
	committed: boolean;
	registryKey: string;
	loadedSuccessfully: boolean | null;
	latestGeneration: number;
};

const stagedStylesheetLoads = new Map<string, StagedStylesheet>();
const pendingStylesheetLinks = new Map<HTMLLinkElement, StagedStylesheet>();
let latestHeadUpdateGeneration = 0;

function resolveMetaElementKey(element: Element): string | null {
	const identity =
		element.getAttribute('name') ||
		element.getAttribute('property') ||
		element.getAttribute('http-equiv') ||
		(element.hasAttribute('charset') ? 'charset' : null);
	return identity ? `meta:${identity.toLowerCase()}` : null;
}

function resolveLinkElementKey(element: Element): string | null {
	const rel = element.getAttribute('rel')?.toLowerCase() ?? '';
	const href = (element as HTMLLinkElement).href;
	if (!href) return null;
	if (rel === 'icon' || rel === 'shortcut icon') return 'link:icon';
	if (rel === 'canonical') return 'link:canonical';
	return `link:${rel}:${href}`;
}

function resolveScriptElementKey(element: Element): string | null {
	const identity = getNavigationScriptIdentity(element).key;
	return identity ? `script:${identity}` : null;
}

function resolveStyleElementKey(element: Element): string {
	const id = element.getAttribute('data-eco-style') || element.id;
	return id ? `style:${id}` : `style:${element.textContent ?? ''}`;
}

const headElementKeyResolvers: Record<string, (element: Element) => string | null> = {
	base: () => 'base',
	title: () => 'title',
	meta: resolveMetaElementKey,
	link: resolveLinkElementKey,
	script: resolveScriptElementKey,
	style: resolveStyleElementKey,
};

function resolveHeadElementKey(element: Element): string | null {
	const tag = element.tagName.toLowerCase();
	const resolveKnownElement = headElementKeyResolvers[tag];
	return resolveKnownElement ? resolveKnownElement(element) : `${tag}:${element.id || element.outerHTML}`;
}

function indexHeadChildren(head: HTMLHeadElement): Map<string, Element> {
	const elements = new Map<string, Element>();
	for (const element of Array.from(head.children)) {
		if (element.hasAttribute('data-eco-injected')) continue;
		if (element instanceof HTMLLinkElement && pendingStylesheetLinks.has(element)) continue;
		const key = resolveHeadElementKey(element);
		if (key) elements.set(key, element);
	}
	return elements;
}

function cloneHeadElement(element: Element): Element {
	const clone = element.cloneNode(true) as Element;
	if (element.tagName === 'LINK' && element.hasAttribute('href')) {
		clone.setAttribute('href', (element as HTMLLinkElement).href);
	}
	if (element.tagName === 'BASE' && element.hasAttribute('href')) {
		clone.setAttribute('href', (element as HTMLBaseElement).href);
	}
	return clone;
}

function syncHeadElement(current: Element, incoming: Element): void {
	if (current.tagName === 'SCRIPT') {
		if (isNonExecutableHeadScript(incoming)) {
			current.textContent = incoming.textContent;
			syncAttributes(current, incoming);
		}
		return;
	}
	if (current.tagName === 'TITLE' || current.tagName === 'STYLE') {
		current.textContent = incoming.textContent;
	}
	syncAttributes(current, incoming);
}

function syncAttributes(current: Element, incoming: Element): void {
	const incomingNames = new Set(Array.from(incoming.attributes, (attribute) => attribute.name));
	for (const attribute of Array.from(current.attributes)) {
		if (!incomingNames.has(attribute.name)) current.removeAttribute(attribute.name);
	}
	for (const attribute of Array.from(incoming.attributes)) {
		if ((incoming.tagName === 'LINK' || incoming.tagName === 'BASE') && attribute.name === 'href') {
			const href = (incoming as HTMLLinkElement).href;
			if ((current as HTMLLinkElement).href !== href) current.setAttribute('href', href);
		} else {
			current.setAttribute(attribute.name, attribute.value);
		}
	}
}

function isCascadeOrderedElement(key: string, element: Element): boolean {
	return element.tagName === 'STYLE' || key.startsWith('link:stylesheet:');
}

function insertIncomingHeadElement(
	element: Element,
	key: string,
	incomingElements: Map<string, Element>,
	currentElements: Map<string, Element>,
): void {
	let anchor: Element | null = null;
	if (isCascadeOrderedElement(key, element)) {
		let found = false;
		for (const [nextKey, nextIncoming] of incomingElements) {
			if (nextKey === key) {
				found = true;
				continue;
			}
			if (!found || !isCascadeOrderedElement(nextKey, nextIncoming)) continue;
			anchor = currentElements.get(nextKey) ?? null;
			if (anchor) break;
		}
	}
	if (anchor) {
		document.head.insertBefore(element, anchor);
	} else {
		document.head.appendChild(element);
	}
}

function isInIncomingCascadePosition(
	key: string,
	element: Element,
	incomingElements: Map<string, Element>,
	currentElements: Map<string, Element>,
): boolean {
	let before = true;
	for (const [otherKey, incoming] of incomingElements) {
		if (otherKey === key) {
			before = false;
			continue;
		}
		if (!isCascadeOrderedElement(otherKey, incoming)) continue;
		const other = currentElements.get(otherKey);
		if (!other || other === element) continue;
		const otherFollows = Boolean(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
		if (otherFollows === before) return false;
	}
	return true;
}

function cascadeOrderChanged(incoming: Map<string, Element>, current: Map<string, Element>): boolean {
	const retained = new Map(
		[...current].filter(
			([, element]) => !(element instanceof HTMLLinkElement && pendingStylesheetLinks.has(element)),
		),
	);
	const incomingKeys = [...incoming]
		.filter(([key, element]) => isCascadeOrderedElement(key, element) && retained.has(key))
		.map(([key]) => key);
	const currentKeys = [...retained]
		.filter(([key, element]) => isCascadeOrderedElement(key, element) && incoming.has(key))
		.map(([key]) => key);
	return incomingKeys.some((key, index) => currentKeys[index] !== key);
}

function isPersisted(element: Element, persistAttribute: string): boolean {
	return (
		element.hasAttribute(persistAttribute) ||
		element.hasAttribute(ECO_PERSIST_ATTRIBUTE) ||
		element.matches('meta[charset]') ||
		shouldPersistExecutableInlineHeadScript(element)
	);
}

function hasPersistedCascadeReorder(
	incoming: Map<string, Element>,
	current: Map<string, Element>,
	persistAttribute: string,
): boolean {
	return (
		cascadeOrderChanged(incoming, current) &&
		[...current].some(
			([key, element]) =>
				incoming.has(key) && isCascadeOrderedElement(key, element) && isPersisted(element, persistAttribute),
		)
	);
}

function stylesheetOrderChanged(
	incoming: Map<string, Element>,
	active: Map<string, Element>,
	staged: Map<string, StagedStylesheet>,
): boolean {
	let previous: Element | undefined;
	for (const key of incoming.keys()) {
		if (!key.startsWith('link:stylesheet:')) continue;
		const stage = staged.get(key);
		const current = stage && !stage.committed ? stage.link : active.get(key);
		if (!current) return true;
		if (previous && !(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
		previous = current;
	}
	return false;
}

function hasPersistedStylesheetForStage(key: string, stage: StagedStylesheet, persistAttribute: string): boolean {
	return Array.from(document.head.children).some(
		(element) =>
			element !== stage.link &&
			!(element instanceof HTMLLinkElement && pendingStylesheetLinks.has(element)) &&
			resolveHeadElementKey(element) === key &&
			isPersisted(element, persistAttribute),
	);
}

function createHeadScriptActivations(
	newDocument: Document,
	currentElements: Map<string, Element>,
	shouldSkip: (script: HTMLScriptElement) => boolean,
): ScriptActivation[] {
	const knownScriptKeys = new Set([...currentElements.keys()].filter((key) => key.startsWith('script:')));
	const activations: ScriptActivation[] = [];

	for (const element of newDocument.head.querySelectorAll('script')) {
		if (isRerunScript(element) || isNonExecutableHeadScript(element)) continue;
		const script = element as HTMLScriptElement;
		if (shouldSkip(script)) continue;
		const identity = getNavigationScriptIdentity(script);
		if (!identity.key || knownScriptKeys.has(`script:${identity.key}`)) continue;
		knownScriptKeys.add(`script:${identity.key}`);
		const attributes = Array.from(script.attributes, (attribute): [string, string] =>
			attribute.name === 'src' && identity.src
				? [attribute.name, identity.src]
				: [attribute.name, attribute.value],
		);
		activations.push({
			attributes,
			textContent: script.textContent ?? '',
			insert: (replacement) => {
				const existing = Array.from(document.head.querySelectorAll<HTMLScriptElement>('script')).find(
					(candidate) => getNavigationScriptIdentity(candidate).key === identity.key,
				);
				if (!existing) document.head.appendChild(replacement);
			},
		});
	}

	return activations;
}

function waitForStylesheet(link: HTMLLinkElement): Promise<boolean> {
	return new Promise((resolve) => {
		let timeout: ReturnType<typeof setTimeout>;
		const observer = new MutationObserver(() => {
			if (!link.isConnected) done(false);
		});
		const done = (loaded: boolean) => {
			clearTimeout(timeout);
			observer.disconnect();
			link.removeEventListener('load', onLoad);
			link.removeEventListener('error', onError);
			resolve(loaded);
		};
		const onLoad = () => done(true);
		const onError = () => done(false);
		timeout = setTimeout(() => done(false), 5000);
		observer.observe(document.head, { childList: true, subtree: true });
		link.addEventListener('load', onLoad, { once: true });
		link.addEventListener('error', onError, { once: true });
	});
}

async function replacementStylesheetsLoaded(
	currentElements: Map<string, Element>,
	stagedStylesheets: Map<string, StagedStylesheet>,
): Promise<boolean> {
	for (const [key, stage] of stagedStylesheets) {
		if (currentElements.has(key) && !(await stage.loaded)) return false;
	}
	return true;
}

async function preloadIncomingStylesheets(
	incomingElements: Map<string, Element>,
	currentElements: Map<string, Element>,
	stagedStylesheets: Map<string, StagedStylesheet>,
	generation: number,
): Promise<boolean> {
	const loadPromises: Promise<boolean>[] = [];
	const reorder = cascadeOrderChanged(incomingElements, currentElements);
	const placementElements = new Map(currentElements);
	if (reorder) {
		for (const [key] of incomingElements) {
			if (key.startsWith('link:stylesheet:')) placementElements.delete(key);
		}
	}
	const entries = [...incomingElements];
	const signature = JSON.stringify(
		entries.filter(([key, element]) => isCascadeOrderedElement(key, element)).map(([key]) => key),
	);
	if (reorder) entries.reverse();
	for (const [key, element] of entries) {
		if (!key.startsWith('link:stylesheet:')) continue;
		const registryKey = JSON.stringify([signature, key]);
		const existingStage = stagedStylesheetLoads.get(registryKey);
		if (
			existingStage &&
			existingStage.link.isConnected &&
			isInIncomingCascadePosition(key, existingStage.link, incomingElements, currentElements)
		) {
			existingStage.users += 1;
			existingStage.latestGeneration = generation;
			stagedStylesheets.set(key, existingStage);
			loadPromises.push(existingStage.loaded);
			placementElements.set(key, existingStage.link);
			continue;
		}
		if (currentElements.has(key) && !existingStage && !reorder) continue;
		const link = cloneHeadElement(element) as HTMLLinkElement;
		link.media = 'not all';
		const stage: StagedStylesheet = {
			link,
			loaded: waitForStylesheet(link),
			users: 1,
			committed: false,
			registryKey,
			loadedSuccessfully: null,
			latestGeneration: generation,
		};
		void stage.loaded.then((loaded) => {
			stage.loadedSuccessfully = loaded;
		});
		pendingStylesheetLinks.set(link, stage);
		stagedStylesheetLoads.set(registryKey, stage);
		stagedStylesheets.set(key, stage);
		loadPromises.push(stage.loaded);
		insertIncomingHeadElement(link, key, incomingElements, placementElements);
		placementElements.set(key, link);
	}
	await Promise.all(loadPromises);
	return await replacementStylesheetsLoaded(currentElements, stagedStylesheets);
}

function activateStagedStylesheet(key: string, stage: StagedStylesheet, incoming: Element): void {
	for (const candidate of Array.from(document.head.children)) {
		if (candidate === stage.link || resolveHeadElementKey(candidate) !== key) continue;
		if (candidate instanceof HTMLLinkElement && pendingStylesheetLinks.has(candidate)) continue;
		candidate.remove();
	}
	syncHeadElement(stage.link, incoming);
}

function reconcileIncomingHead(
	incomingElements: Map<string, Element>,
	stagedStylesheets: Map<string, StagedStylesheet>,
): Map<string, Element> {
	const current = indexHeadChildren(document.head);
	for (const [key, incoming] of incomingElements) {
		if (incoming.tagName === 'SCRIPT' && !isNonExecutableHeadScript(incoming)) continue;
		const existing = current.get(key);
		const staged = stagedStylesheets.get(key);
		if (staged && !staged.committed) {
			activateStagedStylesheet(key, staged, incoming);
			current.set(key, staged.link);
		} else if (existing) {
			syncHeadElement(existing, incoming);
		} else if (!staged) {
			const clone = cloneHeadElement(incoming);
			insertIncomingHeadElement(clone, key, incomingElements, current);
			current.set(key, clone);
		}
	}
	for (const [key, incoming] of [...incomingElements].reverse()) {
		if (incoming.tagName !== 'STYLE') continue;
		const style = current.get(key);
		if (style && !isInIncomingCascadePosition(key, style, incomingElements, current)) {
			insertIncomingHeadElement(style, key, incomingElements, current);
		}
	}
	return current;
}

/**
 * Stages incoming stylesheets without applying them and prepares one diff for either router to commit.
 */
export async function prepareNavigationHead(
	newDocument: Document,
	persistAttribute: string = ECO_PERSIST_ATTRIBUTE,
	shouldSkipScriptActivation: (script: HTMLScriptElement) => boolean = () => false,
): Promise<NavigationHeadUpdate> {
	const generation = ++latestHeadUpdateGeneration;
	const incomingElements = indexHeadChildren(newDocument.head);
	const currentElements = indexHeadChildren(document.head);
	const pendingRerunScripts = collectRerunScripts(newDocument, (script) => !shouldSkipScriptActivation(script));
	const scriptActivations = createHeadScriptActivations(newDocument, currentElements, shouldSkipScriptActivation);
	const rerunScriptActivations = pendingRerunScripts.map(toRerunScriptActivation);
	const stagedStylesheets = new Map<string, StagedStylesheet>();
	const hasPersistedReorder = hasPersistedCascadeReorder(incomingElements, currentElements, persistAttribute);
	const requiresReload =
		hasPersistedReorder ||
		!(await preloadIncomingStylesheets(incomingElements, currentElements, stagedStylesheets, generation));
	let committed = false;
	let cancelled = false;
	const reloadRequired = () => {
		if (requiresReload) return true;
		const active = indexHeadChildren(document.head);
		if (hasPersistedCascadeReorder(incomingElements, active, persistAttribute)) return true;
		if (stylesheetOrderChanged(incomingElements, active, stagedStylesheets)) return true;
		for (const [key, stage] of stagedStylesheets) {
			if (!stage.link.isConnected || (active.has(key) && stage.loadedSuccessfully === false)) return true;
			if (hasPersistedStylesheetForStage(key, stage, persistAttribute)) return true;
		}
		return false;
	};

	return {
		scriptActivations,
		rerunScriptActivations,
		get requiresReload() {
			return reloadRequired();
		},
		commit() {
			if (committed || cancelled) return;
			if (reloadRequired()) throw new Error('Navigation head update requires a full document navigation');
			committed = true;
			const current = reconcileIncomingHead(incomingElements, stagedStylesheets);
			for (const [link, stage] of pendingStylesheetLinks) {
				const key = resolveHeadElementKey(link);
				if (stage.latestGeneration < generation && key && !incomingElements.has(key)) link.remove();
			}

			for (const [key, element] of current) {
				if (incomingElements.has(key) || isPersisted(element, persistAttribute)) continue;
				element.remove();
			}
			for (const stage of stagedStylesheets.values()) {
				stage.committed = true;
				pendingStylesheetLinks.delete(stage.link);
				if (stagedStylesheetLoads.get(stage.registryKey) === stage)
					stagedStylesheetLoads.delete(stage.registryKey);
			}
		},
		cancel() {
			if (committed || cancelled) return;
			cancelled = true;
			for (const stage of stagedStylesheets.values()) {
				stage.users -= 1;
				if (stage.users === 0 && !stage.committed) {
					stage.link.remove();
					pendingStylesheetLinks.delete(stage.link);
					if (stagedStylesheetLoads.get(stage.registryKey) === stage)
						stagedStylesheetLoads.delete(stage.registryKey);
				}
			}
		},
	};
}

/** Starts the shared head and body script queue after an adapter has swapped its page. */
export function activatePreparedNavigationScripts(
	update: NavigationHeadUpdate,
	persistAttribute: string = ECO_PERSIST_ATTRIBUTE,
	includeBodyScripts = true,
): void {
	startNavigationScriptQueue([...update.scriptActivations, ...update.rerunScriptActivations], {
		persistAttribute,
		includeBodyScripts,
	});
}
