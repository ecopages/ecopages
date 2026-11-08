import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { appLogger } from '../../../../global/app-logger.ts';
import { resolveGeneratedPath, writeGeneratedTypesPackage } from '../../../../plugins/processor.ts';
import { findStylesheetProcessor, getStylesheetKinds } from '../../../../plugins/stylesheet-kinds.ts';
import { isPathInside } from '../../../../utils/path-containment.ts';
import { isCssModuleExportName } from './stylesheet-module.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

/** The module name of the generated `@types` package that holds the declarations of the app's CSS Modules. */
export const CSS_MODULE_TYPES_MODULE = 'ecopages-css-modules';

/**
 * The declaration of a CSS Module whose class map is `exports`: the default export, typed with each class name as a
 * literal key, and a named export for each name that is a valid identifier (see {@link isCssModuleExportName}).
 *
 * @remarks
 * The default export is bound to a local name that no class takes, so a class named `styles` stays a named export.
 */
export function toCssModuleDeclaration(exports: Readonly<Record<string, string>>): string {
	const names = Object.keys(exports);
	const members = names.map((name) => `\treadonly ${JSON.stringify(name)}: string;\n`).join('');
	const named = names
		.filter(isCssModuleExportName)
		.map((name) => `export declare const ${name}: string;\n`)
		.join('');
	let binding = 'styles';
	while (names.includes(binding)) binding = `_${binding}`;
	return `declare const ${binding}: {\n${members}};\nexport default ${binding};\n${named}`;
}

function writeGeneratedFile(filePath: string, content: string): void {
	if (fileSystem.exists(filePath) && fileSystem.readFileSync(filePath) === content) return;
	fileSystem.ensureDir(path.dirname(filePath));
	fileSystem.write(filePath, content);
}

function typesRoot(appConfig: EcoPagesAppConfig): string {
	return resolveGeneratedPath('types', { root: appConfig.rootDir, module: CSS_MODULE_TYPES_MODULE });
}

/**
 * The file that declares the CSS Module `file`, mirroring its place under `srcDir`; `undefined` for a file outside
 * `srcDir`.
 */
function declarationPath(appConfig: EcoPagesAppConfig, file: string): string | undefined {
	const { srcDir } = appConfig.absolutePaths;
	if (!isPathInside(file, srcDir)) return undefined;
	return path.join(typesRoot(appConfig), `${path.relative(srcDir, file)}.d.ts`);
}

/** Writes the manifest and the entry of the generated `@types` package, so TypeScript does not report it empty. */
function writeTypesPackage(appConfig: EcoPagesAppConfig): void {
	writeGeneratedTypesPackage({
		root: appConfig.rootDir,
		module: CSS_MODULE_TYPES_MODULE,
		packageName: `@types/${CSS_MODULE_TYPES_MODULE}`,
		writeFile: writeGeneratedFile,
	});
	writeGeneratedFile(path.join(typesRoot(appConfig), 'index.d.ts'), 'export {};\n');
}

/**
 * Writes the declaration of the CSS Module `file` into the generated `@types` package, so a named import of its
 * classes type-checks.
 *
 * @remarks
 * The declaration sits at the path of the module under `srcDir`, which resolves for an app that lists the package
 * folder in `rootDirs` (and, for an alias such as `@/*`, in `paths`; see the CSS Modules guide). Unchanged
 * content is not rewritten, so a watcher on the folder stays quiet.
 */
export function writeCssModuleDeclaration(
	appConfig: EcoPagesAppConfig,
	file: string,
	exports: Readonly<Record<string, string>>,
): void {
	const target = declarationPath(appConfig, file);
	if (!target) return;
	writeTypesPackage(appConfig);
	writeGeneratedFile(target, toCssModuleDeclaration(exports));
}

/** Removes the declaration of the CSS Module `file`, as when the module is deleted. */
export function removeCssModuleDeclaration(appConfig: EcoPagesAppConfig, file: string): void {
	const target = declarationPath(appConfig, file);
	if (target) fileSystem.remove(target);
}

/**
 * Writes the declarations of every CSS Module in `srcDir`, and drops the ones an earlier run left for modules that
 * are gone. Writes nothing when no stylesheet Processor scopes CSS Modules.
 *
 * @remarks
 * A module the Processor rejects is logged and skipped, so one broken file does not hide the types of the others.
 */
export async function writeCssModuleDeclarations(appConfig: EcoPagesAppConfig): Promise<void> {
	const kinds = getStylesheetKinds(appConfig);
	if (!kinds.scopesCssModules) return;
	const processor = findStylesheetProcessor(appConfig.processors.values());
	const { srcDir, publicDir } = appConfig.absolutePaths;

	fileSystem.remove(typesRoot(appConfig));
	writeTypesPackage(appConfig);
	const patterns = kinds.extensions.map((extension) => `**/*.module${extension}`);
	for (const relativePath of await fileSystem.glob(patterns, { cwd: srcDir })) {
		const file = path.join(srcDir, relativePath);
		if (isPathInside(file, publicDir) || !processor?.canProcessAsset('stylesheet', file)) continue;
		try {
			const { exports } = await applyStylesheetProcessors(appConfig, await fileSystem.readFile(file), file);
			if (exports) writeCssModuleDeclaration(appConfig, file, exports);
		} catch (error) {
			appLogger.error(
				`Could not declare the CSS Module ${file}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

/**
 * Warns, once, when the app has CSS Module declarations but its tsconfig cannot find them, and prints the lines to add.
 *
 * @remarks
 * TypeScript resolves a declaration only through `rootDirs`, and an alias such as `@/*` also needs the package folder
 * as a second `paths` target. Until they are listed, a named import of a CSS Module class fails type checking.
 */
export function warnMissingCssModuleRootDirs(_appConfig: EcoPagesAppConfig): void {}
