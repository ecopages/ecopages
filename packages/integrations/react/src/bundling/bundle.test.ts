import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { EcoBuildOnLoadResult } from '@ecopages/core/build/build-types';
import { BundleService } from './bundle.ts';
import { resolveReactPluginRuntimeModules } from './runtime-modules.ts';

const withNodeEnv = async <T>(nodeEnv: string | undefined, run: () => Promise<T>): Promise<T> => {
	const originalNodeEnv = process.env.NODE_ENV;
	if (nodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = nodeEnv;
	}
	try {
		return await run();
	} finally {
		process.env.NODE_ENV = originalNodeEnv;
	}
};

const testAppConfig = {
	rootDir: '/app',
	absolutePaths: {
		projectDir: '/app',
	},
	integrations: [
		{
			name: 'react',
			jsxImportSource: 'react',
			extensions: ['.react.tsx', '.tsx'],
		},
		{
			name: 'kitajs',
			jsxImportSource: '@kitajs/html',
			extensions: ['.kita.tsx'],
		},
	],
} as unknown as EcoPagesAppConfig;

describe('BundleService', () => {
	it('does not include the Eco core browser shim in client bundle options', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);
		const runtimeImports = service.getRuntimeImports();

		expect(pluginNames).not.toContain('react-renderer-eco-core-browser-shim');
		expect(pluginNames).toContain('ecopages-client-graph-boundary');
		expect(pluginNames).toContain('react-renderer-runtime-import-rewrite');
		expect(pluginNames).not.toContain('react-runtime-import-alias');
		expect(options.external).toEqual(expect.arrayContaining(Object.values(runtimeImports)));
		expect(options.external).not.toEqual(expect.arrayContaining(['react', 'react-dom', 'react-dom/client']));
	});

	it('enables minify only for production runtimes', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});

		const developmentOptions = await withNodeEnv('development', () =>
			service.createBundleOptions('ecopages-react-page', false, []),
		);
		const productionOptions = await withNodeEnv('production', () =>
			service.createBundleOptions('ecopages-react-page', false, []),
		);

		expect(developmentOptions.minify).toBeUndefined();
		expect(productionOptions).toMatchObject({
			minify: true,
			treeshaking: true,
		});
	});

	it('can bundle runtime specifiers directly into page-owned entries', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, [], {
			includeRuntime: true,
		});
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);

		expect(options.external).toBeUndefined();
		expect(pluginNames).not.toContain('react-renderer-runtime-import-rewrite');
		expect(pluginNames).not.toContain('react-runtime-import-alias');
	});

	it('rewrites React runtime imports to concrete runtime asset URLs during module loading', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});
		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const runtimeRewritePlugin = (options.plugins as Array<{ name: string }>).find(
			(plugin) => plugin.name === 'react-renderer-runtime-import-rewrite',
		);
		const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-react-runtime-rewrite-'));
		const filePath = path.join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				'import React from "react";',
				'import { jsx } from "react/jsx-runtime";',
				'import { jsxDEV } from "react/jsx-dev-runtime";',
				'import { hydrateRoot } from "react-dom/client";',
				'import ReactDOM from "react-dom";',
			].join('\n'),
			'utf-8',
		);

		try {
			const loadCallbacks: Array<
				(args: { path: string }) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>
			> = [];

			expect(runtimeRewritePlugin).toBeDefined();
			(
				runtimeRewritePlugin as NonNullable<typeof runtimeRewritePlugin> & {
					setup(build: {
						onResolve(): void;
						onLoad(
							_options: unknown,
							callback: (args: {
								path: string;
							}) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>,
						): void;
						module(): void;
					}): void;
				}
			).setup({
				onResolve() {},
				onLoad(_options, callback) {
					loadCallbacks.push(callback);
				},
				module() {},
			});

			const result = await loadCallbacks[0]?.({ path: filePath });

			expect(result?.contents).toContain('from "/assets/vendors/react.js"');
			expect(result?.contents).toContain('from "/assets/vendors/react-dom.js"');
			expect(result?.contents).not.toContain('from "react"');
			expect(result?.contents).not.toContain('from "react-dom"');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('rewrites configured runtime module imports to shared vendor URLs during module loading', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			runtimeModules: resolveReactPluginRuntimeModules(['@tanstack/react-query']),
		});
		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const runtimeRewritePlugin = (options.plugins as Array<{ name: string }>).find(
			(plugin) => plugin.name === 'react-renderer-runtime-import-rewrite',
		);
		const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-react-runtime-module-rewrite-'));
		const filePath = path.join(tempDir, 'entry.tsx');
		writeFileSync(filePath, 'import { QueryClient } from "@tanstack/react-query";', 'utf-8');

		try {
			const loadCallbacks: Array<
				(args: { path: string }) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>
			> = [];

			expect(runtimeRewritePlugin).toBeDefined();
			(
				runtimeRewritePlugin as NonNullable<typeof runtimeRewritePlugin> & {
					setup(build: {
						onResolve(): void;
						onLoad(
							_options: unknown,
							callback: (args: {
								path: string;
							}) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>,
						): void;
						module(): void;
					}): void;
				}
			).setup({
				onResolve() {},
				onLoad(_options, callback) {
					loadCallbacks.push(callback);
				},
				module() {},
			});

			const result = await loadCallbacks[0]?.({ path: filePath });

			expect(result?.contents).toContain('from "/assets/vendors/tanstack-react-query.js"');
			expect(result?.contents).not.toContain('from "@tanstack/react-query"');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
