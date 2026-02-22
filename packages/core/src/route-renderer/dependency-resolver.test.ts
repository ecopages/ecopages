import { describe, expect, it, vi } from 'vitest';
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
				lazy: {
					'on:interaction': 'click',
					scripts: ['./table.client.ts'],
				},
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
		expect(component.config._resolvedScripts).toBe('/assets/components/table/table.client.js');
	});
});
