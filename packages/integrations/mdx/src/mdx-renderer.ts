/**
 * This module contains the MDX renderer
 * @module
 */

import type { EcoComponent, EcoComponentConfig, EcoPageFile } from '@ecopages/core';
import { assertIntegrationInvariant } from '@ecopages/core/plugins/integration-plugin';
import {
	type PageBrowserGraphContribution,
	type PageBrowserGraphContributionContext,
} from '@ecopages/core/route-renderer/integration-renderer';
import { StringMarkupRenderer } from '@ecopages/core/route-renderer/string-markup-renderer';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { CompileOptions } from '@mdx-js/mdx';
import { MDX_PLUGIN_NAME } from './mdx.constants.ts';
import { rapidhash } from '@ecopages/core/hash';
import type { MDXRendererOptions } from './mdx.types.ts';

export type { MDXFile, MDXRendererConfig, MDXRendererOptions } from './mdx.types.ts';

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends StringMarkupRenderer {
	name = MDX_PLUGIN_NAME;
	readonly compilerOptions: CompileOptions;

	constructor({ mdxConfig, ...options }: MDXRendererOptions) {
		super(options);
		this.compilerOptions = mdxConfig?.compilerOptions ?? {};
	}

	protected override async collectPageBrowserGraphContribution(
		context: PageBrowserGraphContributionContext,
	): Promise<PageBrowserGraphContribution> {
		const { file: pagePath, pageModule } = context;
		const { default: pageComponent } = pageModule;
		const config = pageComponent.config;
		const components: Partial<EcoComponent>[] = [];

		for (const layout of config?.layouts ?? []) {
			if (layout?.config?.dependencies) {
				components.push({ config: layout.config });
			}
		}

		if (config?.dependencies) {
			components.push({
				config: {
					...config,
					__eco: {
						id: rapidhash(pagePath).toString(36),
						file: pagePath,
						integration: this.name,
					},
				},
			});
		}

		return { assets: await this.resolveDependencies(components) };
	}

	protected override normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		_file: string,
		pageModule: TPageModule,
	): TPageModule {
		try {
			const mdxModule = pageModule as TPageModule & { config?: EcoComponentConfig };
			const { default: Page, config, getMetadata } = mdxModule;

			if (typeof Page !== 'function') {
				throw new Error('MDX file must export a default function');
			}

			ensurePageConfigLayouts(config);

			const layouts = config?.layouts;
			const resolvedLayout = layouts?.[layouts.length - 1];

			if (config) Page.config = config;

			return {
				...pageModule,
				default: Page,
				layout: resolvedLayout,
				getMetadata,
			} as TPageModule;
		} catch (error) {
			assertIntegrationInvariant(false, `Error importing MDX file: ${error}`);
		}
	}
}
