import { parseModuleSource } from '../../cache/module-parse-cache.ts';

const SCRIPT_MODULE_EXTENSION = /\.[cm]?[jt]sx?$/;

/**
 * True when an Integration-owned file imported from the server entry is a view,
 * so its import becomes a view reference.
 *
 * @remarks
 * A view is the default export, so a script module without one, such as a file of
 * plain components or a barrel, is not a view and loads as itself. Type-only
 * exports do not count. Files that are not script modules (`.html`, `.mdx`) are
 * views. A script module that does not parse is not, so the runtime or bundler
 * loading it reports the syntax error.
 */
export function isViewModule(filePath: string, source: string): boolean {
	if (!SCRIPT_MODULE_EXTENSION.test(filePath)) {
		return true;
	}

	const result = parseModuleSource(filePath, source);
	if (result.errors.length > 0) {
		return false;
	}

	return result.module.staticExports.some((staticExport) =>
		staticExport.entries.some(
			(entry) => !entry.isType && (entry.exportName.kind === 'Default' || entry.exportName.name === 'default'),
		),
	);
}
