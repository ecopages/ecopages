import { describe, expect, it } from 'vitest';
import { PageModuleLoaderService } from './page-module-loader.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoPageFile } from '../../types/public-types.ts';
import type { EcoPageComponent } from '../../eco/eco.types.ts';

describe('PageModuleLoaderService', () => {
	const appConfig = {
		defaultMetadata: {
			title: 'Default title',
			description: 'Default description',
		},
	} as EcoPagesAppConfig;

	it('should resolve static props via getStaticPropsForPage', async () => {
		const service = new PageModuleLoaderService(appConfig, 'http://localhost:3000');
		const result = await service.getStaticPropsForPage({
			getStaticProps: async () => ({
				props: { title: 'Page title' },
			}),
			params: { slug: 'a' },
		});

		expect(result.props).toEqual({ title: 'Page title' });
	});

	it('should merge default and dynamic metadata', async () => {
		const service = new PageModuleLoaderService(appConfig, 'http://localhost:3000');
		const metadata = await service.getMetadataPropsForPage({
			getMetadata: async ({ props }) => ({
				title: String(props.title),
				description: 'Dynamic description',
			}),
			context: {
				props: { title: 'Dynamic title' },
				appConfig,
				params: {},
				query: {},
			},
		});

		expect(metadata).toEqual({
			title: 'Dynamic title',
			description: 'Dynamic description',
		});
	});

	it('should resolve page module using provided importer and prefer component static exports', async () => {
		const service = new PageModuleLoaderService(appConfig, 'http://localhost:3000');
		const Page = (() => 'ok') as EcoPageComponent<any>;
		Page.staticProps = async () => ({ props: { from: 'component-static' } });
		Page.metadata = async () => ({
			title: 'component-metadata',
			description: 'component-description',
		});

		const module = {
			default: Page,
			getStaticProps: async () => ({ props: { from: 'module-static' } }),
			getMetadata: async () => ({ title: 'module-metadata' }),
			extra: 'integration-value',
		} as unknown as EcoPageFile;

		const result = await service.resolvePageModule({
			file: '/app/pages/index.tsx',
			importPageFileFn: async () => module,
		});

		expect(result.getStaticProps).toBe(Page.staticProps);
		expect(result.getMetadata).toBe(Page.metadata);
		expect(result.integrationSpecificProps).toEqual({ extra: 'integration-value' });
	});

	it('should resolve page data end-to-end', async () => {
		const service = new PageModuleLoaderService(appConfig, 'http://localhost:3000');
		const result = await service.resolvePageData({
			pageModule: {
				getStaticProps: async () => ({ props: { title: 'From props' } }),
				getMetadata: async ({ props }) => ({
					title: String(props.title),
					description: 'From metadata',
				}),
			},
			routeOptions: {
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			},
		});

		expect(result).toEqual({
			props: { title: 'From props' },
			metadata: { title: 'From props', description: 'From metadata' },
		});
	});
});
