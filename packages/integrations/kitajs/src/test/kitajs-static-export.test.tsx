import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsx as kitaJsx } from '@kitajs/html/jsx-runtime';
import type { EcoComponent, EcoPageComponent, EcoPageFile, HtmlTemplateProps } from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/integration';
import { RouteRendererFactory } from '@ecopages/core/integration';
import { createTestAppConfig } from '@ecopages/testing';
import { StaticSiteGenerator } from '../../../../core/src/static-site-generator/static-site-generator.ts';
import type { StaticGenerationRoute } from '../../../../core/src/router/server/route-registry.ts';
import { KitaRenderer } from '../kitajs-renderer.ts';

const availableParallelismMock = vi.hoisted(() => vi.fn(() => 3));
const shouldBuildPagesUnifiedGraphMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>();
	return { ...actual, availableParallelism: availableParallelismMock };
});

vi.mock('../../../../core/src/build/cache/pages-unified-graph-build.ts', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../../../core/src/build/cache/pages-unified-graph-build.ts')>();
	return { ...actual, shouldBuildPagesUnifiedGraph: shouldBuildPagesUnifiedGraphMock };
});

const temporaryRoots: string[] = [];

afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('Kita static export', () => {
	it('renders pages of one Integration concurrently and exports both', async () => {
		availableParallelismMock.mockReturnValue(3);
		const rootDir = mkdtempSync(path.join(tmpdir(), 'ecopages-kita-static-export-'));
		temporaryRoots.push(rootDir);

		let releaseBarrier!: () => void;
		const renderBarrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});
		let pagesWaitingAtBarrier = 0;
		let maxPagesAtBarrier = 0;
		const waitForBothPages = async () => {
			pagesWaitingAtBarrier += 1;
			maxPagesAtBarrier = Math.max(maxPagesAtBarrier, pagesWaitingAtBarrier);
			if (pagesWaitingAtBarrier === 2) {
				releaseBarrier();
			}
			let timeout: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					renderBarrier,
					new Promise<never>((_resolve, reject) => {
						timeout = setTimeout(
							() => reject(new Error('Static pages did not reach the shared render barrier')),
							3_000,
						);
					}),
				]);
			} finally {
				pagesWaitingAtBarrier -= 1;
				if (timeout) {
					clearTimeout(timeout);
				}
			}
		};

		const firstRouteFile = path.join(rootDir, 'src/pages/first.kita.tsx');
		const secondRouteFile = path.join(rootDir, 'src/pages/second.kita.tsx');
		const createPage = (id: string, content: string): EcoPageComponent<Record<string, never>> => {
			const Page: EcoPageComponent<Record<string, never>> = async () => {
				await waitForBothPages();
				return kitaJsx('main', { 'data-page': id, children: content });
			};
			Page.cache = 'static';
			Page.config = {
				integration: 'kitajs',
				identity: { id, file: id === 'first' ? firstRouteFile : secondRouteFile, integration: 'kitajs' },
			};
			return Page;
		};

		const pageModules = new Map<string, EcoPageFile>([
			[firstRouteFile, { default: createPage('first', 'First page') }],
			[secondRouteFile, { default: createPage('second', 'Second page') }],
		]);
		const htmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) =>
			`<html><body>${String(children ?? '')}</body></html>`;
		htmlTemplate.config = {
			integration: 'kitajs',
			identity: { id: 'html', file: path.join(rootDir, 'src/includes/html.kita.tsx'), integration: 'kitajs' },
		};

		class StaticExportKitaRenderer extends KitaRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}

			protected override async importPageFile(file: string): Promise<EcoPageFile> {
				const pageModule = pageModules.get(file);
				if (!pageModule) {
					throw new Error(`No Kita test page module registered for ${file}`);
				}
				return pageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return htmlTemplate;
			}

			protected override async resolveDependencies(): Promise<[]> {
				return [];
			}
		}

		class StaticExportKitaPlugin extends IntegrationPlugin {
			renderer = StaticExportKitaRenderer;

			constructor() {
				super({ name: 'kitajs', extensions: ['.kita.tsx'] });
			}
		}

		const integration = new StaticExportKitaPlugin();
		const appConfig = await createTestAppConfig({ rootDir, integrations: [integration] });
		const routeRendererFactory = new RouteRendererFactory({
			appConfig,
		});
		const routes = [
			{ filePath: firstRouteFile, pathname: '/first', requestUrl: 'https://example.com/first' },
			{ filePath: secondRouteFile, pathname: '/second', requestUrl: 'https://example.com/second' },
		].map(({ filePath, pathname, requestUrl }) => ({
			requestUrl,
			pathname,
			templateRoute: { pathname, kind: 'exact' as const, role: 'page' as const, filePath, paramNames: [] },
			params: {},
		})) satisfies StaticGenerationRoute[];

		vi.stubEnv('NODE_ENV', 'production');
		await new StaticSiteGenerator({ appConfig }).run({
			router: { listStaticGenerationRoutes: vi.fn(async () => routes) },
			baseUrl: 'https://example.com',
			routeRendererFactory,
		});

		expect(maxPagesAtBarrier).toBe(2);
		expect(readFileSync(path.join(appConfig.absolutePaths.distDir, 'first.html'), 'utf8')).toContain(
			'<main data-page="first">First page</main>',
		);
		expect(readFileSync(path.join(appConfig.absolutePaths.distDir, 'second.html'), 'utf8')).toContain(
			'<main data-page="second">Second page</main>',
		);
	});
});
