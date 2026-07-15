import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { createBuildInputsFingerprint } from './build-input-fingerprint.ts';
import { writeProductionCacheManifest, readProductionCacheManifest } from './production-build-cache.ts';
import { getCorePackageVersion } from '../services/module-loading/route-module-build-manifest.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import {
	getAppPageBrowserGraphSession,
	type GraphPolicy,
	type GraphRecord,
} from '../route-renderer/orchestration/page-browser-graph-session.ts';

export const PAGES_BROWSER_GRAPH_CACHE_DIR = '.browser-pages-graph';
export const PAGES_BROWSER_GRAPH_CACHE_FILENAME = '.build-cache.json';

export type PagesBrowserGraphManifestEntry = {
	integrationName: string;
	routeFile: string;
	entryFingerprint: string;
	entryAssetPaths: string[];
	chunkAssetPaths: string[];
};

export type PagesBrowserGraphManifest = {
	invalidationVersion: string;
	buildInputsFingerprint: string;
	builtAt: number;
	graphs: Record<string, PagesBrowserGraphManifestEntry>;
};

function getPagesBrowserGraphManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(
		resolveInternalExecutionDir(appConfig),
		PAGES_BROWSER_GRAPH_CACHE_DIR,
		PAGES_BROWSER_GRAPH_CACHE_FILENAME,
	);
}

function serializeManifestEntry(record: GraphRecord): PagesBrowserGraphManifestEntry {
	return {
		integrationName: record.key.integrationName,
		routeFile: record.key.routeFile,
		entryFingerprint: record.key.entryFingerprint,
		entryAssetPaths: record.result.entryAssets
			.map((asset) => asset.filepath ?? asset.srcUrl)
			.filter((value): value is string => typeof value === 'string'),
		chunkAssetPaths: record.result.chunkAssets
			.map((asset) => asset.filepath ?? asset.srcUrl)
			.filter((value): value is string => typeof value === 'string'),
	};
}

/**
 * Returns whether production Page Browser Graph manifests should be persisted.
 */
export function shouldPersistPagesBrowserGraphManifest(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Commits production Page Browser Graph records after a successful build transaction.
 */
export function commitPagesBrowserGraphManifest(appConfig: EcoPagesAppConfig, policy: GraphPolicy = 'production'): void {
	if (!shouldPersistPagesBrowserGraphManifest()) {
		return;
	}

	const session = getAppPageBrowserGraphSession(appConfig);
	const graphs: Record<string, PagesBrowserGraphManifestEntry> = {};

	for (const record of session.exportRecords(policy)) {
		graphs[path.resolve(record.key.routeFile)] = serializeManifestEntry(record);
	}

	if (Object.keys(graphs).length === 0) {
		return;
	}

	const manifest: PagesBrowserGraphManifest = {
		invalidationVersion: getCorePackageVersion(),
		buildInputsFingerprint: createBuildInputsFingerprint(appConfig),
		builtAt: Date.now(),
		graphs,
	};

	writeProductionCacheManifest(getPagesBrowserGraphManifestPath(appConfig), manifest);
}

/**
 * Reads the committed production Page Browser Graph manifest when present.
 */
export function readPagesBrowserGraphManifest(appConfig: EcoPagesAppConfig): PagesBrowserGraphManifest | undefined {
	return readProductionCacheManifest<PagesBrowserGraphManifest>(getPagesBrowserGraphManifestPath(appConfig));
}

/**
 * Clears staged production graph records without writing a manifest.
 */
export function clearPagesBrowserGraphManifest(appConfig: EcoPagesAppConfig, policy: GraphPolicy = 'production'): void {
	getAppPageBrowserGraphSession(appConfig).clearPolicyRecords(policy);
	const manifestPath = getPagesBrowserGraphManifestPath(appConfig);
	if (fileSystem.exists(manifestPath)) {
		fileSystem.remove(manifestPath);
	}
}

/**
 * Prebuilds production Page Browser Graphs for the supplied static route files.
 */
export async function prebuildProductionPageBrowserGraphs(
	routeFiles: readonly string[],
	routeRendererFactory: PageRendererResolver,
): Promise<void> {
	const uniqueRouteFiles = [...new Set(routeFiles.map((routeFile) => path.resolve(routeFile)))].sort((left, right) =>
		left.localeCompare(right),
	);

	for (const routeFile of uniqueRouteFiles) {
		const renderer = routeRendererFactory.getPageRenderer(routeFile) as IntegrationRenderer<unknown>;
		await renderer.prebuildProductionPageBrowserGraph(routeFile);
	}
}
