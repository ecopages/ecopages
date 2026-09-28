import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { EcoComponentConfig } from '@ecopages/core';
import { createElement, type ComponentType } from 'react';

type PageProps = Record<string, unknown>;
type NavigablePageComponent = ComponentType<PageProps> & { config?: EcoComponentConfig };

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return (typeof value === 'object' && value !== null) || typeof value === 'function'
		? (value as Record<string, unknown>)
		: undefined;
}

function resolveImportedPageComponent(module: Record<string, unknown>): NavigablePageComponent | null {
	const defaultExport = module.default;
	const defaultRecord = asRecord(defaultExport);
	const rawComponent = module.Content ?? defaultRecord?.Content ?? defaultExport;
	return typeof rawComponent === 'function' ? (rawComponent as NavigablePageComponent) : null;
}

function resolvePageModuleConfig(
	module: Record<string, unknown>,
	imported: NavigablePageComponent,
	defaultRecord: Record<string, unknown> | undefined,
): EcoComponentConfig | undefined {
	const config = (module.config ?? defaultRecord?.config ?? imported.config) as EcoComponentConfig | undefined;
	if (config) {
		ensurePageConfigLayouts(config);
	}
	return config;
}

function wrapPageComponentWithConfig(
	imported: NavigablePageComponent,
	config: EcoComponentConfig,
): NavigablePageComponent {
	const page = ((props: PageProps) => createElement(imported, props)) as NavigablePageComponent;
	page.config = config;
	page.displayName = imported.displayName ?? imported.name ?? 'EcoRouterPage';
	return page;
}

/**
 * Adapts supported module export shapes to the router's page-component contract.
 *
 * @remarks
 * Never mutates the imported component function. When module-level config is
 * present but missing on the export, a thin wrapper carries `config` for layout
 * composition while rendering the original component.
 */
export function adaptPageModule(moduleNamespace: unknown): {
	Component: NavigablePageComponent;
	config?: EcoComponentConfig;
	preload?: (props: PageProps) => Promise<void>;
} | null {
	const module = asRecord(moduleNamespace);
	if (!module) {
		return null;
	}

	const imported = resolveImportedPageComponent(module);
	if (!imported) {
		return null;
	}

	const defaultRecord = asRecord(module.default);
	const config = resolvePageModuleConfig(module, imported, defaultRecord);
	const preloadValue = module.preload;
	const preload =
		typeof preloadValue === 'function' ? (preloadValue as (props: PageProps) => Promise<void>) : undefined;

	if (!config || imported.config === config) {
		return { Component: imported, config: imported.config ?? config, preload };
	}

	return { Component: wrapPageComponentWithConfig(imported, config), config, preload };
}
