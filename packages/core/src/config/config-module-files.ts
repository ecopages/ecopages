import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { rolldown } from 'rolldown';
import { appLogger } from '../global/app-logger.ts';

const SCRIPT_MODULE_PATTERN = /\.(?:[cm]?[jt]sx?|json)$/;

function toProjectPath(id: string, realRoot: string, root: string): string | undefined {
	if (!path.isAbsolute(id) || id.split(path.sep).includes('node_modules')) {
		return undefined;
	}
	const relativePath = path.relative(realRoot, id);
	if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		return undefined;
	}
	return path.join(root, relativePath);
}

/**
 * Collects the config module and the project files it imports, directly or transitively.
 *
 * @remarks
 * Only script and JSON files under `rootDir` and outside `node_modules` are followed. Packages, files outside
 * `rootDir`, imports that do not resolve and other file types stay external, so one unusual import does not
 * hide the rest. Paths use the spelling of `rootDir`, even when it contains a symlink. If the scan still
 * fails, only the config module is returned and a warning is logged; loading the config reports any real
 * error.
 */
export async function collectConfigModuleFiles(configFilePath: string, rootDir: string): Promise<string[]> {
	const root = path.resolve(rootDir);
	const realRoot = fileSystem.exists(root) ? realpathSync(root) : root;
	const configFile = path.resolve(configFilePath);
	const realConfigFile = fileSystem.exists(configFile) ? realpathSync(configFile) : configFile;
	const moduleFiles = new Set([configFile]);
	try {
		const bundle = await rolldown({
			input: configFile,
			cwd: root,
			platform: 'node',
			logLevel: 'silent',
			external: (id, _importer, isResolved) =>
				isResolved &&
				id !== realConfigFile &&
				(!SCRIPT_MODULE_PATTERN.test(id) || !toProjectPath(id, realRoot, root)),
			plugins: [
				{
					name: 'ecopages-config-module-files',
					async resolveId(source, importer, options) {
						const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
						return resolved ?? { id: source, external: true };
					},
					moduleParsed(moduleInfo) {
						const projectPath = toProjectPath(moduleInfo.id, realRoot, root);
						if (projectPath) moduleFiles.add(projectPath);
					},
				},
			],
		});
		try {
			await bundle.generate({ format: 'esm' });
		} finally {
			await bundle.close();
		}
	} catch (error) {
		appLogger.warn(
			`Could not collect the files imported by ${configFilePath}; only the config file is tracked.\n${error instanceof Error ? error.stack : String(error)}`,
		);
		return [configFile];
	}

	return Array.from(moduleFiles);
}
