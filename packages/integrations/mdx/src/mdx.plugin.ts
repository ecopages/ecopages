import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { AssetFactory, type AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { deepMerge } from '@ecopages/core/utils/deep-merge';
import type { EcoPagesElement, IHmrManager } from '@ecopages/core';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { CompileOptions } from '@mdx-js/mdx';
import { createMDXRenderer, MDXRenderer } from './mdx-renderer';
import { createMDXReactRenderer, MDXReactRenderer } from './mdx-react-renderer';
import { MdxHmrStrategy } from './mdx-hmr-strategy';

/**
 * The name of the MDX plugin
 */
export const PLUGIN_NAME = 'MDX';

export type MDXPluginConfig = Partial<Omit<IntegrationPluginConfig, 'name'>> & {
	compilerOptions?: CompileOptions;
};

const defaultOptions: CompileOptions = {
	format: 'detect',
	outputFormat: 'program',
	jsxImportSource: 'react',
	jsxRuntime: 'automatic',
	development: process.env.NODE_ENV === 'development',
};

/**
 * The MDX plugin class
 * This plugin provides support for MDX components in Ecopages
 */
export class MDXPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer: typeof MDXRenderer | typeof MDXReactRenderer;
	private dependencies: AssetDefinition[] | undefined;
	private isReact = false;
	private compilerOptions: CompileOptions;

	constructor({ compilerOptions, ...options }: MDXPluginConfig = { extensions: ['.mdx'] }) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.mdx'],
			...options,
		});

		const finalCompilerOptions = deepMerge({ ...defaultOptions }, compilerOptions);
		this.compilerOptions = finalCompilerOptions;
		this.isReact =
			finalCompilerOptions.jsxImportSource === 'react' ||
			(finalCompilerOptions.jsxImportSource?.startsWith('react/') ?? false);

		if (this.isReact) {
			this.renderer = createMDXReactRenderer(finalCompilerOptions);
			this.integrationDependencies.unshift(...this.getReactDependencies());
		} else {
			this.renderer = createMDXRenderer(finalCompilerOptions);
		}
	}

	override async setup(): Promise<void> {
		await this.setupBunPlugin(this.compilerOptions);
		await super.setup();
	}

	/**
	 * Override to register React-specific specifier mappings for HMR.
	 */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);

		if (this.isReact) {
			hmrManager.registerSpecifierMap(this.getSpecifierMap());
		}
	}

	/**
	 * Provides MDX-specific HMR strategy with Fast Refresh support.
	 */
	override getHmrStrategy(): HmrStrategy | undefined {
		if (!this.hmrManager || !this.isReact) {
			return undefined;
		}

		const hmrManager = this.hmrManager;
		const context = hmrManager.getDefaultContext();

		return new MdxHmrStrategy(context, this.compilerOptions);
	}

	/**
	 * Registers the MDX plugin with Bun globally.
	 */
	async setupBunPlugin(options?: Readonly<CompileOptions>): Promise<void> {
		const mdx = (await import('@mdx-js/esbuild')).default;
		// @ts-expect-error: esbuild plugin vs bun plugin
		await Bun.plugin(mdx(options));
	}

	/**
	 * Helper to construct the source URL for import maps.
	 */
	private buildImportMapSourceUrl(fileName: string): string {
		return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
	}

	/**
	 * Returns the bare specifier to vendor URL mappings for React.
	 */
	private getSpecifierMap(): Record<string, string> {
		return {
			react: this.buildImportMapSourceUrl('react-esm.js'),
			'react/jsx-runtime': this.buildImportMapSourceUrl('react-esm.js'),
			'react/jsx-dev-runtime': this.buildImportMapSourceUrl('react-esm.js'),
			'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
			'react-dom/client': this.buildImportMapSourceUrl('react-esm.js'),
		};
	}

	/**
	 * Retrieves the integration dependencies for React-based MDX.
	 */
	private getReactDependencies(): AssetDefinition[] {
		if (this.dependencies) return this.dependencies;

		this.dependencies = [
			AssetFactory.createInlineContentScript({
				position: 'head',
				bundle: false,
				content: JSON.stringify(
					{
						imports: this.getSpecifierMap(),
					},
					null,
					2,
				),
				attributes: {
					type: 'importmap',
				},
			}),
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: '@ecopages/react/react-esm.ts',
				name: 'react-esm',
				attributes: {
					type: 'module',
					defer: '',
				},
			}),
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: '@ecopages/react/react-dom-esm.ts',
				name: 'react-dom-esm',
				attributes: {
					type: 'module',
					defer: '',
				},
			}),
		];

		return this.dependencies;
	}
}

/**
 * Factory function to create a MDX plugin instance
 * @param options Configuration options for the MDX plugin
 * @returns A new MDXPlugin instance
 */
export function mdxPlugin(options?: MDXPluginConfig): MDXPlugin {
	return new MDXPlugin(options);
}
