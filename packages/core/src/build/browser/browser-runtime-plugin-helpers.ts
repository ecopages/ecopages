/**
 * Shared helpers for the browser-runtime plugin.
 *
 * @remarks
 * `createBrowserRuntimePlugin` needs a filter whose alternation matches its
 * registered specifiers. This module builds the filter with the shared
 * regular-expression escaper.
 */

import { escapeRegExp } from '../../utils/regex-escaping.ts';

/**
 * Builds a `RegExp` that matches registered specifiers exactly.
 *
 * Returns `null` for an empty map so callers can short-circuit registration.
 */
export function buildSpecifierFilter(specifierMap: ReadonlyMap<string, string>): RegExp | null {
	if (specifierMap.size === 0) {
		return null;
	}

	const alternation = Array.from(specifierMap.keys()).map(escapeRegExp).join('|');
	return new RegExp(`^(?:${alternation})$`);
}
