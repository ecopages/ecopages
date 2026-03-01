import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DependencyResolverService } from './dependency-resolver.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../services/asset-processing-service/index.ts';
import type { EcoComponent } from '../public-types.ts';

describe('DependencyResolverService', () => {
	const appConfig = {
		srcDir: '/app',
	} as EcoPagesAppConfig;

	it('should resolve dependency and lazy script paths', () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const service = new DependencyResolverService(appConfig, assetProcessingService);

		expect(service.resolveDependencyPath('/app/components/card', './style.css')).toBe(
			'/app/components/card/style.css',
		);
		expect(service.resolveLazyScripts('/app/components/card', ['./client.ts', './widget.tsx'])).toBe(
			'/assets/components/card/client.js,/assets/components/card/widget.js',
		);
	});

	it('should emit module dependencies as content scripts and include lazy injector', async () => {
		let capturedDeps: unknown[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				capturedDeps = deps;
				return [
					{
						kind: 'script',
						filepath: '/app/components/table/table.client.ts',
						srcUrl: '/assets/components/table/table.client.js',
					},
				] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;
		const service = new DependencyResolverService(appConfig, assetProcessingService);

		const component = ((_) => '<table></table>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'table',
				integration: 'react',
				file: '/app/components/table/table.tsx',
			},
			dependencies: {
				modules: ['react-aria-components{Table,Button}', './client-utils'],
				scripts: [{ src: './table.client.ts', lazy: { 'on:interaction': 'click' } }],
			},
		};

		await service.processComponentDependencies([component], 'react');

		const contentScripts = capturedDeps.filter((dep) => {
			if (!dep || typeof dep !== 'object') return false;
			const asset = dep as { source?: string; content?: string };
			return asset.source === 'content' && typeof asset.content === 'string';
		}) as { name?: string; content: string }[];

		expect(
			contentScripts.some((script) =>
				script.content.includes("export { Table, Button } from 'react-aria-components';"),
			),
		).toBe(true);
		expect(contentScripts.some((script) => script.content.includes("export * from './client-utils';"))).toBe(true);
		expect(contentScripts.every((script) => /^module-[a-f0-9]+$/.test(script.name ?? ''))).toBe(true);
		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const asset = dep as { source?: string; importPath?: string };
				return asset.source === 'node-module' && asset.importPath === '@ecopages/scripts-injector';
			}),
		).toBe(true);
		expect(component.config._resolvedLazyScripts).toEqual([
			{ lazy: { 'on:interaction': 'click' }, scripts: '/assets/components/table/table.client.js' },
		]);
	});

	it('should detect ecopages virtual imports via parser', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-dependency-resolver-'));
		const componentFile = join(tempDir, 'component.tsx');

		writeFileSync(
			componentFile,
			"import { heroImage as imageAsset } from 'ecopages:images';\nexport const ok = imageAsset.src;\n",
			'utf-8',
		);

		let capturedDeps: unknown[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				capturedDeps = deps;
				return [] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const service = new DependencyResolverService(appConfig, assetProcessingService);
		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'component',
				integration: 'react',
				file: componentFile,
			},
		};

		try {
			await service.processComponentDependencies([component], 'react');

			const contentScripts = capturedDeps.filter((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const asset = dep as { source?: string; content?: string };
				return asset.source === 'content' && typeof asset.content === 'string';
			}) as { content: string }[];

			expect(contentScripts.some((script) => script.content.includes("from 'ecopages:images';"))).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should pass entry attributes and support inline stylesheet content', async () => {
		let capturedDeps: unknown[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				capturedDeps = deps;
				return [] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const service = new DependencyResolverService(appConfig, assetProcessingService);
		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'attrs-inline',
				integration: 'react',
				file: '/app/components/attrs-inline/component.tsx',
			},
			dependencies: {
				scripts: [
					{
						src: './client.ts',
						attributes: {
							async: '',
							'data-script-id': 'main-client',
						},
					},
				],
				stylesheets: [
					{
						src: './styles.css',
						attributes: {
							media: 'print',
						},
					},
					{
						content: 'body { background: red; }',
						attributes: {
							media: 'screen',
						},
					},
				],
			},
		};

		await service.processComponentDependencies([component], 'react');

		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const asset = dep as {
					source?: string;
					kind?: string;
					filepath?: string;
					attributes?: Record<string, string>;
				};
				return (
					asset.kind === 'script' &&
					asset.source === 'file' &&
					asset.filepath === '/app/components/attrs-inline/client.ts' &&
					asset.attributes?.type === 'module' &&
					asset.attributes?.defer === '' &&
					asset.attributes?.async === '' &&
					asset.attributes?.['data-script-id'] === 'main-client'
				);
			}),
		).toBe(true);

		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const asset = dep as {
					source?: string;
					kind?: string;
					filepath?: string;
					attributes?: Record<string, string>;
				};
				return (
					asset.kind === 'stylesheet' &&
					asset.source === 'file' &&
					asset.filepath === '/app/components/attrs-inline/styles.css' &&
					asset.attributes?.rel === 'stylesheet' &&
					asset.attributes?.media === 'print'
				);
			}),
		).toBe(true);

		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const asset = dep as {
					source?: string;
					kind?: string;
					content?: string;
					attributes?: Record<string, string>;
				};
				return (
					asset.kind === 'stylesheet' &&
					asset.source === 'content' &&
					asset.content === 'body { background: red; }' &&
					asset.attributes?.media === 'screen'
				);
			}),
		).toBe(true);
	});

	it('should reject lazy script entry without src or content', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => [] as ProcessedAsset[]),
		} as unknown as AssetProcessingService;

		const service = new DependencyResolverService(appConfig, assetProcessingService);
		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'invalid-lazy-entry',
				integration: 'react',
				file: '/app/components/invalid-lazy-entry/component.tsx',
			},
			dependencies: {
				scripts: [
					{
						lazy: { 'on:idle': true },
					},
				],
			},
		};

		await expect(service.processComponentDependencies([component], 'react')).rejects.toThrow(
			'Lazy script dependency entry in dependencies.scripts requires a src value',
		);
	});

	it('should resolve lazy scripts by trigger group, including lazy content entries', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				return (
					deps as Array<{
						kind?: string;
						source?: string;
						filepath?: string;
						attributes?: Record<string, string>;
						content?: string;
					}>
				).map((dep, index) => {
					const lazyKey = dep.attributes?.['data-eco-lazy-key'];
					const hasContent = dep.source === 'content' && typeof dep.content === 'string';
					const isLazyScript = dep.kind === 'script' && Boolean(lazyKey);
					const srcUrl = isLazyScript
						? hasContent
							? `/assets/lazy/content-${index}.js`
							: `/assets/lazy/file-${index}.js`
						: undefined;

					return {
						kind: dep.kind ?? 'script',
						filepath: dep.filepath,
						attributes: dep.attributes,
						srcUrl,
					} as ProcessedAsset;
				});
			}),
		} as unknown as AssetProcessingService;

		const service = new DependencyResolverService(appConfig, assetProcessingService);
		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'multi-lazy-groups',
				integration: 'lit',
				file: '/app/components/multi-lazy-groups/component.tsx',
			},
			dependencies: {
				scripts: [
					{ src: './idle.ts', lazy: { 'on:idle': true } },
					{ content: 'console.log("visible")', lazy: { 'on:visible': '0.25' } },
				],
			},
		};

		await service.processComponentDependencies([component], 'lit');

		expect(component.config._resolvedLazyScripts).toBeDefined();
		expect(component.config._resolvedLazyScripts).toHaveLength(2);

		const idleGroup = component.config._resolvedLazyScripts?.find((group) => 'on:idle' in group.lazy);
		const visibleGroup = component.config._resolvedLazyScripts?.find((group) => 'on:visible' in group.lazy);

		expect(idleGroup?.scripts).toMatch(/^\/assets\/lazy\/file-\d+\.js$/);
		expect(visibleGroup?.scripts).toMatch(/^\/assets\/lazy\/content-\d+\.js$/);
	});
});
