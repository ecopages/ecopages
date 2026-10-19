import { describe, expect, it } from 'vitest';
import { PageModuleLoaderService } from './page-module-loader.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcoPageFile, GetMetadata } from '../../types/contracts.ts';
import type { EcoPageComponent } from '../../types/eco-api-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import type { AppModuleLoaderContract } from '../../build/server/app-module-loader.service.ts';

describe('PageModuleLoaderService', () => {
	const appConfig = {
		rootDir: '/app',
		defaultMetadata: {
			title: 'Default title',
			description: 'Default description',
		},
		appRuntime: {
			origin: 'http://localhost:3000',
		},
	} as unknown as EcoPagesAppConfig;

	it('should resolve static props via getStaticPropsForPage', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const result = await service.getStaticPropsForPage({
			getStaticProps: async () => ({
				props: { title: 'Page title' },
			}),
			params: { slug: 'a' },
		});

		expect(result.props).toEqual({ title: 'Page title' });
	});

	it('should preserve HttpError from getStaticProps', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const notFound = HttpError.NotFound('Unknown docs entry');

		await expect(
			service.getStaticPropsForPage({
				getStaticProps: async () => {
					throw notFound;
				},
			}),
		).rejects.toBe(notFound);
	});

	it('should preserve duck-typed HttpError from page bundles', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const foreignNotFound = Object.assign(new Error('Unknown docs entry'), {
			name: 'HttpError',
			status: 404,
		});

		await expect(
			service.getStaticPropsForPage({
				getStaticProps: async () => {
					throw foreignNotFound;
				},
			}),
		).rejects.toBe(foreignNotFound);
	});

	it('should wrap unexpected getStaticProps failures', async () => {
		const service = new PageModuleLoaderService(appConfig);

		await expect(
			service.getStaticPropsForPage({
				getStaticProps: async () => {
					throw new Error('boom');
				},
			}),
		).rejects.toThrow('Error fetching static props: boom');
	});

	it('should merge default and dynamic metadata', async () => {
		const service = new PageModuleLoaderService({
			...appConfig,
			defaultMetadata: { ...appConfig.defaultMetadata, image: '/default.png' },
		});
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
			image: '/default.png',
		});
	});

	it('should resolve page module using provided importer and prefer component static exports', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const Page = (() => 'ok') as EcoPageComponent<any>;
		Page.staticProps = async () => ({ props: { from: 'component-static' } });
		Page.metadata = async () => ({
			title: 'component-metadata',
			description: 'component-description',
		});

		const module = {
			default: Page,
			getStaticProps: async () => ({ props: { from: 'module-static' } }),
			getMetadata: async () => ({
				title: 'module-metadata',
				description: 'module-description',
			}),
			extra: 'integration-value',
		} satisfies EcoPageFile<{ extra: string }>;

		const result = await service.resolvePageModule({
			file: '/app/pages/index.tsx',
			importPageFileFn: async () => module,
		});

		expect(result.getStaticProps).toBe(Page.staticProps);
		expect(result.getMetadata).toBe(Page.metadata);
		expect(result.integrationSpecificProps).toEqual({ extra: 'integration-value' });
		expect(result.module).toBe(module);
	});

	it('should resolve page data end-to-end', async () => {
		const service = new PageModuleLoaderService(appConfig);
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

	it('should give metadata the props passed with the render over static props', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const result = await service.resolvePageData({
			pageModule: {
				getStaticProps: async () => ({ props: { title: 'Static', kept: 'static' } }),
				getMetadata: async ({ props }) => ({ title: String(props.title), description: String(props.kept) }),
			},
			routeOptions: {
				file: '/app/views/latest.kita.tsx',
				params: {},
				query: {},
				props: { title: 'Explicit' },
			},
		});

		expect(result).toEqual({
			props: { title: 'Explicit', kept: 'static' },
			metadata: { title: 'Explicit', description: 'static' },
		});
	});

	it('should pass explicit render props to metadata', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const result = await service.resolvePageData({
			pageModule: {
				getMetadata: async ({ props }) => ({
					title: String((props.release as { title: string }).title),
					description: 'Release',
				}),
			},
			routeOptions: {
				file: '/app/views/latest.kita.tsx',
				params: {},
				query: {},
				props: { release: { title: '1.2.0' } },
			},
		});

		expect(result.metadata.title).toBe('1.2.0');
		expect(result.metadata.description).toBe('Release');
	});

	it('keeps metadata active when static props are skipped', async () => {
		const service = new PageModuleLoaderService(appConfig);
		const getMetadata = async ({ params }: Parameters<GetMetadata>[0]) => ({
			title: String(params.slug),
			description: 'Route metadata',
		});
		const result = await service.resolvePageData({
			pageModule: { getMetadata },
			routeOptions: {
				file: '/app/pages/products/[slug].tsx',
				params: { slug: 'new-product' },
				query: {},
				skipStaticProps: true,
			},
		});

		expect(result).toEqual({
			props: {},
			metadata: { title: 'new-product', description: 'Route metadata' },
		});
	});

	it('should import page files through the app-owned module loader', async () => {
		const calls: Array<unknown> = [];
		const expectedModule = {
			default: (() => 'ok') as EcoPageComponent<any>,
		} as EcoPageFile;
		const service = new PageModuleLoaderService({
			...appConfig,
			appRuntime: {
				origin: 'http://localhost:3000',
				moduleLoader: {
					async importModule<T = unknown>(options: unknown): Promise<T> {
						calls.push(options);
						return expectedModule as T;
					},
					invalidateDevelopmentGraph(): void {
						return;
					},
					getDevelopmentGeneration: () => 0,
				} satisfies AppModuleLoaderContract,
			},
		} as unknown as EcoPagesAppConfig);

		const result = await service.importPageFile('/app/src/pages/index.tsx');

		expect(result).toBe(expectedModule);
		expect(calls).toEqual([
			{
				filePath: '/app/src/pages/index.tsx',
				outdir: '/app/.eco/.server-modules',
				bypassCache: undefined,
				transpileErrorMessage: expect.any(Function),
				noOutputMessage: expect.any(Function),
			},
		]);
	});

	it('keeps the original import failure as the cause of the import error', async () => {
		const original = new Error('x');
		const service = new PageModuleLoaderService({
			...appConfig,
			appRuntime: {
				origin: 'http://localhost:3000',
				moduleLoader: {
					async importModule(): Promise<never> {
						throw original;
					},
					invalidateDevelopmentGraph(): void {
						return;
					},
					getDevelopmentGeneration: () => 0,
				} satisfies AppModuleLoaderContract,
			},
		} as unknown as EcoPagesAppConfig);

		const failure = await service.importPageFile('/app/src/pages/broken.tsx').catch((error: unknown) => error);

		expect((failure as Error).message).toBe('[ecopages] Error importing page file: Error: x');
		expect((failure as Error).cause).toBe(original);
		expect(((failure as Error).cause as Error).stack).toContain('Error: x');
	});

	it('should reuse a preloaded page module without importing again', async () => {
		const calls: Array<unknown> = [];
		const expectedModule = {
			default: (() => 'ok') as EcoPageComponent<any>,
		} as EcoPageFile;
		const service = new PageModuleLoaderService({
			...appConfig,
			appRuntime: {
				origin: 'http://localhost:3000',
				moduleLoader: {
					async importModule<T = unknown>(options: unknown): Promise<T> {
						calls.push(options);
						return expectedModule as T;
					},
					invalidateDevelopmentGraph(): void {
						return;
					},
					getDevelopmentGeneration: () => 0,
				} satisfies AppModuleLoaderContract,
			},
		} as unknown as EcoPagesAppConfig);

		const resolved = await service.resolvePageModule({
			file: '/app/src/pages/index.tsx',
			pageModule: expectedModule,
		});

		expect(resolved.module).toBe(expectedModule);
		expect(calls).toEqual([]);
	});
});
