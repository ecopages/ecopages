import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoPageComponent, ViewLoader } from '../../types/public-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { getAppServerModuleTranspiler } from './app-server-module-transpiler.service.ts';

function resolveViewModuleOnDisk(filePath: string, templatesExt: readonly string[]): string {
	if (fileSystem.exists(filePath)) {
		return filePath;
	}

	for (const extension of templatesExt) {
		const withExtension = `${filePath}${extension}`;
		if (fileSystem.exists(withExtension)) {
			return withExtension;
		}
	}

	const pathWithoutTerminalExtension = filePath.replace(/\.[^./]+$/, '');
	for (const extension of templatesExt) {
		const candidate = `${pathWithoutTerminalExtension}${extension}`;
		if (fileSystem.exists(candidate)) {
			return candidate;
		}
	}

	return filePath;
}

function resolveViewModuleFilePath(appConfig: EcoPagesAppConfig, modulePath: string | URL): string {
	const filePath = modulePath instanceof URL ? fileURLToPath(modulePath) : modulePath;
	const rootedPath = path.isAbsolute(filePath)
		? filePath
		: path.join(appConfig.rootDir, filePath.replace(/^\.\//, ''));
	return resolveViewModuleOnDisk(rootedPath, appConfig.templatesExt);
}

/**
 * Creates a view loader that imports through the app server-module transpiler.
 *
 * @remarks
 * Use this for `app.static()` and HTML error-page registrations instead of
 * raw dynamic `import()` so Node applies Ecopages build transforms (component identity).
 */
export function createViewModuleLoader<P = Record<string, unknown>>(
	appConfig: EcoPagesAppConfig,
	modulePath: string | URL,
): ViewLoader<P> {
	const filePath = resolveViewModuleFilePath(appConfig, modulePath);

	return async () =>
		await getAppServerModuleTranspiler(appConfig).importModule<{ default: EcoPageComponent<P> }>({
			filePath,
			outdir: path.join(resolveInternalExecutionDir(appConfig), '.server-modules'),
			externalPackages: true,
		});
}
