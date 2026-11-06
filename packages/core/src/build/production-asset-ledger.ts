import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { LedgerEntry } from '../assets/asset-processing-service/processed-asset-ledger.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { getServerBundleOutputPaths } from './server-bundle-deploy-manifest.ts';
import { ensureProductionBuildId } from './production-build-id.ts';

export const PRODUCTION_ASSET_LEDGER_FILENAME = 'processed-assets.json';

type ProductionAssetLedgerFile = {
	version: 1;
	buildId: string;
	entries: LedgerEntry[];
};

function getLedgerPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getServerBundleOutputPaths(appConfig).serverOutdir, PRODUCTION_ASSET_LEDGER_FILENAME);
}

/** Writes the file dependencies this build processed to `<distDir>/server/processed-assets.json`. */
export function writeProductionAssetLedger(appConfig: EcoPagesAppConfig): void {
	const ledgerPath = getLedgerPath(appConfig);
	const payload: ProductionAssetLedgerFile = {
		version: 1,
		buildId: ensureProductionBuildId(appConfig),
		entries: requireAppRuntime(appConfig).processedAssets.serialize(),
	};
	fileSystem.ensureDir(path.dirname(ledgerPath));
	fileSystem.write(ledgerPath, `${JSON.stringify(payload, null, '\t')}\n`);
}

/**
 * Loads the record written by `ecopages build`, if the build wrote one.
 *
 * @remarks
 * Once restored, request-time asset processing serves recorded dependencies from their emitted
 * outputs and fails for an unrecorded one whose source file is missing.
 */
export function restoreProductionAssetLedger(appConfig: EcoPagesAppConfig): boolean {
	const ledgerPath = getLedgerPath(appConfig);
	if (!fileSystem.exists(ledgerPath)) return false;
	let parsed: ProductionAssetLedgerFile;
	try {
		parsed = JSON.parse(fileSystem.readFileSync(ledgerPath).toString()) as ProductionAssetLedgerFile;
		if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('unsupported ledger shape');
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not read ${path.relative(appConfig.rootDir, ledgerPath)} (${detail}). Run \`ecopages build\` again.`,
			{ cause: error },
		);
	}
	requireAppRuntime(appConfig).processedAssets.restore(parsed.entries);
	return true;
}
