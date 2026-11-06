import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { resolvePackageStylesheetPath } from '../../../../plugins/tsconfig-import-resolver.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';

const COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * Matches an `@import` statement (specifier in group 2, 3 or 5, conditions in group 6) or a `url()` reference
 * (group 8 or 9).
 */
const IMPORT_OR_URL =
	/@import\s+(?:url\(\s*(?:(['"])(.*?)\1|([^'")\s]+))\s*\)|(['"])(.*?)\4)\s*([^;]*);|url\(\s*(?:(['"])(.*?)\7|([^'")\s]+))\s*\)/g;

/** A reference that does not name a file beside the stylesheet: a fragment, a root-relative path, or any URL with a scheme (`data:`, `https:`). */
function isExternalReference(reference: string): boolean {
	return (
		reference === '' ||
		reference.startsWith('#') ||
		reference.startsWith('/') ||
		/^[a-z][a-z\d+.-]*:/i.test(reference)
	);
}

function mapOutsideComments(css: string, map: (code: string) => string): string {
	let result = '';
	let last = 0;
	for (const comment of css.matchAll(COMMENT)) {
		result += map(css.slice(last, comment.index)) + comment[0];
		last = comment.index + comment[0].length;
	}
	return result + map(css.slice(last));
}

type PackageStylesheetContext = { assetsDir: string; inlined: Set<string> };

function emitReferencedFile(stylesheet: string, reference: string, context: PackageStylesheetContext): string {
	const suffixStart = reference.search(/[?#]/);
	const filePart = suffixStart === -1 ? reference : reference.slice(0, suffixStart);
	const suffix = suffixStart === -1 ? '' : reference.slice(suffixStart);
	let decoded = filePart;
	try {
		decoded = decodeURI(filePart);
	} catch {
		decoded = filePart;
	}
	const file = path.resolve(path.dirname(stylesheet), decoded);
	if (!fileSystem.exists(file)) {
		throw new Error(`[ecopages] ${stylesheet}: url(${reference}) names ${file}, which does not exist.`);
	}
	const emitted = writeHashedBrowserAsset({
		bytes: fileSystem.readFileAsBuffer(file),
		directory: context.assetsDir,
		extension: path.extname(file) || '.bin',
	});
	return `url(${JSON.stringify(`${path.basename(emitted)}${suffix}`)})`;
}

/**
 * @remarks
 * An `@import` specifier is a URL, so `base.css` names a sibling like `./base.css`; a package resolves only when
 * no such file exists.
 */
function resolveImportedStylesheet(stylesheet: string, specifier: string): string {
	const sibling = path.resolve(path.dirname(stylesheet), specifier);
	const resolved =
		specifier.startsWith('.') || fileSystem.exists(sibling)
			? sibling
			: resolvePackageStylesheetPath(stylesheet, specifier);
	if (!resolved || !fileSystem.exists(resolved)) {
		throw new Error(`[ecopages] ${stylesheet}: cannot resolve @import ${JSON.stringify(specifier)}.`);
	}
	return fileSystem.realpath(resolved);
}

function preparePackageStylesheetFile(stylesheet: string, context: PackageStylesheetContext): string {
	context.inlined.add(stylesheet);
	const css = fileSystem.readFileSync(stylesheet);
	return mapOutsideComments(css, (code) =>
		code.replace(IMPORT_OR_URL, (statement, ...groups: Array<string | undefined>) => {
			const urlReference = groups[7] ?? groups[8];
			if (!statement.startsWith('@import')) {
				return urlReference === undefined || isExternalReference(urlReference)
					? statement
					: emitReferencedFile(stylesheet, urlReference, context);
			}
			const specifier = groups[1] ?? groups[2] ?? groups[4] ?? '';
			if (isExternalReference(specifier)) return statement;
			if (groups[5]?.trim()) {
				throw new Error(
					`[ecopages] ${stylesheet}: ${statement.trim()} has conditions, which Ecopages does not apply to an @import in a package stylesheet. Import the stylesheet it names instead.`,
				);
			}
			const imported = resolveImportedStylesheet(stylesheet, specifier);
			return context.inlined.has(imported) ? '' : preparePackageStylesheetFile(imported, context);
		}),
	);
}

/**
 * Returns the browser-ready content of a package stylesheet.
 *
 * @remarks
 * Processors do not transform it: a package ships CSS that is already built, and an app's PostCSS or Tailwind
 * setup is not written for it. Each relative `url()` is emitted to `assetsDir` under a content hash and rewritten
 * to that file's name, which resolves beside the stylesheet, since a package stylesheet is emitted to the same
 * directory. A `?` or `#` suffix is kept. Root-relative, `data:` and remote URLs are left as written. An
 * `@import` of a relative or package stylesheet without conditions is inlined in its place, its own references
 * rewritten from its location, and each file is inlined once. A root-relative, `data:` or remote `@import` is left as written; one with
 * media, `supports()` or `layer` conditions throws, and so does a reference to a missing file.
 */
export function preparePackageStylesheet(stylesheet: string, assetsDir: string): string {
	return preparePackageStylesheetFile(fileSystem.realpath(stylesheet), { assetsDir, inlined: new Set() });
}
