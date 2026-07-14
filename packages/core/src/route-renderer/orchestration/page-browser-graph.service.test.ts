import { afterEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { PageBrowserGraphService } from './page-browser-graph.service.ts';

const appConfig = {
	integrations: [{ name: 'react', extensions: ['.tsx'] }],
	absolutePaths: {
		pagesDir: '/app/pages',
	},
} as unknown as EcoPagesAppConfig;

function createGroupedDependency(): AssetDefinition {
	return {
		kind: 'script',
		source: 'content',
		content: 'console.log("hydrate")',
		name: 'page-entry',
		groupedBundle: { id: 'react-router-pages', entryName: 'index' },
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

test('PageBrowserGraphService warns when grouped assets lose groupedBundle metadata', async () => {
	vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx']);
	const warnSpy = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			filepath: '/assets/index.js',
			kind: 'script',
			inline: false,
		},
	]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;

	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const result = await service.resolvePageBrowserGraph({
		routeFile: '/app/pages/index.tsx',
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [createGroupedDependency()],
		}),
	});

	expect(result?.entryAssets).toEqual([]);
	expect(warnSpy).toHaveBeenCalledWith(
		'Grouped page-browser assets for /app/pages/index.tsx are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.',
	);
});
