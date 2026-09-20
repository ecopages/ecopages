import { isNonExecutableHeadScript } from '@ecopages/core/client/navigation-scripts';
import type { PendingHeadScript } from './head-updater-types.ts';
import { areHeadScriptsEquivalent, findExistingHeadScript } from './head-updater-script-identity.ts';

export type HeadScriptDedupState = {
	existingScriptSrcs: Set<string | null>;
	existingInlineContents: Set<string>;
};

export function createHeadScriptDedupState(): HeadScriptDedupState {
	return {
		existingScriptSrcs: new Set(
			Array.from(document.head.querySelectorAll('script[src]')).map((script) => script.getAttribute('src')),
		),
		existingInlineContents: new Set(
			Array.from(document.head.querySelectorAll('script:not([src])')).map((script) =>
				(script.textContent ?? '').trim(),
			),
		),
	};
}

function pushPendingHeadScript(
	pendingHeadScripts: PendingHeadScript[],
	script: HTMLScriptElement,
	options: {
		src: string | null;
		scriptId: string | null;
		replaceExisting: boolean;
	},
): void {
	pendingHeadScripts.push({
		attributes: Array.from(script.attributes).map((attribute) => [attribute.name, attribute.value]),
		textContent: script.textContent ?? '',
		src: options.src,
		scriptId: options.scriptId,
		replaceExisting: options.replaceExisting,
	});
}

function queueIdentifiedNonExecutableHeadScript(
	script: HTMLScriptElement,
	pendingHeadScripts: PendingHeadScript[],
	src: string | null,
	scriptId: string,
): boolean {
	const existingScript = findExistingHeadScript(script);
	if (!existingScript) {
		return false;
	}

	if (!isNonExecutableHeadScript(script)) {
		return true;
	}

	if (areHeadScriptsEquivalent(script, existingScript)) {
		return true;
	}

	pushPendingHeadScript(pendingHeadScripts, script, {
		src,
		scriptId,
		replaceExisting: true,
	});
	return true;
}

function queueExternalHeadScript(
	script: HTMLScriptElement,
	pendingHeadScripts: PendingHeadScript[],
	dedup: HeadScriptDedupState,
	src: string,
	scriptId: string | null,
): void {
	if (dedup.existingScriptSrcs.has(src)) {
		return;
	}

	pushPendingHeadScript(pendingHeadScripts, script, {
		src,
		scriptId,
		replaceExisting: false,
	});
	dedup.existingScriptSrcs.add(src);
}

function queueInlineHeadScript(
	script: HTMLScriptElement,
	pendingHeadScripts: PendingHeadScript[],
	dedup: HeadScriptDedupState,
	scriptId: string | null,
): void {
	const content = (script.textContent ?? '').trim();
	if (!content || dedup.existingInlineContents.has(content)) {
		return;
	}

	pushPendingHeadScript(pendingHeadScripts, script, {
		src: null,
		scriptId,
		replaceExisting: false,
	});
	dedup.existingInlineContents.add(content);
}

/**
 * Queues head scripts from the incoming document that are not yet present in the live head.
 */
export function collectPendingHeadScriptsFromIncoming(
	newDocument: Document,
	dedup: HeadScriptDedupState,
): PendingHeadScript[] {
	const pendingHeadScripts: PendingHeadScript[] = [];

	for (const script of newDocument.head.querySelectorAll<HTMLScriptElement>('script')) {
		if (script.hasAttribute('data-eco-rerun')) {
			continue;
		}

		const src = script.getAttribute('src');
		const scriptId = script.getAttribute('data-eco-script-id') || script.getAttribute('id');

		if (scriptId && queueIdentifiedNonExecutableHeadScript(script, pendingHeadScripts, src, scriptId)) {
			continue;
		}

		if (src) {
			queueExternalHeadScript(script, pendingHeadScripts, dedup, src, scriptId);
		} else {
			queueInlineHeadScript(script, pendingHeadScripts, dedup, scriptId);
		}
	}

	return pendingHeadScripts;
}
