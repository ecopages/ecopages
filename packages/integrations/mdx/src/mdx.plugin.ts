import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import {
	AssetFactory,
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import { deepMerge, type EcoPagesElement, type EcoPagesAppConfig, IntegrationRenderer } from '@ecopages/core';
import mdx from '@mdx-js/esbuild';
import type { CompileOptions } from '@mdx-js/mdx';
import { MDXRenderer } from './mdx-renderer';
import { createMDXReactRenderer } from './mdx-react-renderer';

type RendererClass<C> = new (options: {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	runtimeOrigin: string;
}) => IntegrationRenderer<C>;

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
export class MDXPlugin extends IntegrationPlugin {
	renderer: RendererClass<EcoPagesElement>;
	private dependencies: AssetDefinition[] | undefined;

	constructor({ compilerOptions, ...options }: MDXPluginConfig = { extensions: ['.mdx'] }) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.mdx'],
			...options,
		});

		const finalCompilerOptions = deepMerge({ ...defaultOptions }, compilerOptions);
		const isReact =
			finalCompilerOptions.jsxImportSource === 'react' ||
			finalCompilerOptions.jsxImportSource?.startsWith('react/');

		if (isReact) {
			this.renderer = createMDXReactRenderer(finalCompilerOptions);
			this.integrationDependencies.unshift(...this.getReactDependencies());
		} else {
			this.renderer = MDXRenderer;
		}

		void this.setupBunPlugin(finalCompilerOptions);
	}

	/**
	 * Registers the MDX plugin with Bun globally.
	 */
	async setupBunPlugin(options?: Readonly<CompileOptions>): Promise<void> {
		// @ts-expect-error: esbuild plugin vs bun plugin
		await Bun.plugin(mdx(deepMerge({ ...defaultOptions }, options)));
	}

	/**
	 * Helper to construct the source URL for import maps.
	 */
	private buildImportMapSourceUrl(fileName: string): string {
		return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
	}

	/**
	 * Retrieves the integration dependencies matching React requirements
	 */
	private getReactDependencies(): AssetDefinition[] {
		if (this.dependencies) return this.dependencies;

		this.dependencies = [
			AssetFactory.createInlineContentScript({
				position: 'head',
				bundle: false,
				content: JSON.stringify(
					{
						imports: {
							react: this.buildImportMapSourceUrl('react-esm.js'),
							'react/jsx-runtime': this.buildImportMapSourceUrl('react-esm.js'),
							'react/jsx-dev-runtime': this.buildImportMapSourceUrl('react-esm.js'),
							'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
						},
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
