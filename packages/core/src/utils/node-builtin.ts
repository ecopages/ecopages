import { builtinModules } from 'node:module';

/** Every specifier `node:module` lists as a built-in, without the `node:` prefix, subpaths such as `fs/promises` included. */
export const nodeBuiltinSpecifiers: ReadonlySet<string> = new Set(builtinModules);

/**
 * Whether `specifier` names a Node built-in, with or without the `node:` prefix.
 *
 * @remarks
 * The one owner of this question: the browser guard and the React client graph both ask it. A package named like a
 * subpath `builtinModules` does not list (`path-browserify`) is not a built-in.
 */
export function isNodeBuiltinSpecifier(specifier: string): boolean {
	return specifier.startsWith('node:') || nodeBuiltinSpecifiers.has(specifier);
}
