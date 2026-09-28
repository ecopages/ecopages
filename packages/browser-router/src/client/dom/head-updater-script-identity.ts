import { RERUN_SRC_ATTR } from '@ecopages/core/client/navigation-scripts';
import type { PendingHeadScript } from './head-updater-types.ts';
import type { PendingRerunScript } from '@ecopages/core/client/navigation-scripts';

type HeadScriptIdentity = Pick<PendingHeadScript | PendingRerunScript, 'scriptId' | 'src' | 'textContent'>;

function readHeadScriptIdentity(script: HTMLScriptElement | HeadScriptIdentity): HeadScriptIdentity {
	if (!(script instanceof HTMLScriptElement)) {
		return script;
	}

	return {
		scriptId: script.getAttribute('data-eco-script-id') || script.getAttribute('id'),
		src: script.getAttribute(RERUN_SRC_ATTR) || script.getAttribute('src'),
		textContent: script.textContent ?? '',
	};
}

/**
 * Derives a stable identity key for a head script.
 *
 * @remarks
 * Priority: `data-eco-script-id` / `id` > `src` > trimmed inline content.
 * Returns `null` for empty anonymous inline scripts that cannot be tracked.
 */
export function getHeadScriptKey(script: HTMLScriptElement | HeadScriptIdentity): string | null {
	const { scriptId, src, textContent } = readHeadScriptIdentity(script);
	if (scriptId) {
		return `id:${scriptId}`;
	}

	if (src) {
		return `src:${src}`;
	}

	const inlineContent = textContent.trim();
	return inlineContent ? `inline:${inlineContent}` : null;
}

export function findExistingHeadScript(script: HTMLScriptElement | HeadScriptIdentity): HTMLScriptElement | null {
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

export function areHeadScriptsEquivalent(nextScript: HTMLScriptElement, currentScript: HTMLScriptElement): boolean {
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
