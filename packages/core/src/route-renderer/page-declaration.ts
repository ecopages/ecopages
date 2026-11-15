import { path } from '@ecopages/file-system/path';
import { getComponentIdentity } from '../eco/component-identity.ts';
import { isEcoDeclaredComponent } from '../eco/eco-declared-component.ts';
import type { EcoComponent } from '../types/contracts.ts';

/**
 * Whether `page` is a declared component whose build-time identity names `file`, absolute or relative to `rootDir`.
 *
 * @remarks
 * The identity transform stamps the file that holds the literal `eco.page(...)` call, so a Page made by a
 * wrapper in another file, or re-exported from one, names that other file.
 */
export function isPageDeclaredIn(file: string, page: unknown, rootDir: string): boolean {
	const identityFile = isEcoDeclaredComponent(page) ? getComponentIdentity(page)?.file : undefined;
	return identityFile !== undefined && path.resolve(rootDir, identityFile) === path.resolve(rootDir, file);
}

/**
 * Whether `page` is a function carrying a `config`, which is what a wrapped or re-exported `eco.page()` result
 * looks like when {@link isPageDeclaredIn} fails.
 */
export function isUnattributedPage(page: unknown): boolean {
	return typeof page === 'function' && typeof (page as EcoComponent).config === 'object';
}

/** The error for a view or route file whose Page the build did not attribute to it. */
export function createLiteralPageDeclarationError(file: string): Error {
	return new Error(
		`[ecopages] ${file} default-exports an eco.page() result that the build did not attribute to this file. A route file declares its Page with a literal \`eco.page(...)\` call in that file. The build finds eco.page, eco.layout, eco.component and eco.html by their literal call, so a wrapper function, an alias such as \`const page = eco.page\`, a renamed import, or a Page declared in another file and re-exported gives the Page no identity or another file's, and server options such as props and metadata stay in the browser bundle. Call eco.page(...) directly in ${file}.`,
	);
}

/**
 * Fails when a view loaded from `file` is not a Page that file declares with a literal `eco.page(...)` call.
 *
 * @remarks
 * Applies the route-file check to views passed to `app.static()`, `app.errorPage()` and `ctx.render()`, so a view
 * behaves the same however it is routed. A value that is not a declared component at all is left to the
 * renderer lookup, which reports a missing integration.
 * @throws When `view` carries a config that the build did not attribute to `file`.
 */
export function assertViewDeclaredIn(file: string, view: unknown, rootDir: string): void {
	if (isUnattributedPage(view) && !isPageDeclaredIn(file, view, rootDir)) {
		throw createLiteralPageDeclarationError(file);
	}
}
