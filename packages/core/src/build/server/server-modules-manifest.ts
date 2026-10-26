import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';

export const SERVER_MODULES_MANIFEST_FILENAME = 'server-modules.json';

/**
 * Maps each server entry's root-relative source path to its emitted module,
 * relative to {@link ProductionServerModulesManifest.outdir}.
 */
export type ProductionServerModulesManifest = {
	outdir: string;
	modules: Record<string, string>;
};

type ServerModulesManifestFile = {
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
	const payload: ServerModulesManifestFile = { modules: manifest.modules };
	fileSystem.write(getServerModulesManifestPath(manifest.outdir), `${JSON.stringify(payload, null, '\t')}\n`);
}

function readProductionServerModulesFile(outdir: string): Record<string, string> | undefined {
	const manifestPath = getServerModulesManifestPath(outdir);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		const payload = JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerModulesManifestFile;
		if (!payload?.modules || typeof payload.modules !== 'object') {
			return undefined;
		}
		return payload.modules;
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
	const modules = readProductionServerModulesFile(serverOutdir);
	if (!modules) {
		return undefined;
	}

	const manifest: ProductionServerModulesManifest = { outdir: serverOutdir, modules };
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
