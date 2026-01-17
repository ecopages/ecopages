import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import { ReactRenderer } from '../react-renderer';
import { ReactPlugin, reactPlugin } from '../react.plugin';

const MockPage = ({ children }: any) => <div>{children}</div>;
MockPage.config = {};

const testDir = path.join(__dirname, 'fixture/.eco-mdx');

const mockConfig = await new ConfigBuilder()
	.setDistDir(testDir)
	.setIntegrations([])
	.setBaseUrl('http://localhost:3000')
	.build();

/** Helper to access private/protected properties for testing */
const getExtensions = (plugin: ReactPlugin) => (plugin as any).extensions;

describe('ReactPlugin & ReactRenderer Extensions', () => {
	const originalExtensions = ReactRenderer.mdxExtensions;

	afterAll(() => {
		if (fileSystem.exists(testDir)) {
			fileSystem.remove(testDir);
		}
		ReactRenderer.mdxExtensions = originalExtensions;
	});

	it('should have default extensions when MDX is disabled', () => {
		const plugin = reactPlugin({ mdx: { enabled: false } });
		expect(getExtensions(plugin)).toEqual(['.tsx']);

		/**
		 * Even if MDX is disabled in the plugin, the renderer should still be configured with default extensions
		 * as the plugin constructor initializes the static configuration.
		 */
		expect(ReactRenderer.mdxExtensions).toEqual(['.mdx']);
	});

	it('should include .mdx by default when MDX is enabled', () => {
		const plugin = reactPlugin({ mdx: { enabled: true } });
		expect(getExtensions(plugin)).toEqual(['.tsx', '.mdx']);
		expect(ReactRenderer.mdxExtensions).toEqual(['.mdx']);
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
		expect(ReactRenderer.mdxExtensions).toEqual(customExtensions);
	});

	it('should warn when extensions are provided but MDX is disabled', () => {
		const warnSpy = spyOn(Logger.prototype, 'warn');

		reactPlugin({
			mdx: {
				enabled: false,
				extensions: ['.md'],
			},
		});

		expect(warnSpy).toHaveBeenCalledWith(
			'MDX extensions provided but MDX is disabled. MDX files will not be processed. Set mdx.enabled to true to enable MDX support.',
		);

		warnSpy.mockRestore();
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
			appConfig: mockConfig,
			assetProcessingService: {
				getHmrManager: () => null,
				processDependencies: async (deps: any) => deps,
			} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		expect(renderer.isMdxFile('file.md')).toBe(true);
		expect(renderer.isMdxFile('component.story.mdx')).toBe(true);
		expect(renderer.isMdxFile('component.tsx')).toBe(false);
		expect(renderer.isMdxFile('file.mdx')).toBe(false);
	});
});
