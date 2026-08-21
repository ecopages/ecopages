import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../../../config/constants.ts';
import {
	browserRuntimeEntryHasEsmExports,
	inferBrowserRuntimeDefaultExportPolicy,
	listBrowserRuntimeCjsExportNames,
	resolveBrowserRuntimeEntryImport,
	resolveBrowserRuntimeEntryPath,
} from './browser-runtime-entry-resolution.ts';

export type BrowserRuntimeEntryModuleConfig = {
	specifier: string;
	defaultExport?: boolean;
};

/**
 * Creates a generated ESM entry module that re-exports runtime modules through
 * one stable file.
 *
 * @remarks
 * Integrations use this helper when they need a browser runtime asset composed
 * from multiple bare specifiers but do not want to own temporary file assembly
 * logic themselves. The generated file lives under the app work directory so
 * repeated runs can reuse the same location without placing sources inside
 * `node_modules`, which can cause bundlers to externalize bare imports.
 * ESM entries use `export *`. CJS entries emit explicit named re-exports from
 * that same file so Rolldown can synthesize ESM bindings such as `jsx`.
 */
export function createBrowserRuntimeEntryModule(options: {
	modules: BrowserRuntimeEntryModuleConfig[];
	fileName: string;
	rootDir?: string;
	workDir?: string;
	cacheDirName?: string;
}): string {
	if (options.modules.some((module) => !module.specifier.startsWith('node:')) && !options.rootDir) {
		throw new Error('createBrowserRuntimeEntryModule requires rootDir to resolve package specifiers');
	}

	const rootDir = options.rootDir ?? process.cwd();
	const workDir = options.workDir ?? path.join(rootDir, DEFAULT_ECOPAGES_WORK_DIR);
	const artifactsDir = path.join(
		workDir,
		'.browser-runtime-entries',
		options.cacheDirName ?? 'ecopages-browser-runtime',
	);
	fs.mkdirSync(artifactsDir, { recursive: true });

	const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
	const seenExports = new Set<string>();
	const statements: string[] = [];
	const filePath = path.join(artifactsDir, options.fileName);
	const entryDir = path.dirname(filePath);

	for (const module of options.modules) {
		const importSpecifier = resolveBrowserRuntimeEntryImport({
			specifier: module.specifier,
			requireFromRoot,
			entryDir,
			rootDir,
		});
		const entryPath = resolveBrowserRuntimeEntryPath({
			specifier: module.specifier,
			requireFromRoot,
			rootDir,
		});

		if (
			module.defaultExport &&
			inferBrowserRuntimeDefaultExportPolicy({ specifier: module.specifier, requireFromRoot, rootDir }) ===
				'emit-default'
		) {
			statements.push(`import __ecopages_default_export__ from '${importSpecifier}';`);
			statements.push('export default __ecopages_default_export__;');
		}

		if (browserRuntimeEntryHasEsmExports(entryPath)) {
			statements.push(`export * from '${importSpecifier}';`);
			continue;
		}

		const exportNames = listBrowserRuntimeCjsExportNames(entryPath ?? module.specifier, requireFromRoot).filter(
			(name) => !seenExports.has(name),
		);

		if (exportNames.length > 0) {
			statements.push(`export { ${exportNames.join(', ')} } from '${importSpecifier}';`);
			for (const exportName of exportNames) {
				seenExports.add(exportName);
			}
		}
	}

	const content = statements.join('\n');
	if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf-8') !== content) {
		fs.writeFileSync(filePath, content, 'utf-8');
	}
	return filePath;
}
