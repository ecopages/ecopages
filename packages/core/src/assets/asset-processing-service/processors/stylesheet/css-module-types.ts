import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';

/** The module name of the generated `@types` package that holds the declarations of the app's CSS Modules. */
export const CSS_MODULE_TYPES_MODULE = 'ecopages-css-modules';

/** The declaration of a CSS Module with the class map `exports`. */
export function toCssModuleDeclaration(_exports: Readonly<Record<string, string>>): string {
	return '';
}

/** Writes the declaration of the CSS Module `file`. */
export function writeCssModuleDeclaration(
	_appConfig: EcoPagesAppConfig,
	_file: string,
	_exports: Readonly<Record<string, string>>,
): void {}

/** Removes the declaration of the CSS Module `file`. */
export function removeCssModuleDeclaration(_appConfig: EcoPagesAppConfig, _file: string): void {}

/** Writes the declarations of every CSS Module in the app's `srcDir`. */
export async function writeCssModuleDeclarations(_appConfig: EcoPagesAppConfig): Promise<void> {}
