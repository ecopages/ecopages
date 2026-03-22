import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../../constants.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';

const NODE_RUNTIME_MANIFEST_DIRNAME = 'runtime';
const NODE_RUNTIME_MANIFEST_FILENAME = 'node-runtime-manifest.json';

export interface NodeRuntimeManifest {
	runtime: 'node';
	appRootDir: string;
	sourceRootDir: string;
	distDir: string;
	workDir?: string;
	modulePaths: {
		config: string;
		entry?: string;
	};
}

/**
 * Returns the default file handoff location for the Node runtime manifest.
 */
export function getNodeRuntimeManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(resolveWorkDir(appConfig), NODE_RUNTIME_MANIFEST_DIRNAME, NODE_RUNTIME_MANIFEST_FILENAME);
}

function resolveWorkDir(appConfig: Pick<EcoPagesAppConfig, 'rootDir' | 'workDir' | 'absolutePaths'>): string {
	return (
		appConfig.absolutePaths?.workDir ?? path.join(appConfig.rootDir, appConfig.workDir ?? DEFAULT_ECOPAGES_WORK_DIR)
	);
}

export function createNodeRuntimeManifest(
	appConfig: EcoPagesAppConfig,
	options?: {
		entryModulePath?: string;
	},
): NodeRuntimeManifest {
	return {
		runtime: 'node',
		appRootDir: appConfig.rootDir,
		sourceRootDir: appConfig.absolutePaths.srcDir,
		distDir: appConfig.absolutePaths.distDir,
		workDir: resolveWorkDir(appConfig),
		modulePaths: {
			config: appConfig.absolutePaths.config,
			...(options?.entryModulePath ? { entry: options.entryModulePath } : {}),
		},
	};
}

/**
 * Serializes a Node runtime manifest to the file boundary used by the thin host.
 */
export function writeNodeRuntimeManifestFile(manifest: NodeRuntimeManifest, manifestFilePath: string): string {
	mkdirSync(path.dirname(manifestFilePath), { recursive: true });
	writeFileSync(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
	return manifestFilePath;
}

/**
 * Derives the app-owned Node manifest and writes it to the runtime handoff path.
 */
export function writeAppNodeRuntimeManifest(
	appConfig: EcoPagesAppConfig,
	options?: {
		entryModulePath?: string;
		manifestFilePath?: string;
	},
): {
	manifest: NodeRuntimeManifest;
	manifestFilePath: string;
} {
	const manifest = createNodeRuntimeManifest(appConfig, {
		entryModulePath: options?.entryModulePath,
	});
	const manifestFilePath = writeNodeRuntimeManifestFile(
		manifest,
		options?.manifestFilePath ?? getNodeRuntimeManifestPath(appConfig),
	);

	return {
		manifest,
		manifestFilePath,
	};
}

export function getAppNodeRuntimeManifest(appConfig: EcoPagesAppConfig): NodeRuntimeManifest {
	return appConfig.runtime?.nodeRuntimeManifest ?? createNodeRuntimeManifest(appConfig);
}

export function setAppNodeRuntimeManifest(
	appConfig: EcoPagesAppConfig,
	nodeRuntimeManifest: NodeRuntimeManifest,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		nodeRuntimeManifest,
	};
}
