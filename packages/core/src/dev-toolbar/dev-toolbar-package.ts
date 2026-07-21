import { createRequire } from 'node:module';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

const SOURCE_CLIENT_FILE = 'src/bootstrap.ts';

export type DevToolbarClientResolution = {
	entryPath: string;
};

/**
 * Returns the configured dev-toolbar client package specifier, if any.
 */
export function getDevToolbarPackageSpec(appConfig: Pick<EcoPagesAppConfig, 'devToolbar'>): string | undefined {
	const spec = appConfig.devToolbar?.package?.trim();
	return spec || undefined;
}

/**
 * Resolves the dev-toolbar package root from an application project directory.
 *
 * @remarks Walks up from the package entry rather than resolving `package.json`
 * directly so packages with strict `exports` (no `./package.json` subpath) still work.
 */
export function resolveDevToolbarPackageRoot(rootDir: string, packageSpec: string): string {
	const require = createRequire(path.join(rootDir, 'package.json'));
	let dir = path.dirname(require.resolve(packageSpec));

	while (dir !== path.dirname(dir)) {
		if (fileSystem.exists(path.join(dir, 'package.json'))) {
			return dir;
		}
		dir = path.dirname(dir);
	}

	throw new Error(`Could not resolve package root for ${packageSpec}`);
}

/**
 * Resolves the browser entrypoint core bundles into `/_dev_toolbar.js`.
 */
export function resolveDevToolbarClient(rootDir: string, packageSpec: string): DevToolbarClientResolution | undefined {
	const packageRoot = resolveDevToolbarPackageRoot(rootDir, packageSpec);
	const sourcePath = path.join(packageRoot, SOURCE_CLIENT_FILE);

	if (fileSystem.exists(sourcePath)) {
		return { entryPath: sourcePath };
	}

	const require = createRequire(path.join(rootDir, 'package.json'));
	try {
		return { entryPath: require.resolve(packageSpec) };
	} catch {
		return undefined;
	}
}

/**
 * Resolves the configured dev-toolbar client for an app config, when present.
 */
export function resolveConfiguredDevToolbarClient(
	appConfig: EcoPagesAppConfig,
): DevToolbarClientResolution | undefined {
	const packageSpec = getDevToolbarPackageSpec(appConfig);
	if (!packageSpec) {
		return undefined;
	}

	return resolveDevToolbarClient(appConfig.absolutePaths.projectDir, packageSpec);
}

/**
 * Resolves a dev-toolbar client entry module from the application project root.
 */
export function resolveDevToolbarPackageEntry(rootDir: string, packageSpec: string): string {
	const client = resolveDevToolbarClient(rootDir, packageSpec);
	if (!client) {
		const require = createRequire(path.join(rootDir, 'package.json'));
		return require.resolve(packageSpec);
	}

	return client.entryPath;
}

/**
 * Resolves the configured dev-toolbar entry for an app config, when present.
 */
export function resolveConfiguredDevToolbarEntry(appConfig: EcoPagesAppConfig): string | undefined {
	return resolveConfiguredDevToolbarClient(appConfig)?.entryPath;
}
