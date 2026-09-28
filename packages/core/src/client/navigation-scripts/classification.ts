/**
 * Classifies head scripts for navigation-time persistence and execution.
 * @module
 */

const EXECUTABLE_SCRIPT_TYPES = new Set([
	'application/javascript',
	'application/ecmascript',
	'module',
	'text/ecmascript',
	'text/javascript',
]);

/**
 * Returns whether a script tag carries non-executable data (for example JSON-LD).
 */
export function isNonExecutableHeadScript(element: Element): boolean {
	if (element.tagName !== 'SCRIPT') {
		return false;
	}

	const type = (element.getAttribute('type') ?? '').trim().toLowerCase();
	if (!type) {
		return false;
	}

	return !EXECUTABLE_SCRIPT_TYPES.has(type);
}

/**
 * Returns whether an identified inline head script should survive head diffing.
 */
export function shouldPersistExecutableInlineHeadScript(element: Element): boolean {
	if (element.tagName !== 'SCRIPT') {
		return false;
	}

	const scriptId = element.getAttribute('data-eco-script-id') || element.getAttribute('id');
	if (!scriptId) {
		return false;
	}

	if (element.hasAttribute('data-eco-rerun')) {
		return false;
	}

	if ((element as HTMLScriptElement).src) {
		return false;
	}

	return !isNonExecutableHeadScript(element);
}

/**
 * Returns whether a script is queued for rerun after navigation commit.
 */
export function isRerunScript(element: Element): element is HTMLScriptElement {
	return element.tagName === 'SCRIPT' && element.hasAttribute('data-eco-rerun');
}
