import path from 'node:path';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import { isViewReference, VIEW_REFERENCE, type ViewReference } from '../../types/view-reference.ts';

export { isViewReference, VIEW_REFERENCE, type ViewReference } from '../../types/view-reference.ts';

const HTML_VIEW_EXTENSION = '.html';
/** Same name as `HTML_PAGES_INTEGRATION_NAME`; this file cannot import the Rendering layer. */
const HTML_VIEW_INTEGRATION = 'html-pages';

export type ViewIntegrationMatch = {
	name: string;
	extensions: readonly string[];
};

const viewReferences = new Map<string, ViewReference>();

/**
 * Integrations whose files become view references when imported from the server entry.
 *
 * @remarks
 * Core owns `.html` unless an Integration already claims it, matching config finalization.
 */
export function collectViewIntegrations(
	integrations: readonly ViewIntegrationMatch[] | undefined,
): ViewIntegrationMatch[] {
	const listed = [...(integrations ?? [])];
	if (!listed.some((integration) => integration.extensions.includes(HTML_VIEW_EXTENSION))) {
		listed.push({ name: HTML_VIEW_INTEGRATION, extensions: [HTML_VIEW_EXTENSION] });
	}
	return listed;
}

const ECO_CONFIG_BASENAME = /^eco\.config(?:\.[cm]?[jt]sx?)?$/;

/** True when a native import of this path must stay a real module. */
export function isIgnoredViewPath(filePath: string): boolean {
	return filePath.split(path.sep).includes('node_modules');
}

function isInsideDir(filePath: string, dir: string): boolean {
	const relative = path.relative(path.resolve(dir), path.resolve(filePath));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * True when rewriting this file into a view reference would replace the server
 * entry, the app config, or a module the app module loader still needs.
 */
export function isExemptFromViewReference(
	filePath: string,
	options: {
		entryPath?: string;
		importerPath?: string | null;
		appRoot?: string;
		requireAppImporter?: boolean;
	} = {},
): boolean {
	if (isIgnoredViewPath(filePath)) {
		return true;
	}

	const resolvedPath = path.resolve(filePath);
	if (options.entryPath && resolvedPath === path.resolve(options.entryPath)) {
		return true;
	}

	if (ECO_CONFIG_BASENAME.test(path.basename(resolvedPath))) {
		return true;
	}

	if (options.appRoot && !isInsideDir(resolvedPath, options.appRoot)) {
		return true;
	}

	if (!options.requireAppImporter) {
		return false;
	}

	const importerPath = options.importerPath;
	if (!importerPath) {
		return true;
	}

	if (isIgnoredViewPath(importerPath)) {
		return true;
	}

	const appRoot = options.appRoot;
	return appRoot !== undefined && !isInsideDir(importerPath, appRoot);
}

export function findViewOwner(
	integrations: readonly ViewIntegrationMatch[],
	filePath: string,
): ViewIntegrationMatch | undefined {
	if (isIgnoredViewPath(filePath)) {
		return undefined;
	}
	return findIntegrationForFile(integrations, filePath);
}

export function viewExtensionFilter(extensions: readonly string[]): RegExp {
	return new RegExp(`(${extensions.map(escapeRegExp).join('|')})$`);
}

/**
 * Returns the one view reference for `filePath`.
 *
 * @remarks
 * Two imports of the same file, including from the server-entry bundle and the
 * development preload, share this object.
 */
export function createViewReference<P = Record<string, unknown>>(
	filePath: string,
	integration?: string | null,
): ViewReference<P> {
	const resolvedPath = path.resolve(filePath);
	const existing = viewReferences.get(resolvedPath);
	if (existing) {
		return existing as ViewReference<P>;
	}

	const integrationName = integration ?? undefined;
	const reference: ViewReference<P> = {
		[VIEW_REFERENCE]: true,
		filePath: resolvedPath,
		config: {
			identity: {
				id: resolvedPath,
				file: resolvedPath,
				integration: integrationName,
			},
		},
	};
	viewReferences.set(resolvedPath, reference as ViewReference);
	return reference;
}

/** Synthetic ESM source the CLI hook and server-entry plugin evaluate instead of the view. */
export function viewReferenceModuleSource(filePath: string, integrationName?: string): string {
	const pathLiteral = JSON.stringify(path.resolve(filePath));
	const integrationLiteral = JSON.stringify(integrationName);
	return `import { createViewReference } from '@ecopages/core/view-reference';
export default createViewReference(${pathLiteral}, ${integrationLiteral});
`;
}

export function assertIsViewReference(value: unknown): asserts value is ViewReference {
	if (!isViewReference(value)) {
		throw new Error('Expected an imported view reference.');
	}
}
