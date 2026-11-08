import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { SerializedProcessedAssetLedger } from '../assets/asset-processing-service/processed-asset-ledger.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { isPathStrictlyInside } from '../utils/path-containment.ts';
import { toRootRelativePath } from '../utils/root-relative-path.ts';
import { getServerBundleOutputPaths } from './server-bundle-deploy-manifest.ts';
import { ensureProductionBuildId } from './production-build-id.ts';

export const PRODUCTION_ASSET_LEDGER_FILENAME = 'processed-assets.json';

/** The route-shaped browser manifest earlier versions wrote instead of the asset ledger. */
const LEGACY_BROWSER_CLIENT_MANIFEST_FILENAME = 'browser-client-manifest.json';

/**
 * Everything a production build emitted for the browser, as `ecopages start` restores it.
 *
 * @remarks
 * Paths are relative to the app root with POSIX separators, and HTML module-script URLs are keyed by their
 * root-relative source, so the file serves a build moved to another folder or platform.
 */
export type ProductionAssetLedgerFile = SerializedProcessedAssetLedger & {
	version: 4;
	buildId: string;
	htmlPageModuleScriptUrls: Record<string, string>;
};

function getLedgerPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getServerBundleOutputPaths(appConfig).serverOutdir, PRODUCTION_ASSET_LEDGER_FILENAME);
}

/**
 * Writes the app runtime's asset ledger, with the HTML module-script URLs of the same build, to
 * `<distDir>/server/processed-assets.json`.
 *
 * @remarks
 * The production prebuild writes it right after the app-wide browser build, so the Lit static-render worker can
 * restore it during the export, and the build writes it again once rendering has processed every file dependency.
 */
export function writeProductionAssetLedger(
	appConfig: EcoPagesAppConfig,
	htmlPageModuleScriptUrls: ReadonlyMap<string, string>,
): void {
	const runtime = requireAppRuntime(appConfig);
	const payload: ProductionAssetLedgerFile = {
		version: 4,
		buildId: ensureProductionBuildId(appConfig),
		...runtime.processedAssets.serialize(),
		htmlPageModuleScriptUrls: Object.fromEntries(
			[...htmlPageModuleScriptUrls]
				.map(([filePath, url]) => [toRootRelativePath(appConfig.rootDir, filePath), url] as const)
				.sort(([left], [right]) => left.localeCompare(right)),
		),
	};
	const ledgerPath = getLedgerPath(appConfig);
	fileSystem.ensureDir(path.dirname(ledgerPath));
	fileSystem.write(ledgerPath, `${JSON.stringify(payload, null, '\t')}\n`);
}

/** Removes the file a previous build wrote, so a failed build cannot leave it for `ecopages start`. */
export function clearProductionAssetLedger(appConfig: EcoPagesAppConfig): void {
	fileSystem.remove(getLedgerPath(appConfig));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLedgerFile(value: unknown): value is ProductionAssetLedgerFile {
	return (
		isRecord(value) &&
		value.version === 4 &&
		typeof value.buildId === 'string' &&
		Array.isArray(value.entries) &&
		value.entries.every((entry) => isRecord(entry) && typeof entry.key === 'string' && isRecord(entry.asset)) &&
		(value.browserOutputs === undefined || isStringArray(value.browserOutputs)) &&
		isRecord(value.htmlPageModuleScriptUrls) &&
		Object.values(value.htmlPageModuleScriptUrls).every((url) => typeof url === 'string')
	);
}

function readProductionAssetLedger(appConfig: EcoPagesAppConfig): ProductionAssetLedgerFile | undefined {
	const ledgerPath = getLedgerPath(appConfig);
	if (!fileSystem.exists(ledgerPath)) {
		const legacyManifestPath = path.join(path.dirname(ledgerPath), LEGACY_BROWSER_CLIENT_MANIFEST_FILENAME);
		if (fileSystem.exists(legacyManifestPath)) {
			throw new Error(
				`${path.relative(appConfig.rootDir, legacyManifestPath)} was written by an earlier version of Ecopages. Run \`ecopages build\` again.`,
			);
		}
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(ledgerPath).toString());
		if (!isLedgerFile(parsed)) throw new Error('unsupported ledger shape');
		return parsed;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not read ${path.relative(appConfig.rootDir, ledgerPath)} (${detail}). Run \`ecopages build\` again.`,
			{ cause: error },
		);
	}
}

function assertOutputsExist(appConfig: EcoPagesAppConfig, ledger: ProductionAssetLedgerFile): void {
	const htmlOutputs = Object.values(ledger.htmlPageModuleScriptUrls).map((url) =>
		path.resolve(appConfig.absolutePaths.distDir, url.replace(/^\/+/, '').split(/[?#]/, 1)[0] ?? ''),
	);
	const outputs = (ledger.browserOutputs ?? []).map((output) => path.resolve(appConfig.rootDir, output));
	for (const outputPath of [...outputs, ...htmlOutputs]) {
		if (!isPathStrictlyInside(outputPath, appConfig.absolutePaths.distDir) || !fileSystem.exists(outputPath)) {
			throw new Error(
				`The production asset ledger references missing output ${toRootRelativePath(appConfig.rootDir, outputPath)}. Run \`ecopages build\` again.`,
			);
		}
	}
}

/**
 * Loads the record written by `ecopages build` into the app runtime's ledger, if the build wrote one.
 *
 * @remarks
 * Once restored, asset processing serves every script the app-wide browser build bundled from its emitted
 * output. Returns the HTML module-script URLs, by absolute source path.
 */
export function restoreProductionAssetLedger(
	appConfig: EcoPagesAppConfig,
): { htmlPageModuleScriptUrls: Map<string, string> } | undefined {
	const ledger = readProductionAssetLedger(appConfig);
	if (!ledger) return undefined;
	assertOutputsExist(appConfig, ledger);
	requireAppRuntime(appConfig).processedAssets.restore(ledger);
	return {
		htmlPageModuleScriptUrls: new Map(
			Object.entries(ledger.htmlPageModuleScriptUrls).map(([filePath, url]) => [
				path.resolve(appConfig.rootDir, filePath),
				url,
			]),
		),
	};
}
