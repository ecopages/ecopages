/**
 * DOM morphing service for client-side navigation.
 * Uses Idiomorph for body morphing and Turbo-style surgical updates for head.
 * @module dom-swapper
 */

import morphdom from 'morphdom';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

type PendingRerunScript = {
	parent: 'head' | 'body';
	attributes: Array<[string, string]>;
	textContent: string;
	src: string | null;
	scriptId: string | null;
};

const RERUN_SRC_ATTR = 'data-eco-rerun-src';

/**
 * Checks if element has a persist attribute (custom or default).
 */
function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
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
 * Uses a hybrid approach inspired by Turbo:
 * - Surgical head updates (no morphing) to prevent FOUC
 * - Idiomorph for efficient body diffing
 */
export class DomSwapper {
	private persistAttribute: string;
	private pendingRerunScripts: PendingRerunScript[] = [];
	private rerunNonce = 0;

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
	 * load before resolving. This follows Turbo's approach of waiting for stylesheets
	 * before any DOM updates.
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
	 * Updates document head using Turbo-style surgical updates.
	 *
	 * This approach avoids morphing the head element entirely, which prevents
	 * browser repaints that cause FOUC. Instead, it:
	 * - Updates the document title
	 * - Merges meta tags (adds new, updates changed)
	 * - Leaves stylesheets untouched (they're preloaded separately)
	 * - Handles script re-execution for marked scripts
	 * - Injects new scripts from the incoming page that are absent from the current head
	 */
	morphHead(newDocument: Document): void {
		this.pendingRerunScripts = this.collectRerunScripts(newDocument);

		/** Update the document title if it has changed. */
		const newTitle = newDocument.head.querySelector('title');
		if (newTitle && document.title !== newTitle.textContent) {
			document.title = newTitle.textContent || '';
		}

		/** Merge meta tags: update existing ones whose content changed, append new ones. */
		const newMetas = newDocument.head.querySelectorAll('meta[name], meta[property]');
		for (const newMeta of newMetas) {
			const name = newMeta.getAttribute('name');
			const property = newMeta.getAttribute('property');
			const content = newMeta.getAttribute('content');

			const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
			const existingMeta = document.head.querySelector(selector);

			if (existingMeta) {
				if (existingMeta.getAttribute('content') !== content) {
					existingMeta.setAttribute('content', content || '');
				}
			} else {
				document.head.appendChild(newMeta.cloneNode(true));
			}
		}

		/**
		 * Inject new scripts from the incoming page that are not already loaded.
		 *
		 * When the client-side router swaps pages, the new page may require scripts
		 * (e.g. custom-element definitions) that were not present on the previous page.
		 * Because the browser only executes a <script> element when it is first parsed
		 * or dynamically appended to the DOM, a fresh element must be created for each
		 * new script — cloneNode() alone is not sufficient to trigger execution.
		 *
		 * - External scripts are matched by their `src` attribute.
		 * - Inline scripts are matched by trimmed text content to avoid re-running duplicates.
		 */
		const existingScriptSrcs = new Set(
			Array.from(document.head.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
		);
		const existingInlineContents = new Set(
			Array.from(document.head.querySelectorAll('script:not([src])')).map((s) => (s.textContent ?? '').trim()),
		);

		const allNewHeadScripts = newDocument.head.querySelectorAll('script');
		for (const script of allNewHeadScripts) {
			/** Skip scripts already handled by the `data-eco-rerun` mechanism above. */
			if (script.hasAttribute('data-eco-rerun')) continue;

			const src = script.getAttribute('src');

			if (src) {
				if (existingScriptSrcs.has(src)) continue;
				/** New external script — append a freshly created element so the browser fetches and executes it. */
				const newScript = document.createElement('script');
				for (const attr of script.attributes) {
					newScript.setAttribute(attr.name, attr.value);
				}
				document.head.appendChild(newScript);
				existingScriptSrcs.add(src);
			} else {
				/** Inline script — skip if identical content is already present to avoid re-running on every navigation. */
				const content = (script.textContent ?? '').trim();
				if (!content || existingInlineContents.has(content)) continue;
				const newScript = document.createElement('script');
				for (const attr of script.attributes) {
					newScript.setAttribute(attr.name, attr.value);
				}
				newScript.textContent = script.textContent;
				document.head.appendChild(newScript);
				existingInlineContents.add(content);
			}
		}
	}

	/**
	 * Replays queued `data-eco-rerun` scripts after the body swap completes.
	 *
	 * Scripts are intentionally flushed after the new body is in place so DOM-
	 * dependent bootstraps bind against the incoming page rather than the page
	 * being replaced.
	 */
	flushRerunScripts(): void {
		for (const script of this.pendingRerunScripts) {
			const targetParent = script.parent === 'body' ? document.body : document.head;
			const replacement = document.createElement('script');
			const shouldBustModuleSrc = this.isExternalModuleRerunScript(script);

			for (const [name, value] of script.attributes) {
				if (name === 'data-eco-rerun') {
					continue;
				}

				if (name === 'src' && shouldBustModuleSrc) {
					replacement.setAttribute(RERUN_SRC_ATTR, value);
					replacement.setAttribute('src', this.createRerunScriptUrl(value));
					continue;
				}

				replacement.setAttribute(name, value);
			}

			replacement.textContent = script.textContent;

			const existingScript = this.findExistingRerunScript(targetParent, script);

			if (existingScript) {
				existingScript.replaceWith(replacement);
				continue;
			}

			targetParent.appendChild(replacement);
		}

		this.pendingRerunScripts = [];
	}

	shouldReplaceBodyForRerunScripts(): boolean {
		return this.pendingRerunScripts.some((script) => this.isExternalModuleRerunScript(script));
	}

	/**
	 * Detects custom elements without shadow DOM (light-DOM custom elements).
	 * These need full replacement rather than morphing, because morphdom would
	 * strip JS-generated content from their light DOM children.
	 */
	private isLightDomCustomElement(element: Element): boolean {
		return element.localName.includes('-') && element.shadowRoot === null;
	}

	private replaceCustomElement(fromEl: Element, toEl: Element): false {
		const newEl = document.createElement(toEl.tagName);
		for (const attr of toEl.attributes) {
			newEl.setAttribute(attr.name, attr.value);
		}
		newEl.innerHTML = toEl.innerHTML;
		fromEl.replaceWith(newEl);
		return false;
	}

	/**
	 * Morphs document body using morphdom.
	 * Preserves persisted elements and hydrated custom elements.
	 * Light-DOM custom elements are fully replaced to trigger proper
	 * disconnectedCallback → connectedCallback lifecycle.
	 */
	morphBody(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		morphdom(document.body, newDocument.body, {
			onBeforeElUpdated: (fromEl, toEl) => {
				if (isPersisted(fromEl, persistAttr)) {
					return false;
				}
				if (isHydratedCustomElement(fromEl)) {
					return this.replaceCustomElement(fromEl, toEl);
				}

				/**
				 * Light-DOM custom elements (e.g. <radiant-code-tabs>) often
				 * generate DOM in connectedCallback that doesn't exist in the
				 * server-rendered HTML. Morphdom would diff those children away.
				 * Instead, replace the element entirely so the browser fires
				 * disconnectedCallback on the old instance and connectedCallback
				 * on the fresh one.
				 */
				if (this.isLightDomCustomElement(fromEl)) {
					return this.replaceCustomElement(fromEl, toEl);
				}

				if (fromEl.isEqualNode(toEl)) {
					return false;
				}

				return true;
			},
		});

		this.processDeclarativeShadowDOM(document.body);
	}

	/**
	 * Replaces body content in a single operation.
	 * Preserves persisted elements by moving them to the new body.
	 * Use when View Transitions are disabled.
	 */
	replaceBody(newDocument: Document): void {
		const persistAttr = this.persistAttribute;

		const persistedElements = document.body.querySelectorAll(`[${persistAttr}], [${DEFAULT_PERSIST_ATTR}]`);
		const persistedMap = new Map<string, Element>();

		for (const el of persistedElements) {
			const key = el.getAttribute(persistAttr) || el.getAttribute(DEFAULT_PERSIST_ATTR);
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

	private collectRerunScripts(newDocument: Document): PendingRerunScript[] {
		return Array.from(newDocument.querySelectorAll<HTMLScriptElement>('script[data-eco-rerun]')).map((script) => ({
			parent: script.closest('body') ? 'body' : 'head',
			attributes: Array.from(script.attributes).map((attr) => [attr.name, attr.value]),
			textContent: script.textContent ?? '',
			src: script.getAttribute('src'),
			scriptId: script.getAttribute('data-eco-script-id'),
		}));
	}

	private findExistingRerunScript(
		root: HTMLElement,
		script: PendingRerunScript,
	): HTMLScriptElement | null {
		const scripts = Array.from(root.querySelectorAll<HTMLScriptElement>('script'));

		if (script.scriptId) {
			return scripts.find((candidate) => candidate.getAttribute('data-eco-script-id') === script.scriptId) ?? null;
		}

		return (
			scripts.find(
				(candidate) =>
					(candidate.getAttribute(RERUN_SRC_ATTR) ?? candidate.getAttribute('src')) === script.src &&
					(candidate.textContent ?? '') === script.textContent,
			) ?? null
		);
	}

	private isExternalModuleRerunScript(script: PendingRerunScript): boolean {
		if (!script.src) {
			return false;
		}

		return script.attributes.some(([name, value]) => name === 'type' && value === 'module');
	}

	private createRerunScriptUrl(src: string): string {
		const url = new URL(src, document.baseURI);
		url.searchParams.set('__eco_rerun', String(++this.rerunNonce));
		return url.toString();
	}

	/**
	 * Manually attaches declarative shadow DOM templates.
	 * Browsers only process `<template shadowrootmode>` during initial parse.
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
