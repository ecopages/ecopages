import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export type BrowserRuntimeEntryModuleConfig = {
	specifier: string;
	defaultExport?: boolean;
};

export function createBrowserRuntimeEntryModule(options: {
	modules: BrowserRuntimeEntryModuleConfig[];
	fileName: string;
	rootDir?: string;
	cacheDirName?: string;
}): string {
	const rootDir = options.rootDir ?? process.cwd();
	const artifactsDir = path.join(
		rootDir,
		'node_modules',
		'.cache',
		options.cacheDirName ?? 'ecopages-browser-runtime',
	);
	fs.mkdirSync(artifactsDir, { recursive: true });

	const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
	const seenExports = new Set<string>();
	const statements: string[] = [];

	for (const module of options.modules) {
		if (module.defaultExport) {
			statements.push(`import __ecopages_default_export__ from '${module.specifier}';`);
			statements.push('export default __ecopages_default_export__;');
		}

		const exportNames = getModuleExportNames(module.specifier, requireFromRoot).filter(
			(name) => !seenExports.has(name),
		);

		if (exportNames.length > 0) {
			statements.push(`export { ${exportNames.join(', ')} } from '${module.specifier}';`);
			for (const exportName of exportNames) {
				seenExports.add(exportName);
			}
		}
	}

	const filePath = path.join(artifactsDir, options.fileName);
	fs.writeFileSync(filePath, statements.join('\n'), 'utf-8');
	return filePath;
}

function getModuleExportNames(specifier: string, requireFromRoot: ReturnType<typeof createRequire>): string[] {
	const moduleExports = requireFromRoot(specifier);

	return Object.keys(moduleExports)
		.filter((name) => name !== '__esModule' && name !== 'default')
		.filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name))
		.sort();
}