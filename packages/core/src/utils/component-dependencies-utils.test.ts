import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { FIXTURE_APP_PROJECT_DIR } from '../../fixtures/constants.ts';
import { ConfigBuilder } from '../config/config-builder.ts';
import type { EcoComponentConfig, EcoComponentDependencies } from '../public-types.ts';
import { AssetFactory } from '../services/asset-processing-service/asset.factory.ts';
import { flagComponentsAsDynamic, resolveComponentsScripts } from './component-dependencies-utils.ts';

await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const baseComponentUrl = path.join(globalThis.ecoConfig.srcDir, globalThis.ecoConfig.componentsDir);

const createComponentUrl = (componentName: string) => path.join(baseComponentUrl, componentName);

const componentsMock: Required<EcoComponentDependencies>['components'] = [
	{
		config: {
			importMeta: {
				dir: createComponentUrl('component1'),
			} as ImportMeta,
			dependencies: {
				scripts: ['script1.ts', 'script2.ts'],
				stylesheets: ['style1.css'],
			},
		},
	},
	{
		config: {
			importMeta: {
				dir: createComponentUrl('component2'),
			} as ImportMeta,
			dependencies: {
				scripts: ['script3.ts'],
				stylesheets: ['style2.css'],
			},
		},
	},
];

describe('component-dependencies-utils', () => {
	describe('resolveComponentsScripts', () => {
		it('should resolve the scripts of the components dependencies', () => {
			const result = resolveComponentsScripts(componentsMock);
			expect(result).toEqual(
				`${AssetFactory.RESOLVED_ASSETS_DIR}/components/component1/script1.js,${AssetFactory.RESOLVED_ASSETS_DIR}/components/component1/script2.js,${AssetFactory.RESOLVED_ASSETS_DIR}/components/component2/script3.js`,
			);
		});
	});

	describe('flagComponentsAsDynamic', () => {
		it('should mark scripts as dynamic by adding ?exclude-from-html=true', () => {
			const result = flagComponentsAsDynamic(componentsMock);
			expect(result).toEqual([
				{
					config: {
						importMeta: (componentsMock[0].config as EcoComponentConfig).importMeta,
						dependencies: {
							scripts: ['script1.ts?exclude-from-html=true', 'script2.ts?exclude-from-html=true'],
							stylesheets: ['style1.css'],
						},
					},
				},
				{
					config: {
						importMeta: (componentsMock[1].config as EcoComponentConfig).importMeta,
						dependencies: {
							scripts: ['script3.ts?exclude-from-html=true'],
							stylesheets: ['style2.css'],
						},
					},
				},
			]);
		});

		it('should handle components without scripts', () => {
			const componentsWithoutScripts = [
				{
					config: {
						importMeta: (componentsMock[0].config as EcoComponentConfig).importMeta,
						dependencies: {
							stylesheets: ['style1.css'],
						},
					},
				},
			];
			const result = flagComponentsAsDynamic(componentsWithoutScripts);
			expect(result).toEqual(componentsWithoutScripts);
		});
	});
});
