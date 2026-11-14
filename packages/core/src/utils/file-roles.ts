const FILE_ROLES = ['api', 'server', 'script'] as const;

type FileRole = (typeof FILE_ROLES)[number];

/**
 * The script extensions a role suffix may end in.
 *
 * @remarks
 * Never a template extension: a role file has no Integration owner, Layout or Cache Strategy, so
 * config assembly rejects an Integration whose extensions end in a role suffix.
 */
const FILE_ROLE_SCRIPT_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx'];

function suffixesOf(role: FileRole): readonly string[] {
	return FILE_ROLE_SCRIPT_EXTENSIONS.map((extension) => `.${role}${extension}`);
}

/** Suffixes that mark a file under the pages directory as an endpoint: `.api.ts`, `.api.tsx`, `.api.js`, `.api.jsx`. */
export const ENDPOINT_FILE_EXTENSIONS: readonly string[] = suffixesOf('api');

/** Every role suffix: `<name>.<role>.<ts|tsx|js|jsx>` for `api`, `server` and `script`. */
export const FILE_ROLE_SUFFIXES: readonly string[] = FILE_ROLES.flatMap(suffixesOf);

/**
 * Returns the role `file` declares by its name and the suffix that declares it, or `undefined` for a file with none.
 *
 * @remarks
 * `api` is an endpoint, `server` a server-only module no browser module may reach, `script` a browser script.
 * The last two are never Pages.
 */
export function matchRoleSuffix(file: string): { role: FileRole; suffix: string } | undefined {
	for (const role of FILE_ROLES) {
		const suffix = suffixesOf(role).find((candidate) => file.endsWith(candidate));
		if (suffix) return { role, suffix };
	}
	return undefined;
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
export function findMisplacedRole(file: string): string | undefined {
	const parts = (file.split('/').pop() ?? file).split('.');
	const wellFormedIndex = FILE_ROLE_SCRIPT_EXTENSIONS.includes(`.${parts[parts.length - 1]}`) ? parts.length - 2 : -1;
	for (let index = 1; index < parts.length; index += 1) {
		const segment = parts[index] ?? '';
		if ((FILE_ROLES as readonly string[]).includes(segment) && index !== wellFormedIndex) {
			return segment;
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

const SERVER_MODULE_PATTERN = new RegExp(
	`(?:^|/)[^/]+\\.server(?:${[...FILE_ROLE_SCRIPT_EXTENSIONS, '.mjs', '.cjs'].map((extension) => extension.replace('.', '\\.')).join('|')})?$`,
);

/**
 * Whether `specifier` names a `.server` module: `<name>.server`, with or without a script extension.
 *
 * @remarks
 * Ignores the query and fragment suffixes module resolver plugins add, so import pruning and browser
 * resolution enforce the same boundary. `.mjs` and `.cjs` stay on the list because a package's published
 * output may use them. A template extension after `.server` (`card.server.kita.tsx`) does not make a file
 * server-only: the router rejects that name. This module has no runtime dependencies and is safe to import
 * in the browser.
 */
export function isServerOnlyModuleSpecifier(specifier: string): boolean {
	return SERVER_MODULE_PATTERN.test(specifier.replace(/[?#].*$/, ''));
}
