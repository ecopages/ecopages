import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { getServerBundleOutputPaths } from './server-bundle-deploy-manifest.ts';

/**
 * Copies `serverFiles` globs into `dist/server/` under each file's basename.
 *
 * @remarks
 * Production `import.meta.dirname` is the emitted module directory, so declared
 * files land next to those modules. Two matches that share a basename fail the
 * build.
 */
export async function copyDeclaredServerFiles(appConfig: EcoPagesAppConfig): Promise<void> {
	const patterns = appConfig.serverFiles;
	if (!patterns || patterns.length === 0) {
		return;
	}

	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	const matches = await fileSystem.glob(patterns, { cwd: appConfig.rootDir });
	const copiedNames = new Map<string, string>();

	for (const relative of matches) {
		const source = path.resolve(appConfig.rootDir, relative);
		if (!fileSystem.exists(source) || fileSystem.isDirectory(source)) {
			continue;
		}
		const name = path.basename(relative);
		const existing = copiedNames.get(name);
		if (existing) {
			throw new Error(
				`serverFiles copy collision: "${existing}" and "${relative}" both copy to ${name} in dist/server/. Use unique names, or move the files to public/.`,
			);
		}
		const destination = path.join(serverOutdir, name);
		if (fileSystem.exists(destination)) {
			throw new Error(
				`serverFiles copy would overwrite ${name} in dist/server/. Use a unique basename, or move the file to public/.`,
			);
		}
		copiedNames.set(name, relative);
		fileSystem.copyFile(source, destination);
	}
}
