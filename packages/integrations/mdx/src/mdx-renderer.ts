/**
 * This module contains the MDX renderer
 * @module
 */

import type { EcoComponent, EcoComponentConfig, EcoPageFile, EcoPagesElement } from '@ecopages/core';
import { createIntegrationRenderer, type PageBrowserGraphContributionContext } from '@ecopages/core/integration';
import { attachEcoFileMetadataToConfig } from '@ecopages/core/integration';
import { ensurePageConfigLayouts } from '@ecopages/core/integration';
import { MDX_PLUGIN_NAME } from './mdx.constants.ts';

export type { MDXFile } from './mdx.types.ts';

function normalizeImportedMdxPage<TPageModule extends EcoPageFile>(
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
		throw new Error(`[ecopages] Error importing MDX file: ${error}`);
	}
}

function collectMdxPageComponents(
	context: PageBrowserGraphContributionContext,
): Array<EcoComponent | Partial<EcoComponent>> {
	const { file: pagePath, pageModule } = context;
	const { default: pageComponent } = pageModule;
	const config = pageComponent.config;
	const components: Array<EcoComponent | Partial<EcoComponent>> = [];

	for (const layout of config?.layouts ?? []) {
		if (layout?.config?.dependencies) {
			components.push({ config: layout.config });
		}
	}

	if (config?.dependencies) {
		components.push({
			config: attachEcoFileMetadataToConfig(config, pagePath, MDX_PLUGIN_NAME),
		});
	}

	return components;
}

/**
 * MDX routes use the shared renderer pipeline with page-module and dependency hooks.
 */
export const MDXRenderer = createIntegrationRenderer<EcoPagesElement>(MDX_PLUGIN_NAME, ({ resolveDependencies }) => ({
	collectPageBrowserGraphContribution: async (context) => ({
		assets: await resolveDependencies(collectMdxPageComponents(context)),
	}),
	normalizePageModule: normalizeImportedMdxPage,
}));
