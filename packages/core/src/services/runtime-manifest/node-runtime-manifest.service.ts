import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAppBuildManifest, type AppBuildManifest } from '../../build/build-manifest.ts';
import { DEFAULT_ECOPAGES_WORK_DIR, RESOLVED_ASSETS_DIR, RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { getAppEntrypointDependencyGraph } from '../runtime-state/entrypoint-dependency-graph.service.ts';
import { InMemoryRuntimeSpecifierRegistry } from '../runtime-state/runtime-specifier-registry.service.ts';

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
	buildPlugins: {
		loaderPluginNames: string[];
		runtimePluginNames: string[];
		browserBundlePluginNames: string[];
	};
	browserBundles: {
		outputDir: string;
		publicBaseUrl: string;
		vendorBaseUrl: string;
	};
	bootstrap: {
		devGraphStrategy: 'noop' | 'selective';
		runtimeSpecifierRegistry: 'in-memory' | 'custom';
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

function getRuntimeBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest({
			loaderPlugins: Array.from(appConfig.loaders.values()),
		})
	);
}

function getPluginNames(plugins: AppBuildManifest['loaderPlugins']): string[] {
	return plugins.map((plugin) => plugin.name);
}

export function createNodeRuntimeManifest(
	appConfig: EcoPagesAppConfig,
	options?: {
		entryModulePath?: string;
	},
): NodeRuntimeManifest {
	const buildManifest = getRuntimeBuildManifest(appConfig);
	const entrypointDependencyGraph = getAppEntrypointDependencyGraph(appConfig);
	const runtimeSpecifierRegistry =
		appConfig.runtime?.runtimeSpecifierRegistry ?? new InMemoryRuntimeSpecifierRegistry();

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
		buildPlugins: {
			loaderPluginNames: getPluginNames(buildManifest.loaderPlugins),
			runtimePluginNames: getPluginNames(buildManifest.runtimePlugins),
			browserBundlePluginNames: getPluginNames(buildManifest.browserBundlePlugins),
		},
		browserBundles: {
			outputDir: path.join(appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR),
			publicBaseUrl: `/${RESOLVED_ASSETS_DIR}`,
			vendorBaseUrl: `/${RESOLVED_ASSETS_VENDORS_DIR}`,
		},
		bootstrap: {
			devGraphStrategy: entrypointDependencyGraph.supportsSelectiveInvalidation() ? 'selective' : 'noop',
			runtimeSpecifierRegistry:
				runtimeSpecifierRegistry instanceof InMemoryRuntimeSpecifierRegistry ? 'in-memory' : 'custom',
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
