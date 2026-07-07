import {
	RERUN_SRC_ATTR,
	collectRerunScripts,
	flushPendingRerunScripts,
	isNonExecutableHeadScript,
	shouldPersistExecutableInlineHeadScript,
	type PendingRerunScript,
} from '@ecopages/core/client/navigation-scripts';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

export type PendingHeadScript = {
	attributes: Array<[string, string]>;
	textContent: string;
	src: string | null;
	scriptId: string | null;
	replaceExisting: boolean;
};

export type MorphHeadResult = {
	bodyStrategy: 'morph' | 'replace';
	pendingHeadScripts: PendingHeadScript[];
	pendingRerunScripts: PendingRerunScript[];
};

function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
}

/**
 * Derives a stable identity key for a head script.
 *
 * @remarks
 * Priority: `data-eco-script-id` / `id` > `src` > trimmed inline content.
 * Returns `null` for empty anonymous inline scripts that cannot be tracked.
 */
export function getHeadScriptKey(
	script: HTMLScriptElement | Pick<PendingHeadScript | PendingRerunScript, 'scriptId' | 'src' | 'textContent'>,
): string | null {
	const scriptId =
		script instanceof HTMLScriptElement
			? script.getAttribute('data-eco-script-id') || script.getAttribute('id')
			: script.scriptId;
	if (scriptId) {
		return `id:${scriptId}`;
	}

	const src =
		script instanceof HTMLScriptElement
			? script.getAttribute(RERUN_SRC_ATTR) || script.getAttribute('src')
			: script.src;
	if (src) {
		return `src:${src}`;
	}

	const textContent = (script.textContent ?? '').trim();
	return textContent ? `inline:${textContent}` : null;
}

function findExistingHeadScript(
	script: HTMLScriptElement | Pick<PendingHeadScript | PendingRerunScript, 'scriptId' | 'src' | 'textContent'>,
): HTMLScriptElement | null {
	const scriptKey = getHeadScriptKey(script);
	if (!scriptKey) {
		return null;
	}

	return (
		Array.from(document.head.querySelectorAll<HTMLScriptElement>('script')).find(
			(candidate) => getHeadScriptKey(candidate) === scriptKey,
		) ?? null
	);
}

function areHeadScriptsEquivalent(nextScript: HTMLScriptElement, currentScript: HTMLScriptElement): boolean {
	if (getHeadScriptKey(nextScript) !== getHeadScriptKey(currentScript)) {
		return false;
	}

	if ((nextScript.textContent ?? '') !== (currentScript.textContent ?? '')) {
		return false;
	}

	const nextAttributes = Array.from(nextScript.attributes).map((attribute) => [attribute.name, attribute.value]);
	const currentAttributes = Array.from(currentScript.attributes).map((attribute) => [
		attribute.name,
		attribute.value,
	]);

	if (nextAttributes.length !== currentAttributes.length) {
		return false;
	}

	return nextAttributes.every(
		([name, value], index) => currentAttributes[index]?.[0] === name && currentAttributes[index]?.[1] === value,
	);
}

/**
 * Removes head scripts that are no longer present in the incoming document.
 *
 * @remarks
 * Persisted scripts and executable inline scripts with stable identifiers
 * are kept to avoid breaking long-lived runtime state.
 */
function removeStaleHeadScripts(newDocument: Document, persistAttribute: string): void {
	const nextScriptKeys = new Set(
		Array.from(newDocument.head.querySelectorAll<HTMLScriptElement>('script'))
			.map((script) => getHeadScriptKey(script))
			.filter((key): key is string => key !== null),
	);

	for (const script of Array.from(document.head.querySelectorAll<HTMLScriptElement>('script'))) {
		const key = getHeadScriptKey(script);
		if (!key || nextScriptKeys.has(key)) {
			continue;
		}

		if (isPersisted(script, persistAttribute)) {
			continue;
		}

		if (shouldPersistExecutableInlineHeadScript(script)) {
			continue;
		}

		script.remove();
	}
}

/**
 * Updates document head using Turbo-style surgical updates.
 *
 * @remarks
 * This approach avoids morphing the head element entirely, which prevents
 * browser repaints that cause FOUC. Instead, it:
 * - Updates the document title
 * - Merges meta tags (adds new, updates changed)
 * - Leaves stylesheets untouched (they're preloaded separately)
 * - Handles script re-execution for marked scripts
 * - Injects new scripts from the incoming page that are absent from the current head
 */
export function morphHead(newDocument: Document, persistAttribute: string): MorphHeadResult {
	const pendingHeadScripts: PendingHeadScript[] = [];
	const pendingRerunScripts = collectRerunScripts(newDocument);
	removeStaleHeadScripts(newDocument, persistAttribute);

	const newTitle = newDocument.head.querySelector('title');
	if (newTitle && document.title !== newTitle.textContent) {
		document.title = newTitle.textContent || '';
	}

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

	const existingScriptSrcs = new Set(
		Array.from(document.head.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
	);
	const existingInlineContents = new Set(
		Array.from(document.head.querySelectorAll('script:not([src])')).map((s) => (s.textContent ?? '').trim()),
	);

	const allNewHeadScripts = newDocument.head.querySelectorAll('script');
	for (const script of allNewHeadScripts) {
		if (script.hasAttribute('data-eco-rerun')) continue;

		const src = script.getAttribute('src');
		const scriptId = script.getAttribute('data-eco-script-id') || script.getAttribute('id');
		const existingScript = findExistingHeadScript(script);

		if (scriptId && existingScript) {
			if (!isNonExecutableHeadScript(script)) {
				continue;
			}

			if (areHeadScriptsEquivalent(script, existingScript)) {
				continue;
			}

			pendingHeadScripts.push({
				attributes: Array.from(script.attributes).map((attr) => [attr.name, attr.value]),
				textContent: script.textContent ?? '',
				src,
				scriptId,
				replaceExisting: true,
			});
			continue;
		}

		if (src) {
			if (existingScriptSrcs.has(src)) continue;
			pendingHeadScripts.push({
				attributes: Array.from(script.attributes).map((attr) => [attr.name, attr.value]),
				textContent: script.textContent ?? '',
				src,
				scriptId,
				replaceExisting: false,
			});
			existingScriptSrcs.add(src);
		} else {
			const content = (script.textContent ?? '').trim();
			if (!content || existingInlineContents.has(content)) continue;
			pendingHeadScripts.push({
				attributes: Array.from(script.attributes).map((attr) => [attr.name, attr.value]),
				textContent: script.textContent ?? '',
				src: null,
				scriptId,
				replaceExisting: false,
			});
			existingInlineContents.add(content);
		}
	}

	return {
		bodyStrategy: pendingRerunScripts.length > 0 ? 'replace' : 'morph',
		pendingHeadScripts,
		pendingRerunScripts,
	};
}

/**
 * Replays queued head scripts after the body swap completes.
 */
export function flushHeadScripts(pendingHeadScripts: PendingHeadScript[]): void {
	for (const script of pendingHeadScripts) {
		const replacement = document.createElement('script');

		for (const [name, value] of script.attributes) {
			replacement.setAttribute(name, value);
		}

		replacement.textContent = script.textContent;

		const existingScript = findExistingHeadScript(script);
		if (script.replaceExisting && existingScript) {
			existingScript.replaceWith(replacement);
			continue;
		}

		document.head.appendChild(replacement);
	}
}

/**
 * Replays queued `data-eco-rerun` scripts after the body swap completes.
 */
export function flushRerunScripts(pendingRerunScripts: PendingRerunScript[]): void {
	flushPendingRerunScripts(pendingRerunScripts);
}
