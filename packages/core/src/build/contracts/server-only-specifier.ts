/**
 * @remarks
 * Matches the `.server` naming convention with or without a file extension,
 * ignoring query and fragment suffixes used by module resolver plugins,
 * so import pruning and browser resolution enforce the same boundary.
 * This module has no runtime dependencies and is safe to import in the browser.
 */
export function isServerOnlyModuleSpecifier(specifier: string): boolean {
	const pathname = specifier.replace(/[?#].*$/, '');
	return /(?:^|[/])[^/]+\.server(?:$|\.)/.test(pathname);
}
