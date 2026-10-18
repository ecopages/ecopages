import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../constants.ts';

export const createMockConfig = (overrides: Partial<EcoPagesAppConfig> = {}): EcoPagesAppConfig => {
	const integrations = (overrides.integrations ?? []).map((integration) => ({
		...integration,
		setup: integration.setup ?? (async () => {}),
		teardown: integration.teardown ?? (async () => {}),
	}));
	return {
		rootDir: '/test/project',
		distDir: 'dist',
		workDir: DEFAULT_ECOPAGES_WORK_DIR,
		srcDir: 'src',
		defaultMetadata: {
			title: 'Test',
			description: 'Test site',
		},
		robotsTxt: {
			preferences: {
				'*': ['/admin', '/private'],
				Googlebot: ['/no-google'],
			},
		},
		sitemap: {
			enabled: false,
			fileName: 'sitemap.xml',
			extraUrls: [],
			exclude: [],
		},
		absolutePaths: {
			distDir: '/test/project/dist',
			workDir: '/test/project/.eco',
		} as EcoPagesAppConfig['absolutePaths'],
		processors: new Map(),
		...overrides,
		integrations,
		appRuntime:
			overrides.appRuntime ??
			({
				integrationActivations: new Map(),
			} as unknown as EcoPagesAppConfig['appRuntime']),
	} as unknown as EcoPagesAppConfig;
};
