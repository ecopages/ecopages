/**
 * Queueing and replay of `data-eco-rerun` scripts after navigation.
 * @module
 */

import { RERUN_SRC_ATTR, getRegisteredRerunScript } from './registry.ts';

export type PendingRerunScript = {
	parent: 'head' | 'body';
	attributes: Array<[string, string]>;
	textContent: string;
	src: string | null;
	scriptId: string | null;
};

let rerunNonce = 0;

/**
 * Collects rerun scripts from an incoming document.
 */
export function collectRerunScripts(
	document: Document,
	filter?: (script: HTMLScriptElement) => boolean,
): PendingRerunScript[] {
	return Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-eco-rerun]'))
		.filter((script) => (filter ? filter(script) : true))
		.map((script) => ({
			parent: script.closest('body') ? 'body' : 'head',
			attributes: Array.from(script.attributes).map((attribute) => [attribute.name, attribute.value]),
			textContent: script.textContent ?? '',
			src: script.getAttribute('src'),
			scriptId: script.getAttribute('data-eco-script-id'),
		}));
}

/**
 * Returns whether a rerun script is an external ES module that needs cache busting.
 */
export function isExternalModuleRerunScript(script: PendingRerunScript): boolean {
	if (!script.src) {
		return false;
	}

	return script.attributes.some(([name, value]) => name === 'type' && value === 'module');
}

/**
 * Finds an existing rerun script in `root` by id or by src and inline content.
 */
export function findExistingRerunScript(root: ParentNode, script: PendingRerunScript): HTMLScriptElement | null {
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

/**
 * Appends a nonce query parameter so module scripts re-execute after navigation.
 */
export function createRerunScriptUrl(src: string): string {
	const url = new URL(src, document.baseURI);
	url.searchParams.set('__eco_rerun', String(++rerunNonce));
	return url.toString();
}

/**
 * Replays queued rerun scripts after the incoming page body is in place.
 *
 * @remarks
 * Flushed elements keep `data-eco-rerun` so head cleanup does not treat them
 * as persistable inline scripts on the next navigation.
 */
export function flushPendingRerunScripts(scripts: readonly PendingRerunScript[]): void {
	for (const script of scripts) {
		const targetParent = script.parent === 'body' ? document.body : document.head;
		const registeredRerun = getRegisteredRerunScript(script.scriptId);
		const replacement = document.createElement('script');
		const shouldBustModuleSrc = isExternalModuleRerunScript(script) && !registeredRerun;

		for (const [name, value] of script.attributes) {
			if (name === 'src' && shouldBustModuleSrc) {
				replacement.setAttribute(RERUN_SRC_ATTR, value);
				replacement.setAttribute('src', createRerunScriptUrl(value));
				continue;
			}

			replacement.setAttribute(name, value);
		}

		replacement.textContent = script.textContent;

		const existingScript = findExistingRerunScript(targetParent, script);

		if (registeredRerun) {
			const needsScriptElement = isExternalModuleRerunScript(script);
			if (!existingScript && needsScriptElement) {
				targetParent.appendChild(replacement);
			}

			registeredRerun();
			continue;
		}

		if (existingScript) {
			existingScript.replaceWith(replacement);
			continue;
		}

		targetParent.appendChild(replacement);
	}
}

/** @remarks Test-only reset for nonce sequencing. */
export function resetRerunNonceForTests(): void {
	rerunNonce = 0;
}
