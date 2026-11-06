import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EcoComponentConfig } from '@ecopages/core';
import { MdxConfigDependencyService } from './mdx-config-dependency.ts';

describe('MdxConfigDependencyService', () => {
	it('names the owned config components and their SSR-marked lazy scripts as eager head scripts', () => {
		const service = new MdxConfigDependencyService({
			integrationName: 'react',
			pageModuleService: {
				ensureConfigFileMetadata: (config: EcoComponentConfig) => config,
			},
		});
		const declaredLitComponentConfig: EcoComponentConfig = {
			identity: {
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
					{ src: './browser-only.script.ts', lazy: { 'on:idle': true } },
				],
				components: [],
			},
		};
		const pagePath = path.resolve(__dirname, '../test/fixture/react-content.mdx');

		const contribution = service.collectMdxConfigContribution(pagePath, {
			dependencies: { components: [{ config: declaredLitComponentConfig }] },
		});

		expect(contribution.components.map((component) => component.config?.identity?.file)).toEqual([pagePath]);
		expect(contribution.bundledScripts).toEqual([
			expect.objectContaining({
				kind: 'script',
				source: 'file',
				filepath: path.resolve(__dirname, '../test/fixture/declared-lit-counter.script.ts'),
				position: 'head',
				attributes: { type: 'module', defer: '' },
			}),
		]);
	});
});
