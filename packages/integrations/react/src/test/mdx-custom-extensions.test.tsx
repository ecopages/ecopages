import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';
import { ReactRenderer } from '../render/react-renderer.ts';
import { reactPlugin } from '../plugin/react.plugin.ts';
import { copyFixtureApp } from '../../../../core/__fixtures__/app/copy-fixture-app.ts';

const MockPage = ({ children }: any) => <div>{children}</div>;
MockPage.config = {};

const fixtureAppRoot = copyFixtureApp();
const testDir = path.join(fixtureAppRoot, '.eco-mdx');

const Config = await finalizeEcoPagesConfig({
	rootDir: fixtureAppRoot,
	distDir: testDir,
	integrations: [],
	baseUrl: 'http://localhost:3000',
});

/** Helper to access private/protected properties for testing */
const getExtensions = (plugin: ReturnType<typeof reactPlugin>) => (plugin as any).extensions;
const getMdxExtensions = (plugin: ReturnType<typeof reactPlugin>) => (plugin as any).mdxExtensions;

describe('ReactPlugin & ReactRenderer Extensions', () => {
	afterAll(() => {
		rmSync(fixtureAppRoot, { recursive: true, force: true });
	});

	it('should leave MDX disabled when its options are omitted', () => {
		const plugin = reactPlugin();
		expect(getExtensions(plugin)).toEqual(['.tsx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should include .mdx by default when MDX options are configured', () => {
		const plugin = reactPlugin({ mdx: {} });
		expect(getExtensions(plugin)).toEqual(['.tsx', '.mdx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should include custom extensions when provided', () => {
		const customExtensions = ['.md', '.custom'];
		const plugin = reactPlugin({
			mdx: {
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
				extensions: ['.mdx'],
			},
		});

		expect(getExtensions(plugin)).toEqual(['.react.tsx', '.mdx']);
		expect(getMdxExtensions(plugin)).toEqual(['.mdx']);
	});

	it('should correctly identify MDX files in Renderer', () => {
		/** Setup renderer with custom extensions */
		reactPlugin({
			mdx: {
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

	it('should seal runtime vendor dependencies for the active NODE_ENV during setup preparation', async () => {
		vi.stubEnv('NODE_ENV', 'production');
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
					name: 'react-dom',
					bundleOptions: expect.objectContaining({ naming: 'react-dom.js' }),
				}),
			]),
		);
		expect(
			(plugin as any).integrationDependencies.some((dependency: { bundleOptions?: { naming?: string } }) =>
				String(dependency.bundleOptions?.naming).includes('.development.'),
			),
		).toBe(false);
	});
});
