import {
	collectRerunScripts,
	flushPendingRerunScripts,
	shouldPersistExecutableInlineHeadScript,
} from '@ecopages/core/client/navigation-scripts';
import type { PendingRerunScript } from '@ecopages/core/client/navigation-scripts';
import type { ScriptActivation } from './script-activation.ts';
import { syncIncomingHeadMetadata } from './head-updater-incoming.ts';
import { collectPendingHeadScriptsFromIncoming, createHeadScriptDedupState } from './head-updater-scripts.ts';
import { findExistingHeadScript, getHeadScriptKey } from './head-updater-script-identity.ts';
import type { MorphHeadResult, PendingHeadScript } from './head-updater-types.ts';

export { getHeadScriptKey } from './head-updater-script-identity.ts';
export type { MorphHeadResult, PendingHeadScript } from './head-updater-types.ts';

const DEFAULT_PERSIST_ATTR = 'data-eco-persist';

function isPersisted(element: Element, persistAttribute: string): boolean {
	return element.hasAttribute(persistAttribute) || element.hasAttribute(DEFAULT_PERSIST_ATTR);
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
	const pendingRerunScripts = collectRerunScripts(newDocument);
	removeStaleHeadScripts(newDocument, persistAttribute);
	syncIncomingHeadMetadata(newDocument);

	const pendingHeadScripts = collectPendingHeadScriptsFromIncoming(newDocument, createHeadScriptDedupState());

	return {
		bodyStrategy: pendingRerunScripts.length > 0 ? 'replace' : 'morph',
		pendingHeadScripts,
		pendingRerunScripts,
	};
}

/**
 * Returns activations that insert queued head scripts, replacing a stale copy when asked.
 */
export function toHeadScriptActivations(pendingHeadScripts: readonly PendingHeadScript[]): ScriptActivation[] {
	return pendingHeadScripts.map((script) => ({
		attributes: script.attributes,
		textContent: script.textContent,
		insert: (replacement) => {
			const existingScript = findExistingHeadScript(script);
			if (script.replaceExisting && existingScript) {
				existingScript.replaceWith(replacement);
				return;
			}
			document.head.appendChild(replacement);
		},
	}));
}

/**
 * Replays queued `data-eco-rerun` scripts after the body swap completes.
 */
export function flushRerunScripts(pendingRerunScripts: PendingRerunScript[]): void {
	flushPendingRerunScripts(pendingRerunScripts);
}
