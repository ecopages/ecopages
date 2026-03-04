import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DEPENDENCY_ERRORS, DependencyResolverService } from './dependency-resolver.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
	ContentScriptAsset,
} from '../services/asset-processing-service/index.ts';
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

	it('should emit module dependencies as content scripts and resolve lazy triggers by default', async () => {
		let capturedDeps: AssetDefinition[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
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

		const contentScripts = capturedDeps.filter(
			(dep): dep is ContentScriptAsset => dep.kind === 'script' && dep.source === 'content',
		);

		expect(
			contentScripts.some((script) =>
				script.content.includes("export { Table, Button } from 'react-aria-components';"),
			),
		).toBe(true);
		expect(contentScripts.some((script) => script.content.includes("export * from './client-utils';"))).toBe(true);
		expect(contentScripts.every((script) => /^module-[a-f0-9]+$/.test(script.name ?? ''))).toBe(true);

		const hasInjector = capturedDeps.some(
			(dep) =>
				dep.kind === 'script' &&
				dep.source === 'node-module' &&
				dep.importPath === '@ecopages/scripts-injector',
		);
		expect(hasInjector).toBe(false);

		expect(component.config._resolvedLazyScripts).toBeUndefined();
		expect(component.config._resolvedLazyTriggers).toHaveLength(1);
		expect(component.config._resolvedLazyTriggers?.[0]?.rules).toEqual([
			{
				'on:interaction': {
					value: 'click',
					scripts: ['/assets/components/table/table.client.js'],
				},
			},
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

		let capturedDeps: AssetDefinition[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
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

			const contentScripts = capturedDeps.filter(
				(dep): dep is ContentScriptAsset => dep.kind === 'script' && dep.source === 'content',
			);

			expect(contentScripts.some((script) => script.content.includes("from 'ecopages:images';"))).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should pass entry attributes and support inline stylesheet content', async () => {
		let capturedDeps: AssetDefinition[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
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
				if (dep.kind !== 'script' || dep.source !== 'file') return false;
				return (
					dep.filepath === '/app/components/attrs-inline/client.ts' &&
					dep.attributes?.type === 'module' &&
					dep.attributes?.defer === '' &&
					dep.attributes?.async === '' &&
					dep.attributes?.['data-script-id'] === 'main-client'
				);
			}),
		).toBe(true);

		expect(
			capturedDeps.some((dep) => {
				if (dep.kind !== 'stylesheet' || dep.source !== 'file') return false;
				return (
					dep.filepath === '/app/components/attrs-inline/styles.css' &&
					dep.attributes?.rel === 'stylesheet' &&
					dep.attributes?.media === 'print'
				);
			}),
		).toBe(true);

		expect(
			capturedDeps.some((dep) => {
				if (dep.kind !== 'stylesheet' || dep.source !== 'content') return false;
				return dep.content === 'body { background: red; }' && dep.attributes?.media === 'screen';
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
			DEPENDENCY_ERRORS.LAZY_SCRIPT_MISSING_SRC,
		);
	});

	it('should resolve lazy triggers by group, including lazy content entries', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
				return deps.map((dep, index) => {
					const lazyKey = dep.attributes?.['data-eco-lazy-key'];
					const hasContent = dep.source === 'content' && typeof (dep as any).content === 'string';
					const isLazyScript = dep.kind === 'script' && Boolean(lazyKey);
					const srcUrl = isLazyScript
						? hasContent
							? `/assets/lazy/content-${index}.js`
							: `/assets/lazy/file-${index}.js`
						: undefined;

					return {
						kind: dep.kind ?? 'script',
						filepath: (dep as Record<string, any>).filepath,
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

		expect(component.config._resolvedLazyScripts).toBeUndefined();
		expect(component.config._resolvedLazyTriggers).toHaveLength(1);

		const rules = component.config._resolvedLazyTriggers?.[0]?.rules ?? [];
		const idleRule = rules.find((rule) => 'on:idle' in rule);
		const visibleRule = rules.find((rule) => 'on:visible' in rule);

		expect(idleRule && 'on:idle' in idleRule ? idleRule['on:idle'].scripts[0] : undefined).toMatch(
			/^\/assets\/lazy\/file-\d+\.js$/,
		);
		expect(visibleRule && 'on:visible' in visibleRule ? visibleRule['on:visible'].scripts[0] : undefined).toMatch(
			/^\/assets\/lazy\/content-\d+\.js$/,
		);
	});
});
