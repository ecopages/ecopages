import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DEPENDENCY_ERRORS, DependencyResolverService } from './dependency-resolver.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
	ContentScriptAsset,
	InlineContentScriptAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import type { EcoComponent } from '../../types/public-types.ts';

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
				script.content.includes("export { Button, Table } from 'react-aria-components';"),
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

	it('should canonicalize generated module script content across different import orders', async () => {
		const captureModuleScriptContent = async (modules: string[]) => {
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
					id: 'module-order',
					integration: 'react',
					file: '/app/components/module-order/component.tsx',
				},
				dependencies: {
					modules,
				},
			};

			await service.processComponentDependencies([component], 'react');

			return capturedDeps
				.filter((dep): dep is ContentScriptAsset => dep.kind === 'script' && dep.source === 'content')
				.map((dep) => dep.content)
				.find((content) => content.includes("from 'react-aria-components';"));
		};

		const firstContent = await captureModuleScriptContent(['react-aria-components{Table,Button}']);
		const secondContent = await captureModuleScriptContent(['react-aria-components{Button,Table}']);

		expect(firstContent).toBe("export { Button, Table } from 'react-aria-components';");
		expect(secondContent).toBe(firstContent);
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

	it('should keep ecopages-jsx page and lazy dependency bundles separate', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-jsx-script-dedupe-'));
		const componentFile = join(tempDir, 'component.tsx');
		const widgetScript = join(tempDir, 'widget.script.ts');
		const siblingScript = join(tempDir, 'other.ts');
		const lazyScript = join(tempDir, 'lazy.ts');

		writeFileSync(componentFile, "import './widget.script';\nexport const Component = () => null;\n", 'utf-8');
		writeFileSync(widgetScript, 'export const widget = true;\n', 'utf-8');
		writeFileSync(siblingScript, 'export const other = true;\n', 'utf-8');
		writeFileSync(lazyScript, 'export const lazy = true;\n', 'utf-8');

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
				id: 'imported-script',
				integration: 'ecopages-jsx',
				file: componentFile,
			},
			dependencies: {
				scripts: ['./widget.script.ts', './other.ts', { src: './lazy.ts', lazy: { 'on:interaction': 'click' } }],
			},
		};

		try {
			await service.processComponentDependencies([component], 'ecopages-jsx');

			const contentScripts = capturedDeps.filter(
				(dep): dep is Extract<AssetDefinition, { kind: 'script'; source: 'content' }> =>
					dep.kind === 'script' && dep.source === 'content',
			);

			expect(contentScripts).toHaveLength(2);

			const pageScript = contentScripts.find((dep) => dep.packageRole === 'page-script');
			const lazyEntry = contentScripts.find((dep) => dep.excludeFromHtml === true);

			expect(pageScript).toEqual(
				expect.objectContaining({
					content: `import ${JSON.stringify(widgetScript)};\nimport ${JSON.stringify(siblingScript)};`,
				}),
			);

			expect(lazyEntry).toEqual(
				expect.objectContaining({
					content: `import ${JSON.stringify(lazyScript)};`,
					excludeFromHtml: true,
					bundleOptions: {
						splitting: false,
					},
				}),
			);

			expect(pageScript?.groupedBundle).toBeUndefined();
			expect(lazyEntry?.groupedBundle).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should not promote SSR-imported lazy ecopages-jsx scripts into the page bundle', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-jsx-lazy-imported-script-'));
		const componentFile = join(tempDir, 'component.tsx');
		const lazyScript = join(tempDir, 'theme-toggle.script.ts');

		writeFileSync(componentFile, "import './theme-toggle.script';\nexport const Component = () => null;\n", 'utf-8');
		writeFileSync(lazyScript, 'export const themeToggle = true;\n', 'utf-8');

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
				id: 'imported-lazy-script',
				integration: 'ecopages-jsx',
				file: componentFile,
			},
			dependencies: {
				scripts: [{ src: './theme-toggle.script.ts', lazy: { 'on:interaction': 'click' } }],
			},
		};

		try {
			await service.processComponentDependencies([component], 'ecopages-jsx');

			const contentScripts = capturedDeps.filter(
				(dep): dep is Extract<AssetDefinition, { kind: 'script'; source: 'content' }> =>
					dep.kind === 'script' && dep.source === 'content',
			);

			expect(contentScripts).toHaveLength(1);
			expect(contentScripts[0]).toEqual(
				expect.objectContaining({
					content: `import ${JSON.stringify(lazyScript)};`,
					excludeFromHtml: true,
				}),
			);
			expect(contentScripts[0]?.packageRole).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should ignore ecopages-jsx SSR imports that are not declared in dependencies', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-jsx-undeclared-import-'));
		const componentFile = join(tempDir, 'component.tsx');
		const declaredScript = join(tempDir, 'declared.ts');

		writeFileSync(
			componentFile,
			"import './theme-toggle.script';\nimport './not-declared.script';\nexport const Component = () => null;\n",
			'utf-8',
		);
		writeFileSync(declaredScript, 'export const declared = true;\n', 'utf-8');

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
				id: 'undeclared-import',
				integration: 'ecopages-jsx',
				file: componentFile,
			},
			dependencies: {
				scripts: ['./declared.ts'],
			},
		};

		try {
			await service.processComponentDependencies([component], 'ecopages-jsx');

			const fileScripts = capturedDeps.filter(
				(dep): dep is Extract<AssetDefinition, { kind: 'script'; source: 'file' }> =>
					dep.kind === 'script' && dep.source === 'file',
			);

			expect(fileScripts).toHaveLength(1);
			expect(fileScripts[0]?.filepath).toBe(declaredScript);
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

	it('should collapse bundleable page stylesheets and scripts into page-owned assets', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-bundle-'));
		const componentFile = join(tempDir, 'component.tsx');
		const stylesheetA = join(tempDir, 'first.css');
		const stylesheetB = join(tempDir, 'second.css');
		const scriptA = join(tempDir, 'first.ts');
		const scriptB = join(tempDir, 'second.ts');

		writeFileSync(componentFile, 'export const Component = () => null;', 'utf-8');
		writeFileSync(stylesheetA, '.first { color: red; }', 'utf-8');
		writeFileSync(stylesheetB, '.second { color: blue; }', 'utf-8');
		writeFileSync(scriptA, 'export const first = true;', 'utf-8');
		writeFileSync(scriptB, 'export const second = true;', 'utf-8');

		let capturedDeps: AssetDefinition[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
				capturedDeps = deps;
				return [] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const bundleAppConfig = {
			...appConfig,
			rootDir: tempDir,
			absolutePaths: {
				srcDir: tempDir,
				distDir: join(tempDir, '.eco/public'),
			},
		} as EcoPagesAppConfig;

		const service = new DependencyResolverService(bundleAppConfig, assetProcessingService);
		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'page-bundle',
				integration: 'react',
				file: componentFile,
			},
			dependencies: {
				stylesheets: ['./first.css', './second.css'],
				scripts: ['./first.ts', './second.ts'],
			},
		};

		try {
			await service.processComponentDependencies([component], 'react');

			expect(capturedDeps).toEqual([
				expect.objectContaining({
					kind: 'stylesheet',
					source: 'content',
					packageRole: 'page-style',
					content: '.first { color: red; }\n.second { color: blue; }',
				}),
				expect.objectContaining({
					kind: 'script',
					source: 'content',
					packageRole: 'page-script',
					content: `import ${JSON.stringify(scriptA)};\nimport ${JSON.stringify(scriptB)};`,
				}),
			]);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
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

	it('should emit object-form content scripts as inline non-bundled assets', async () => {
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
				id: 'html-shell',
				integration: 'react',
				file: '/app/includes/html.tsx',
			},
			dependencies: {
				scripts: [
					{
						content: '(function(){document.documentElement.dataset.theme="light";})()',
						attributes: { 'data-eco-script': 'theme' },
					},
					{
						content: '(function(){document.getElementById("banner").style.display="block";})()',
						attributes: { 'data-eco-script': 'announcement' },
					},
				],
			},
		};

		await service.processComponentDependencies([component], 'react');

		const inlineScripts = capturedDeps.filter(
			(dep): dep is InlineContentScriptAsset =>
				dep.kind === 'script' && dep.source === 'content' && (dep as InlineContentScriptAsset).inline === true,
		);

		expect(inlineScripts).toHaveLength(2);
		expect(inlineScripts.every((s) => s.bundle === false)).toBe(true);
		expect(inlineScripts.every((s) => s.position === 'head')).toBe(true);
		expect(inlineScripts[0].attributes?.['data-eco-script']).toBe('theme');
		expect(inlineScripts[1].attributes?.['data-eco-script']).toBe('announcement');
		expect(inlineScripts[0].content).toContain('theme');
		expect(inlineScripts[1].content).toContain('banner');
	});

	it('should ignore undefined component entries when collecting nested dependencies', async () => {
		let capturedDeps: AssetDefinition[] = [];
		const assetProcessingService = {
			processDependencies: vi.fn(async (deps: AssetDefinition[]) => {
				capturedDeps = deps;
				return [] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const service = new DependencyResolverService(appConfig, assetProcessingService);
		const nestedComponent = ((_) => '<button></button>') as EcoComponent<Record<string, unknown>>;
		nestedComponent.config = {
			__eco: {
				id: 'theme-toggle',
				integration: 'react',
				file: '/app/components/theme-toggle.tsx',
			},
			dependencies: {
				scripts: ['./theme-toggle.client.ts'],
			},
		};

		const component = ((_) => '<div></div>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'page',
				integration: 'kitajs',
				file: '/app/views/page.tsx',
			},
			dependencies: {
				components: [undefined, nestedComponent] as unknown as EcoComponent[],
			},
		};

		await expect(
			service.processComponentDependencies([undefined as unknown as EcoComponent, component], 'kitajs'),
		).resolves.toEqual([]);

		expect(capturedDeps).toEqual([
			expect.objectContaining({
				kind: 'script',
				source: 'file',
				filepath: '/app/components/theme-toggle.client.ts',
			}),
		]);
	});
});
