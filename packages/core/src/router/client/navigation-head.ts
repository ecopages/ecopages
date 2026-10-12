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
	bodyStrategy: 'morph' | 'replace';
	scriptActivations: ScriptActivation[];
	rerunScriptActivations: ScriptActivation[];
	commit(): void;
	cancel(): void;
};

type StagedStylesheet = {
	link: HTMLLinkElement;
	loaded: Promise<void>;
	users: number;
	committed: boolean;
};

const stagedStylesheetLoads = new Map<string, StagedStylesheet>();

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
			current.setAttribute('href', (incoming as HTMLLinkElement).href);
		} else {
			current.setAttribute(attribute.name, attribute.value);
		}
	}
}

function isPersisted(element: Element, persistAttribute: string): boolean {
	return (
		element.hasAttribute(persistAttribute) ||
		element.hasAttribute(ECO_PERSIST_ATTRIBUTE) ||
		element.matches('meta[charset]') ||
		shouldPersistExecutableInlineHeadScript(element)
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

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
	return new Promise((resolve) => {
		let timeout: ReturnType<typeof setTimeout>;
		const done = () => {
			clearTimeout(timeout);
			link.removeEventListener('load', done);
			link.removeEventListener('error', done);
			resolve();
		};
		timeout = setTimeout(done, 5000);
		link.addEventListener('load', done, { once: true });
		link.addEventListener('error', done, { once: true });
	});
}

async function preloadIncomingStylesheets(
	incomingElements: Map<string, Element>,
	currentElements: Map<string, Element>,
	stagedStylesheets: Map<string, StagedStylesheet>,
): Promise<void> {
	const loadPromises: Promise<void>[] = [];
	for (const [key, element] of incomingElements) {
		if (!key.startsWith('link:stylesheet:')) continue;
		const existingStage = stagedStylesheetLoads.get(key);
		if (existingStage && currentElements.get(key) === existingStage.link) {
			existingStage.users += 1;
			stagedStylesheets.set(key, existingStage);
			loadPromises.push(existingStage.loaded);
			continue;
		}
		if (currentElements.has(key)) continue;
		const link = cloneHeadElement(element) as HTMLLinkElement;
		const stage = { link, loaded: waitForStylesheet(link), users: 1, committed: false };
		stagedStylesheetLoads.set(key, stage);
		stagedStylesheets.set(key, stage);
		loadPromises.push(stage.loaded);
		document.head.appendChild(link);
	}
	await Promise.all(loadPromises);
}

/**
 * Stages incoming stylesheets and prepares one diff for either router to commit.
 */
export async function prepareNavigationHead(
	newDocument: Document,
	persistAttribute: string = ECO_PERSIST_ATTRIBUTE,
	shouldSkipScriptActivation: (script: HTMLScriptElement) => boolean = () => false,
): Promise<NavigationHeadUpdate> {
	const incomingElements = indexHeadChildren(newDocument.head);
	const currentElements = indexHeadChildren(document.head);
	const pendingRerunScripts = collectRerunScripts(newDocument, (script) => !shouldSkipScriptActivation(script));
	const scriptActivations = createHeadScriptActivations(newDocument, currentElements, shouldSkipScriptActivation);
	const rerunScriptActivations = pendingRerunScripts.map(toRerunScriptActivation);
	const stagedStylesheets = new Map<string, StagedStylesheet>();
	await preloadIncomingStylesheets(incomingElements, currentElements, stagedStylesheets);
	let committed = false;
	let cancelled = false;

	return {
		bodyStrategy: pendingRerunScripts.length > 0 ? 'replace' : 'morph',
		scriptActivations,
		rerunScriptActivations,
		commit() {
			if (committed || cancelled) return;
			committed = true;
			const current = indexHeadChildren(document.head);
			for (const [key, incoming] of incomingElements) {
				if (incoming.tagName === 'SCRIPT' && !isNonExecutableHeadScript(incoming)) continue;
				const existing = current.get(key);
				const staged = stagedStylesheets.get(key);
				if (existing) {
					if (staged && staged.link !== existing) staged.link.remove();
					syncHeadElement(existing, incoming);
				} else if (!staged) {
					document.head.appendChild(cloneHeadElement(incoming));
				}
			}

			for (const [key, element] of current) {
				if (incomingElements.has(key) || isPersisted(element, persistAttribute)) continue;
				element.remove();
			}
			for (const [key, stage] of stagedStylesheets) {
				stage.committed = true;
				if (stagedStylesheetLoads.get(key) === stage) stagedStylesheetLoads.delete(key);
			}
		},
		cancel() {
			if (committed || cancelled) return;
			cancelled = true;
			for (const [key, stage] of stagedStylesheets) {
				stage.users -= 1;
				if (stage.users === 0 && !stage.committed) {
					stage.link.remove();
					if (stagedStylesheetLoads.get(key) === stage) stagedStylesheetLoads.delete(key);
				}
			}
		},
	};
}

/** Starts the shared head and body script queue after an adapter has swapped its page. */
export function activatePreparedNavigationScripts(
	update: NavigationHeadUpdate,
	persistAttribute: string = ECO_PERSIST_ATTRIBUTE,
	isStale: () => boolean = () => false,
	includeBodyScripts = true,
): void {
	startNavigationScriptQueue([...update.scriptActivations, ...update.rerunScriptActivations], {
		persistAttribute,
		isStale,
		includeBodyScripts,
	});
}
