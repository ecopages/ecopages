import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { EcoComponentConfig } from '@ecopages/core';
import { ReactMdxConfigDependencyService } from './react-mdx-config-dependency.service.ts';

describe('ReactMdxConfigDependencyService', () => {
	it('eagerly emits SSR-marked lazy scripts for declared MDX component dependencies', async () => {
		const processDependencies = vi.fn(async (dependencies: Array<Record<string, unknown>>) =>
			dependencies.map((dependency) => ({
				kind: dependency.kind as 'script' | 'stylesheet',
				filepath: dependency.source === 'file' ? (dependency.filepath as string) : undefined,
				attributes: dependency.attributes as Record<string, string> | undefined,
				excludeFromHtml: dependency.excludeFromHtml as boolean | undefined,
			})),
		);
		const processComponentDependencies = vi.fn(async () => [
			{
				kind: 'script' as const,
				filepath: '/tmp/owned-config.js',
			},
		]);
		const service = new ReactMdxConfigDependencyService({
			integrationName: 'react',
			pageModuleService: {
				ensureConfigFileMetadata: (config: EcoComponentConfig) => config,
			},
			assetProcessingService: {
				processDependencies,
			},
		});

		const declaredLitComponentConfig: EcoComponentConfig = {
			__eco: {
				id: 'declared-lit-counter',
				file: path.resolve(__dirname, '../test/fixture/declared-lit-counter.lit.tsx'),
				integration: 'lit',
			},
			dependencies: {
				scripts: [
					{
						src: './declared-lit-counter.script.ts',
						lazy: { 'on:interaction': 'click' },
						ssr: true,
					},
				],
				components: [],
			},
		};

		const assets = await service.processMdxConfigDependencies({
			pagePath: path.resolve(__dirname, '../test/fixture/react-content.mdx'),
			config: {
				dependencies: {
					components: [{ config: declaredLitComponentConfig }],
				},
			},
			processComponentDependencies,
		});

		expect(processComponentDependencies).toHaveBeenCalledTimes(1);
		expect(processDependencies).toHaveBeenCalledTimes(1);
		expect(processDependencies).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					kind: 'script',
					source: 'file',
					filepath: path.resolve(__dirname, '../test/fixture/declared-lit-counter.script.ts'),
					position: 'head',
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			],
			`react-mdx-ssr-lazy:${path.resolve(__dirname, '../test/fixture/react-content.mdx')}`,
		);
		expect(assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filepath: '/tmp/owned-config.js' }),
				expect.objectContaining({
					filepath: path.resolve(__dirname, '../test/fixture/declared-lit-counter.script.ts'),
				}),
			]),
		);
	});
});