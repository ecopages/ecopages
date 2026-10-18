import { RERUN_SRC_ATTR } from './registry.ts';

export type NavigationScriptIdentitySource =
	| Element
	| {
			scriptId: string | null;
			src: string | null;
			textContent: string;
	  };

export type NavigationScriptIdentity = {
	scriptId: string | null;
	src: string | null;
	textContent: string;
	key: string | null;
};

/**
 * Reads the stable identity used to match a navigation script across pages.
 *
 * @remarks
 * Explicit `data-eco-script-id` and `id` take priority, followed by the
 * original script URL and trimmed inline contents.
 */
export function getNavigationScriptIdentity(source: NavigationScriptIdentitySource): NavigationScriptIdentity {
	const isElement = source instanceof Element;
	const scriptId = isElement
		? source.getAttribute('data-eco-script-id') || source.getAttribute('id')
		: source.scriptId;
	const src = isElement ? source.getAttribute(RERUN_SRC_ATTR) || source.getAttribute('src') : source.src;
	const textContent = isElement ? (source.textContent ?? '') : source.textContent;
	const inlineContent = textContent.trim();
	const resolvedSrc = src ? new URL(src, isElement ? source.ownerDocument.baseURI : document.baseURI).href : null;
	const key = scriptId
		? `id:${scriptId}`
		: resolvedSrc
			? `src:${resolvedSrc}`
			: inlineContent
				? `inline:${inlineContent}`
				: null;

	return { scriptId, src: resolvedSrc, textContent, key };
}
