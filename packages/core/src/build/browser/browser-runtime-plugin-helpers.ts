/**
 * Shared helpers for the browser-runtime plugin.
 *
 * @remarks
 * `createBrowserRuntimePlugin` needs to:
 *
 * 1. Escape each specifier for inclusion in a regex filter.
 * 2. Build a `RegExp` whose alternation matches registered specifiers.
 *
 * These utilities are extracted here so the plugin does not duplicate
 * the same code path.
 */

/**
 * Escapes a literal specifier for inclusion in a regular expression.
 *
 * Only the regex metacharacters are escaped: `. * + ? ^ $ { } ( ) | [ ] \`
 */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
