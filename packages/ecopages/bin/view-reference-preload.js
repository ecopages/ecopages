import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEcoPagesUserConfig } from '@ecopages/core/config';
import { fileSystem } from '@ecopages/file-system';
import {
	collectViewIntegrations,
	findViewOwner,
	isExemptFromViewReference,
	isViewModule,
	viewExtensionFilter,
	viewReferenceModuleSource,
} from '@ecopages/core/view-reference';

const IMPORTED_VIEW_NAMESPACE = 'ecopages-imported-view';

async function loadViewRewriteContext() {
	try {
		const { config } = await loadEcoPagesUserConfig();
		return {
			integrations: collectViewIntegrations(config.integrations ?? []),
			appRoot: config.rootDir ?? process.cwd(),
		};
	} catch {
		return {
			integrations: collectViewIntegrations([]),
			appRoot: process.cwd(),
		};
	}
}

function resolvePreloadEntryPath() {
	const fromEnv = process.env.ECOPAGES_ENTRY_FILE;
	if (fromEnv) {
		return path.resolve(fromEnv);
	}
	const bunMain = globalThis.Bun?.main;
	if (typeof bunMain === 'string' && bunMain.length > 0) {
		return bunMain;
	}
	return path.resolve('app.ts');
}

function importerFilePath(importer) {
	if (!importer || typeof importer !== 'string') {
		return null;
	}
	if (importer.startsWith('file:')) {
		try {
			return fileURLToPath(importer);
		} catch {
			return null;
		}
	}
	return importer;
}

/**
 * Resolves an import the way Bun does, so tsconfig aliases reach the file.
 *
 * @remarks
 * `Bun.resolveSync` does not run plugins. A specifier Bun cannot resolve is left to
 * the import itself to report.
 */
function resolveImportedPath(specifier, importer, appRoot) {
	const importerPath = importerFilePath(importer);
	const fromDir = importerPath ? path.dirname(importerPath) : appRoot;
	try {
		return globalThis.Bun.resolveSync(specifier, fromDir);
	} catch {
		return undefined;
	}
}

/** The Integration whose view this import is, or `undefined` when the file loads as itself. */
function viewOwnerToRewrite(filePath, entryPath, appRoot) {
	if (isExemptFromViewReference(filePath, { entryPath, appRoot })) {
		return undefined;
	}
	const owner = findViewOwner(integrations, filePath);
	if (!owner || !isViewModule(filePath, fileSystem.readFileSync(filePath))) {
		return undefined;
	}
	return owner;
}

function viewModuleLoadResult(filePath, integrationName) {
	return {
		format: 'module',
		source: viewReferenceModuleSource(filePath, integrationName),
		shortCircuit: true,
	};
}

const { integrations, appRoot } = await loadViewRewriteContext();
const entryPath = resolvePreloadEntryPath();

if (process.versions.bun) {
	const bun = globalThis.Bun;
	const extensions = [...new Set(integrations.flatMap((integration) => [...integration.extensions]))];
	if (typeof bun?.plugin === 'function' && extensions.length > 0) {
		bun.plugin({
			name: 'ecopages-imported-views',
			setup(builder) {
				builder.onResolve({ filter: viewExtensionFilter(extensions) }, (args) => {
					const filePath = resolveImportedPath(args.path, args.importer, appRoot);
					const owner = filePath ? viewOwnerToRewrite(filePath, entryPath, appRoot) : undefined;
					if (!owner) {
						return undefined;
					}
					return { path: filePath, namespace: IMPORTED_VIEW_NAMESPACE };
				});
				builder.onLoad({ filter: /.*/, namespace: IMPORTED_VIEW_NAMESPACE }, (args) => {
					const owner = findViewOwner(integrations, args.path);
					return {
						contents: viewReferenceModuleSource(args.path, owner?.name),
						loader: 'js',
					};
				});
			},
		});
	}
} else {
	const { registerHooks } = await import('node:module');
	registerHooks({
		load(url, context, nextLoad) {
			if (!url.startsWith('file:')) {
				return nextLoad(url, context);
			}

			let filePath;
			try {
				filePath = fileURLToPath(url);
			} catch {
				return nextLoad(url, context);
			}

			const owner = viewOwnerToRewrite(filePath, entryPath, appRoot);
			if (!owner) {
				return nextLoad(url, context);
			}

			return viewModuleLoadResult(filePath, owner.name);
		},
	});
}
