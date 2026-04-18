import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import { ReactRenderer } from '../react-renderer';
import { reactPlugin } from '../react.plugin';

const MockPage = ({ children }: any) => <div>{children}</div>;
MockPage.config = {};

const fixtureAppRoot = path.resolve(__dirname, '../../../../core/__fixtures__/app');
const testDir = path.join(__dirname, 'fixture/.eco-mdx');

const Config = await new ConfigBuilder()
	.setRootDir(fixtureAppRoot)
	.setDistDir(testDir)
	.setIntegrations([])
	.setBaseUrl('http://localhost:3000')
	.build();

/** Helper to access private/protected properties for testing */
const getExtensions = (plugin: ReturnType<typeof reactPlugin>) => (plugin as any).extensions;
const getMdxExtensions = (plugin: ReturnType<typeof reactPlugin>) => (plugin as any).mdxExtensions;

describe('ReactPlugin & ReactRenderer Extensions', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	afterAll(() => {
		if (fileSystem.exists(testDir)) {
			fileSystem.remove(testDir);
		}
	});

	it('should have default extensions when MDX is disabled', () => {
		const plugin = reactPlugin({ mdx: { enabled: false } });
		expect(getExtensions(plugin)).toEqual(['.tsx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should include .mdx by default when MDX is enabled', () => {
		const plugin = reactPlugin({ mdx: { enabled: true } });
		expect(getExtensions(plugin)).toEqual(['.tsx', '.mdx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should include custom extensions when provided', () => {
		const customExtensions = ['.md', '.custom'];
		const plugin = reactPlugin({
			mdx: {
				enabled: true,
				extensions: customExtensions,
			},
		});

		expect(getExtensions(plugin)).toEqual(['.tsx', '.md', '.custom']);
		expect(getMdxExtensions(plugin)).toEqual(customExtensions);
	});

	it('should preserve custom React route extensions when MDX is enabled', () => {
		const plugin = reactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				enabled: true,
				extensions: ['.mdx'],
			},
		});

		expect(getExtensions(plugin)).toEqual(['.react.tsx', '.mdx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should warn when extensions are provided but MDX is disabled', () => {
		const originalWarn = Logger.prototype.warn;
		const warnings: string[] = [];
		Logger.prototype.warn = function warn(message: string) {
			warnings.push(message);
			return this;
		};

		try {
			reactPlugin({
				mdx: {
					enabled: false,
					extensions: ['.md'],
				},
			});

			expect(warnings).toContain(
				'MDX extensions provided but MDX is disabled. MDX files will not be processed. Set mdx.enabled to true to enable MDX support.',
			);
		} finally {
			Logger.prototype.warn = originalWarn;
		}
	});

	it('should correctly identify MDX files in Renderer', () => {
		/** Setup renderer with custom extensions */
		reactPlugin({
			mdx: {
				enabled: true,
				extensions: ['.md', '.story.mdx'],
			},
		});

		const renderer = new ReactRenderer({
			appConfig: Config,
			assetProcessingService: {
				getHmrManager: () => null,
				processDependencies: async (deps: any) => deps,
			} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
			reactConfig: {
				mdxExtensions: ['.md', '.story.mdx'],
			},
		});

		expect(renderer.isMdxFile('file.md')).toBe(true);
		expect(renderer.isMdxFile('component.story.mdx')).toBe(true);
		expect(renderer.isMdxFile('component.tsx')).toBe(false);
		expect(renderer.isMdxFile('file.mdx')).toBe(false);
	});

	it('should seal both production and development runtime vendor dependencies during setup preparation', async () => {
		process.env.NODE_ENV = 'production';
		const plugin = reactPlugin({});
		plugin.setConfig(Config);

		expect((plugin as any).integrationDependencies).toEqual([]);

		await plugin.prepareBuildContributions();

		expect((plugin as any).integrationDependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'react',
					bundleOptions: expect.objectContaining({ naming: 'react.js' }),
				}),
				expect.objectContaining({
					name: 'react',
					bundleOptions: expect.objectContaining({ naming: 'react.development.js' }),
				}),
				expect.objectContaining({
					name: 'react-dom',
					bundleOptions: expect.objectContaining({ naming: 'react-dom.js' }),
				}),
				expect.objectContaining({
					name: 'react-dom',
					bundleOptions: expect.objectContaining({ naming: 'react-dom.development.js' }),
				}),
			]),
		);
	});
});
