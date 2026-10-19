import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { appLogger } from '../global/app-logger.ts';
import { StaticSiteGenerator } from './static-site-generator.ts';
import { createMockConfig } from './static-site-generator.test-utils.ts';
import { disposeDevResources } from '../adapters/shared/runtime/runtime-server-lifecycle.ts';

const graphBuildOrder: string[] = [];
const ensurePagesUnifiedGraphBuiltMock = vi.hoisted(() =>
	vi.fn(async () => {
		graphBuildOrder.push('ensurePagesUnifiedGraphBuilt');
	}),
);

vi.mock('../build/cache/pages-unified-graph-build.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../build/cache/pages-unified-graph-build.ts')>();
	return {
		...actual,
		ensurePagesUnifiedGraphBuilt: ensurePagesUnifiedGraphBuiltMock,
		shouldBuildPagesUnifiedGraph: vi.fn(() => true),
	};
});

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;

type StaticGenerationRunnerInput = Parameters<StaticSiteGenerator['run']>[0];
type StaticGenerationRendererFactory = NonNullable<StaticGenerationRunnerInput['routeRendererFactory']>;

describe('StaticSiteGenerator Integration lifecycle', () => {
	let writeMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		graphBuildOrder.length = 0;
		ensurePagesUnifiedGraphBuiltMock.mockClear();
		fileSystem.ensureDir = vi.fn() as typeof fileSystem.ensureDir;
		writeMock = vi.fn();
		fileSystem.write = writeMock as typeof fileSystem.write;
		vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
	});

	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		vi.restoreAllMocks();
	});

	test('sets up Integrations before discovering static routes', async () => {
		let integrationReady = false;
		const listStaticGenerationRoutes = vi.fn(async () => {
			expect(integrationReady).toBe(true);
			return [];
		});
		const ssg = new StaticSiteGenerator({
			appConfig: createMockConfig({
				integrations: [
					{
						name: 'test',
						setup: async () => {
							integrationReady = true;
						},
					},
				] as unknown as EcoPagesAppConfig['integrations'],
			}),
		});

		await ssg.run({
			router: { listStaticGenerationRoutes } satisfies StaticGenerationRunnerInput['router'],
			baseUrl: 'http://localhost:3000',
		});

		expect(listStaticGenerationRoutes).toHaveBeenCalledTimes(1);
	});

	test('awaits every release in reverse order after the pages are written', async () => {
		const events: string[] = [];
		writeMock.mockImplementation((filePath: string) => {
			if (filePath.endsWith('robots.txt')) events.push('write robots.txt');
		});
		const integrations = ['first', 'second'].map((name) => ({
			name,
			extensions: [`.${name}.tsx`],
			staticExport: async () => {
				events.push(`start ${name}`);
				return async () => {
					events.push(`release ${name}`);
				};
			},
		}));
		const ssg = new StaticSiteGenerator({
			appConfig: createMockConfig({ integrations: integrations as unknown as EcoPagesAppConfig['integrations'] }),
		});

		await ssg.run({
			router: { listStaticGenerationRoutes: vi.fn(async () => []) },
			baseUrl: 'http://localhost:3000',
		});

		expect(events).toEqual(['start first', 'start second', 'write robots.txt', 'release second', 'release first']);
	});

	test('tears down Integrations after export resources are released', async () => {
		const events: string[] = [];
		const integration = {
			name: 'test',
			extensions: ['.test.tsx'],
			setup: async () => {
				events.push('setup');
			},
			staticExport: async () => async () => {
				events.push('release');
			},
			teardown: async () => {
				events.push('teardown');
			},
		};
		const listStaticGenerationRoutes = vi.fn(async () => {
			events.push('routes');
			return [];
		});
		const appConfig = createMockConfig({
			integrations: [integration] as unknown as EcoPagesAppConfig['integrations'],
		});
		const ssg = new StaticSiteGenerator({ appConfig });

		await ssg.run({
			router: { listStaticGenerationRoutes } satisfies StaticGenerationRunnerInput['router'],
			baseUrl: 'http://localhost:3000',
		});
		await disposeDevResources({
			appConfig,
		});

		expect(events).toEqual(['setup', 'routes', 'release', 'teardown']);
		expect(appConfig.appRuntime?.integrationActivations.size).toBe(0);
	});

	test('tears down Integrations when route discovery fails', async () => {
		const events: string[] = [];
		const integration = {
			name: 'test',
			extensions: ['.test.tsx'],
			setup: async () => {
				events.push('setup');
			},
			teardown: async () => {
				events.push('teardown');
			},
		};
		const appConfig = createMockConfig({
			integrations: [integration] as unknown as EcoPagesAppConfig['integrations'],
		});
		const ssg = new StaticSiteGenerator({ appConfig });

		await expect(
			ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => {
						throw new Error('route discovery failed');
					}),
				},
				baseUrl: 'http://localhost:3000',
			}),
		).rejects.toThrow('route discovery failed');

		expect(events).toEqual(['setup', 'teardown']);
		expect(appConfig.appRuntime?.integrationActivations.size).toBe(0);
	});

	test('releases resources and tears down Integrations when generation fails', async () => {
		const events: string[] = [];
		const integrations = ['first', 'second'].map((name) => ({
			name,
			extensions: [`.${name}.tsx`],
			setup: async () => {
				events.push(`setup ${name}`);
			},
			staticExport: async () => {
				events.push(`start ${name}`);
				return async () => {
					events.push(`release ${name}`);
				};
			},
			teardown: async () => {
				events.push(`teardown ${name}`);
			},
		}));
		const ssg = new StaticSiteGenerator({
			appConfig: createMockConfig({ integrations: integrations as unknown as EcoPagesAppConfig['integrations'] }),
		});

		await expect(
			ssg.run({
				router: { listStaticGenerationRoutes: vi.fn(async () => []) },
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
				errorPageLoaders: {
					notFound: async () => {
						throw new Error('broken not-found view');
					},
				},
			}),
		).rejects.toThrow('broken not-found view');

		expect(events).toEqual([
			'setup first',
			'setup second',
			'start first',
			'start second',
			'release second',
			'release first',
			'teardown first',
			'teardown second',
		]);
	});

	test('preserves the generation error when Integration teardown also fails', async () => {
		const events: string[] = [];
		const teardownError = new Error('Integration teardown failed');
		const integration = {
			name: 'test',
			extensions: ['.test.tsx'],
			setup: async () => {
				events.push('setup');
			},
			staticExport: async () => async () => {
				events.push('release');
			},
			teardown: async () => {
				events.push('teardown');
				throw teardownError;
			},
		};
		const ssg = new StaticSiteGenerator({
			appConfig: createMockConfig({
				integrations: [integration] as unknown as EcoPagesAppConfig['integrations'],
			}),
		});

		let failure: unknown;
		try {
			await ssg.run({
				router: { listStaticGenerationRoutes: vi.fn(async () => []) },
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
				errorPageLoaders: {
					notFound: async () => {
						throw new Error('generation failed');
					},
				},
			});
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toEqual([
			expect.objectContaining({ message: 'generation failed' }),
			teardownError,
		]);
		expect((failure as Error & { cause: unknown }).cause).toMatchObject({ message: 'generation failed' });
		expect(events).toEqual(['setup', 'release', 'teardown']);
	});

	test('releases acquired exports when a later Integration fails to start', async () => {
		const events: string[] = [];
		const first = {
			name: 'first',
			extensions: ['.first.tsx'],
			setup: async () => {
				events.push('setup first');
			},
			staticExport: async () => {
				events.push('start first');
				return async () => {
					events.push('release first');
				};
			},
			teardown: async () => {
				events.push('teardown first');
			},
		};
		const failing = {
			name: 'failing',
			extensions: ['.failing.tsx'],
			setup: async () => {
				events.push('setup failing');
			},
			staticExport: async () => {
				throw new Error('worker did not start');
			},
			teardown: async () => {
				events.push('teardown failing');
			},
		};
		const ssg = new StaticSiteGenerator({
			appConfig: createMockConfig({
				integrations: [first, failing] as unknown as EcoPagesAppConfig['integrations'],
			}),
		});

		await expect(
			ssg.run({
				router: { listStaticGenerationRoutes: vi.fn(async () => []) },
				baseUrl: 'http://localhost:3000',
			}),
		).rejects.toThrow('worker did not start');

		expect(events).toEqual([
			'setup first',
			'setup failing',
			'start first',
			'release first',
			'teardown first',
			'teardown failing',
		]);
	});

	test('logs a failing release and still releases the others', async () => {
		const events: string[] = [];
		const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const integrations = [
			{
				name: 'failing',
				extensions: ['.failing.tsx'],
				staticExport: async () => async () => {
					throw new Error('worker would not stop');
				},
			},
			{
				name: 'first',
				extensions: ['.first.tsx'],
				staticExport: async () => async () => {
					events.push('release first');
				},
			},
		] as unknown as EcoPagesAppConfig['integrations'];
		const ssg = new StaticSiteGenerator({ appConfig: createMockConfig({ integrations }) });

		await ssg.run({
			router: { listStaticGenerationRoutes: vi.fn(async () => []) },
			baseUrl: 'http://localhost:3000',
		});

		expect(events).toEqual(['release first']);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ message: 'worker would not stop' }),
		);
	});
});
