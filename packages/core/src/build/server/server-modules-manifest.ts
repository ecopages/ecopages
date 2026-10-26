import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';

export const SERVER_MODULES_MANIFEST_FILENAME = 'server-modules.json';

/**
 * Maps each server entry's root-relative source path to its emitted module,
 * relative to {@link ProductionServerModulesManifest.outdir}.
 */
export type ProductionServerModulesManifest = {
	outdir: string;
	buildId?: string;
	modules: Record<string, string>;
};

type ServerModulesManifestFile = {
	buildId?: string;
	modules: Record<string, string>;
};

export function getServerModulesManifestPath(outdir: string): string {
	return path.join(outdir, SERVER_MODULES_MANIFEST_FILENAME);
}

/**
 * Writes the production server-modules map beside the emitted modules.
 */
export function writeProductionServerModulesManifest(manifest: ProductionServerModulesManifest): void {
	fileSystem.ensureDir(manifest.outdir);
	const payload: ServerModulesManifestFile = {
		...(manifest.buildId ? { buildId: manifest.buildId } : {}),
		modules: manifest.modules,
	};
	fileSystem.write(getServerModulesManifestPath(manifest.outdir), `${JSON.stringify(payload, null, '\t')}\n`);
}

/**
 * Source keys from `dist/.server/server-modules.json`, before the app runtime exists.
 */
export function listProductionServerModuleKeysFromDist(rootDir: string, distDir: string): string[] | undefined {
	const payload = readProductionServerModulesFile(path.join(path.resolve(rootDir, distDir), '.server'));
	return payload ? Object.keys(payload.modules) : undefined;
}

function readProductionServerModulesFile(outdir: string): ServerModulesManifestFile | undefined {
	const manifestPath = getServerModulesManifestPath(outdir);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		const payload = JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerModulesManifestFile;
		if (!payload?.modules || typeof payload.modules !== 'object') {
			return undefined;
		}
		return payload;
	} catch {
		return undefined;
	}
}

/**
 * Returns the production server-modules map for this app, loading it from
 * `dist/.server/server-modules.json` when this process has not emitted one.
 */
export function loadProductionServerModules(appConfig: EcoPagesAppConfig): ProductionServerModulesManifest | undefined {
	const runtime = requireAppRuntime(appConfig);
	if (runtime.productionServerModules) {
		return runtime.productionServerModules;
	}

	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	const payload = readProductionServerModulesFile(serverOutdir);
	if (!payload) {
		return undefined;
	}

	const manifest: ProductionServerModulesManifest = {
		outdir: serverOutdir,
		buildId: payload.buildId,
		modules: payload.modules,
	};
	runtime.productionServerModules = manifest;
	return manifest;
}

/**
 * Loads the production server-modules map or throws if `ecopages build` has not written it.
 */
export function requireProductionServerModules(appConfig: EcoPagesAppConfig): ProductionServerModulesManifest {
	const manifest = loadProductionServerModules(appConfig);
	if (!manifest) {
		throw new Error('No production server-modules map. Run `ecopages build`.');
	}
	return manifest;
}

/**
 * Error when production cannot resolve a compiled server module.
 *
 * @remarks
 * Names the source file and tells the operator to run `ecopages build`. It is
 * never a compile fallback.
 */
export function missingProductionServerModuleError(sourceKey: string): Error {
	return new Error(`No compiled server module for ${sourceKey}. Run \`ecopages build\`.`);
}

function modulePathWithoutQuery(filePath: string): string {
	const query = filePath.indexOf('?');
	return query === -1 ? filePath : filePath.slice(0, query);
}

/**
 * Finds the production map key for `filePath`.
 *
 * @remarks
 * Prefers the path relative to `rootDir`. When `identity.file` still names the
 * build machine (an absolute path outside the deploy root), the longest map key
 * that is a suffix of that path wins, so a copied `dist/` can load scripts
 * resolved from that identity.
 */
export function matchProductionModuleKey(
	rootDir: string,
	filePath: string,
	modules: Record<string, string>,
): string | undefined {
	const file = modulePathWithoutQuery(filePath);
	const sourceKey = toRootRelativePath(rootDir, file);
	if (sourceKey in modules) {
		return sourceKey;
	}

	const posix = file.split(path.sep).join('/');
	let match: string | undefined;
	for (const key of Object.keys(modules)) {
		if (posix === key || posix.endsWith(`/${key}`)) {
			if (!match || key.length > match.length) {
				match = key;
			}
		}
	}
	return match;
}

/**
 * True when `ecopages build` recorded a compiled module for `filePath`.
 */
export function hasProductionServerModule(appConfig: EcoPagesAppConfig, filePath: string): boolean {
	if (!appConfig.appRuntime) {
		return false;
	}
	const manifest = loadProductionServerModules(appConfig);
	if (!manifest) {
		return false;
	}
	return matchProductionModuleKey(appConfig.rootDir, filePath, manifest.modules) !== undefined;
}
