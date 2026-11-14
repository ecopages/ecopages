import type { StaticImport } from './component-import-discovery.ts';

/** One `ecopages:` virtual module a module imports, with its named imports or none for the namespace. */
export type EcopagesVirtualImport = {
	from: string;
	imports: string[] | undefined;
};

/**
 * Lists the `ecopages:` virtual modules among a module's static imports, once each.
 *
 * @remarks
 * Server-only ones are listed too; rendering leaves them out of the browser modules it declares.
 * A module imported for its namespace, its default export or its side effects is listed without named imports,
 * and that wins over named imports of the same module, so module generation imports the whole namespace.
 */
export function collectEcopagesVirtualImports(imports: readonly StaticImport[]): EcopagesVirtualImport[] {
	const found = new Map<string, Set<string> | null>();
	for (const { source, bindings } of imports) {
		if (!source.startsWith('ecopages:') || found.get(source) === null) continue;
		const named = bindings.filter(({ imported }) => imported !== 'default').map(({ imported }) => imported);
		if (named.length === 0) {
			found.set(source, null);
			continue;
		}
		const known = found.get(source) ?? new Set<string>();
		for (const name of named) known.add(name);
		found.set(source, known);
	}
	return [...found].map(([from, names]) => ({ from, imports: names ? [...names] : undefined }));
}
