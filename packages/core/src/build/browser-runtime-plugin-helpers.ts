/**
 * Shared helpers for the browser-runtime plugin family.
 *
 * @remarks
 * Both `createRuntimeSpecifierAliasPlugin` and
 * `createBrowserRuntimeImportRewritePlugin` need to:
 *
 * 1. Normalize their specifier input into a `Map<specifier, publicPath>`.
 * 2. Escape each specifier for inclusion in a regex filter.
 * 3. Build a `RegExp` whose alternation matches any of those specifiers.
 *
 * These utilities are extracted here so the two plugins do not duplicate
 * the same code path. Future plugins in the same family (e.g. a unified
 * `createBrowserRuntimePlugin` per ADR-002) can import the same helpers.
 */

type RuntimeSpecifierMap = ReadonlyMap<string, string> | Record<string, string>;

/**
 * Normalizes runtime specifier input into a `Map<specifier, publicPath>`.
 *
 * Accepts either a `Map` (returned as-is, defensively shallow-copied to
 * prevent the caller from mutating the shared instance) or a plain
 * `Record` (converted to a `Map`).
 *
 * Insertion order is preserved for `Record` input via `Object.entries`.
 */
export function toRuntimeSpecifierMap(specifierMap: RuntimeSpecifierMap): Map<string, string> {
	if (specifierMap instanceof Map) {
		return new Map(specifierMap);
	}

	return new Map(Object.entries(specifierMap));
}

/**
 * Escapes a literal specifier for inclusion in a regular expression.
 *
 * Only the regex metacharacters are escaped: `. * + ? ^ $ { } ( ) | [ ] \`
 */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a `RegExp` whose alternation matches any of the keys in
 * `specifierMap`.
 *
 * Returns `null` for an empty map so callers can short-circuit and
 * avoid registering a no-op `onResolve` / `onLoad` filter.
 */
export function buildSpecifierFilter(specifierMap: ReadonlyMap<string, string>): RegExp | null {
	if (specifierMap.size === 0) {
		return null;
	}

	const alternation = Array.from(specifierMap.keys()).map(escapeRegExp).join('|');
	return new RegExp(`^(${alternation})$`);
}
