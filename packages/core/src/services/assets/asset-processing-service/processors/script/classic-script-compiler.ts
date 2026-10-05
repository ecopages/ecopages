import { stripVTControlCharacters } from 'node:util';
import { minifySync, transformSync } from 'rolldown/utils';
import { parseModuleSource } from '../../../../../cache/module-parse-cache.ts';

const JSX_FILE = /\.[jt]sx$/;
const RELATIVE_SPECIFIER = /(['"`])\.{1,2}\//;

/** Why a file cannot be a classic script; `needsModule` is set when `type="module"` would make it work. */
export type ClassicScriptProblem = { reason: string; needsModule: boolean };

/** Output file name of a compiled classic script: TypeScript extensions become `.js`. */
export function classicScriptOutputName(filepath: string): string {
	return filepath.replace(/\.[cm]?ts$/, '.js');
}

function plainText(error: { message?: string } | undefined): string {
	return stripVTControlCharacters(error?.message ?? 'unknown error');
}

/**
 * Compiles one file as a classic script: types are stripped in script mode and, when `minify` is set, the
 * output is minified without renaming top-level names, so its globals survive. Legal comments are kept.
 *
 * @remarks
 * Every check lives here, so any caller of `classic: true` gets them. The options are fixed and ignore any
 * `tsconfig.json`, so the output depends on the file alone. Legacy decorator lowering is on so that
 * decorators show up as a runtime helper, which a classic script cannot load.
 *
 * @returns The code, or the reason the file cannot be a classic script.
 */
export function compileClassicScript(
	filepath: string,
	source: string,
	options: { minify: boolean },
): { code: string } | { problem: ClassicScriptProblem } {
	if (JSX_FILE.test(filepath)) {
		return { problem: { reason: 'is JSX', needsModule: true } };
	}

	const asScript = parseModuleSource(filepath, source, { sourceType: 'script' });
	if (asScript.module.hasModuleSyntax) {
		return { problem: { reason: 'uses import, export, import.meta or a top-level await', needsModule: true } };
	}
	if (asScript.errors.length > 0) {
		return parseModuleSource(filepath, source).errors.length === 0
			? {
					problem: {
						reason: 'uses import, export, import.meta or a top-level await',
						needsModule: true,
					},
				}
			: { problem: { reason: `has a syntax error: ${plainText(asScript.errors[0])}`, needsModule: false } };
	}
	if (
		asScript.program.body.some(
			(node) =>
				node.type === 'TSImportEqualsDeclaration' && node.moduleReference.type === 'TSExternalModuleReference',
		)
	) {
		return { problem: { reason: 'uses import x = require()', needsModule: true } };
	}
	if (
		asScript.module.dynamicImports.some((entry) =>
			RELATIVE_SPECIFIER.test(source.slice(entry.moduleRequest.start, entry.moduleRequest.end)),
		)
	) {
		return { problem: { reason: 'imports a relative file with import()', needsModule: true } };
	}

	const compiled = transformSync(filepath, source, {
		sourceType: 'script',
		tsconfig: false,
		decorator: { legacy: true },
	});
	if (compiled.errors.length > 0) {
		return { problem: { reason: `has a syntax error: ${plainText(compiled.errors[0])}`, needsModule: false } };
	}
	const helpers = Object.keys(compiled.helpersUsed);
	if (helpers.length > 0) {
		return {
			problem: {
				reason: `needs the ${helpers.join(', ')} runtime helper (for example, for a decorator)`,
				needsModule: true,
			},
		};
	}
	if (!options.minify) {
		return { code: compiled.code };
	}

	const minified = minifySync(classicScriptOutputName(filepath), compiled.code, {
		module: false,
		mangle: { toplevel: false },
		codegen: { legalComments: 'inline' },
	});
	if (minified.errors.length > 0) {
		return { problem: { reason: `could not be minified: ${plainText(minified.errors[0])}`, needsModule: false } };
	}
	return { code: minified.code };
}
