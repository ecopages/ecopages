/**
 * The role a file declares by its name: `<name>.<role>.<ext>`.
 *
 * - `api`: an endpoint under the pages directory, not a Page.
 * - `server`: a server-only module, which no browser module may reach.
 * - `script`: a browser script, never a Page.
 */
export type FileRole = 'api' | 'server' | 'script';

export const FILE_ROLES: readonly FileRole[] = ['api', 'server', 'script'];

/**
 * The script extensions a role suffix may end in.
 *
 * @remarks
 * Never a template extension: a role file has no Integration owner, Layout or Cache Strategy, so
 * config assembly rejects an Integration whose extensions end in a role suffix.
 */
export const FILE_ROLE_SCRIPT_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx'];

function suffixesOf(role: FileRole): readonly string[] {
	return FILE_ROLE_SCRIPT_EXTENSIONS.map((extension) => `.${role}${extension}`);
}

/** Suffixes that mark a file under the pages directory as an endpoint: `.api.ts`, `.api.tsx`, `.api.js`, `.api.jsx`. */
export const ENDPOINT_FILE_EXTENSIONS: readonly string[] = suffixesOf('api');

/** Every role suffix, in the order {@link FILE_ROLES} lists the roles. */
export const FILE_ROLE_SUFFIXES: readonly string[] = FILE_ROLES.flatMap(suffixesOf);

/** Returns the role `file` declares by its name, or `undefined` for a file with none. */
export function getFileRole(file: string): FileRole | undefined {
	return FILE_ROLES.find((role) => suffixesOf(role).some((suffix) => file.endsWith(suffix)));
}

/** Returns the endpoint marker `file` ends with, or `undefined` for any other file. */
export function findEndpointFileExtension(file: string): string | undefined {
	return ENDPOINT_FILE_EXTENSIONS.find((extension) => file.endsWith(extension));
}

/** Returns the role suffix `file` ends with, or `undefined` for any other file. */
export function findRoleSuffix(file: string): string | undefined {
	return FILE_ROLE_SUFFIXES.find((suffix) => file.endsWith(suffix));
}

/**
 * Returns the role segment of `file` when it sits anywhere but directly before a script extension, as in
 * `card.server.kita.tsx` or `nav.script.lit.tsx`, or `undefined` when the name has none or a well-formed one.
 *
 * @remarks
 * The name's first segment is never a role, so `server.tsx` and `api.ts` are ordinary names. A role segment
 * followed by a template extension is ambiguous (a server-only file or a Page of that Integration), so it is
 * rejected instead of read one way.
 */
export function findMisplacedRole(file: string): FileRole | undefined {
	const parts = (file.split('/').pop() ?? file).split('.');
	const wellFormedIndex = FILE_ROLE_SCRIPT_EXTENSIONS.includes(`.${parts[parts.length - 1]}`) ? parts.length - 2 : -1;
	for (let index = 1; index < parts.length; index += 1) {
		const role = FILE_ROLES.find((candidate) => candidate === parts[index]);
		if (role && index !== wellFormedIndex) {
			return role;
		}
	}
	return undefined;
}

/**
 * Whether `relativePath`, relative to the pages directory, has a segment starting with `_`.
 *
 * @remarks
 * A private file or folder is never a route: `_layout.tsx`, `_card.tsx`, `_test/page.tsx`.
 */
export function isPrivatePath(relativePath: string): boolean {
	return relativePath.split('/').some((segment) => segment.startsWith('_'));
}

/** The forms a role file name takes, for error messages. */
export function describeRoleForms(): string {
	return FILE_ROLES.map((role) => `<name>.${role}.<ts|tsx|js|jsx>`).join(', ');
}

/**
 * Whether `specifier` names a `.server` module, with or without a file extension.
 *
 * @remarks
 * Ignores the query and fragment suffixes module resolver plugins add, so import pruning and browser
 * resolution enforce the same boundary. This module has no runtime dependencies and is safe to import in
 * the browser.
 */
export function isServerOnlyModuleSpecifier(specifier: string): boolean {
	const pathname = specifier.replace(/[?#].*$/, '');
	return /(?:^|[/])[^/]+\.server(?:$|\.)/.test(pathname);
}
