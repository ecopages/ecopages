import { createRequire } from 'node:module';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { ResolvedLazyTrigger } from '../../../types/public-types.ts';
import {
	AssetFactory,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import { buildGlobalInjectorBootstrapContent, buildGlobalInjectorMapScript } from '../../../eco/global-injector-map.ts';

/**
 * Builds processed global-injector map and bootstrap assets for resolved lazy triggers.
 */
export async function buildGlobalInjectorAssets(
	appConfig: EcoPagesAppConfig,
	assetProcessingService: AssetProcessingService,
	triggers: ResolvedLazyTrigger[],
	currentIntegrationName: string,
): Promise<ProcessedAsset[]> {
	const appProjectDir = appConfig.rootDir ?? appConfig.absolutePaths?.projectDir ?? process.cwd();
	const appPackageRequire = createRequire(path.join(appProjectDir, 'package.json'));
	const corePackageEntryPath = appPackageRequire.resolve('@ecopages/core');
	const globalInjectorImportPath = createRequire(corePackageEntryPath).resolve('@ecopages/scripts-injector/global');

	const mapScript = AssetFactory.createInlineContentScript({
		position: 'head',
		name: 'ecopages-global-injector-map',
		content: buildGlobalInjectorMapScript(triggers),
		attributes: { type: 'ecopages/global-injector-map' },
		packageRole: 'keep-separate',
		bundle: false,
	});
	const bootstrapInlineScript = AssetFactory.createInlineContentScript({
		position: 'head',
		name: 'ecopages-global-injector-bootstrap',
		content: buildGlobalInjectorBootstrapContent(globalInjectorImportPath),
		attributes: { type: 'module' },
		packageRole: 'keep-separate',
		bundle: true,
	});

	return assetProcessingService.processDependencies([mapScript, bootstrapInlineScript], currentIntegrationName);
}
