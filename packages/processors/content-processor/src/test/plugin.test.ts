import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { GENERATED_BASE_PATHS } from '@ecopages/core/constants';
import { installBuildRuntime } from '@ecopages/core/build/build-runtime';
import { getCollectionServerBuildArtifact } from '@ecopages/core/services/module-loading/collection-server-module-build.service';
import { fileSystem } from '@ecopages/file-system';
import { contentProcessorPlugin, ContentProcessorPlugin } from '../plugin.ts';
import { testContentSchema } from './test-schema.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const rootDir = path.join(os.tmpdir(), `${prefix}${randomUUID()}`);
	fileSystem.ensureDir(rootDir);
	return rootDir;
}

function createContentProcessorPlugin(
	collections: Record<string, { contentDir: string; entryType?: string }>,
): ContentProcessorPlugin {
	return contentProcessorPlugin({
		options: {
			collections: Object.fromEntries(
				Object.entries(collections).map(([name, definition]) => [
					name,
					{ ...definition, schema: testContentSchema },
				]),
			),
		},
	});
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		if (fileSystem.exists(root)) {
			fileSystem.remove(root);
		}
	}
});

describe('ContentProcessorPlugin', () => {
	test('prepareBuildContributions generates virtual modules and types', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			path.join(contentDir, 'intro.mdx'),
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const workDir = appConfig.absolutePaths.workDir;
		const cacheFile = path.join(workDir, GENERATED_BASE_PATHS.cache, plugin.name, 'docs.ts');
		const typesFile = path.join(rootDir, GENERATED_BASE_PATHS.types, plugin.name, 'virtual-module.d.ts');

		expect(fileSystem.exists(cacheFile)).toBe(true);
		expect(fileSystem.readFileSync(cacheFile)).toContain('export const entries = [');
		expect(fileSystem.readFileSync(cacheFile)).not.toContain('getComponent');
		const serverCacheFile = path.join(workDir, GENERATED_BASE_PATHS.cache, plugin.name, 'docs.server.ts');
		expect(fileSystem.exists(serverCacheFile)).toBe(true);
		expect(fileSystem.readFileSync(serverCacheFile)).toContain('export async function getComponent');
		expect(fileSystem.readFileSync(serverCacheFile)).toContain('export async function getEntryDependencies');
		const typesDir = path.join(rootDir, GENERATED_BASE_PATHS.types, plugin.name);
		expect(fileSystem.exists(typesFile)).toBe(true);
		expect(fileSystem.readFileSync(typesFile)).toContain('declare module "ecopages:content/docs"');
		expect(fileSystem.readFileSync(typesFile)).toContain('declare module "ecopages:content/docs/server"');
		expect(JSON.parse(fileSystem.readFileSync(path.join(typesDir, 'package.json')))).toMatchObject({
			name: '@types/ecopages-content-processor',
			types: './index.d.ts',
		});
		expect(plugin.collectionModules.docs).toBe(cacheFile);
		expect(plugin.collectionServerModules.docs).toBe(serverCacheFile);
	});

	test('co-located helper edits invalidate the compiled collection without rewriting entry modules', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-colocated-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		const introPath = path.join(contentDir, 'intro.mdx');
		const helperPath = path.join(contentDir, 'survey-form.config.ts');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			introPath,
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);
		fileSystem.write(helperPath, 'export const surveyId = "demo";\n');

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const cacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.ts',
		);
		const serverCacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.server.ts',
		);
		const typesFile = path.join(rootDir, GENERATED_BASE_PATHS.types, plugin.name, 'virtual-module.d.ts');
		const entriesBefore = fileSystem.readFileSync(cacheFile);
		const serverBefore = fileSystem.readFileSync(serverCacheFile);
		const typesBefore = fileSystem.readFileSync(typesFile);
		plugin.collectionServerCompiledModules.docs = '/tmp/stale-docs-server-collection.mjs';

		fileSystem.write(helperPath, 'export const surveyId = "updated";\n');

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChange) {
			throw new Error('Expected content processor watch onChange handler');
		}
		await watchConfig.onChange({ path: helperPath } as never);

		expect(fileSystem.readFileSync(cacheFile)).toBe(entriesBefore);
		expect(fileSystem.readFileSync(serverCacheFile)).toBe(serverBefore);
		expect(fileSystem.readFileSync(typesFile)).toBe(typesBefore);
		expect(plugin.collectionServerCompiledModules.docs).toBeUndefined();
	});

	test('body-only MDX edits do not rewrite generated collection modules', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-body-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		const introPath = path.join(contentDir, 'intro.mdx');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			introPath,
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const cacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.ts',
		);
		const serverCacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.server.ts',
		);
		const typesFile = path.join(rootDir, GENERATED_BASE_PATHS.types, plugin.name, 'virtual-module.d.ts');
		const entriesBefore = fileSystem.readFileSync(cacheFile);
		const serverBefore = fileSystem.readFileSync(serverCacheFile);
		const typesBefore = fileSystem.readFileSync(typesFile);
		plugin.collectionServerCompiledModules.docs = '/tmp/stale-docs-server-collection.mjs';

		fileSystem.write(
			introPath,
			`---
title: Intro
description: Welcome
order: 1
---
# Intro updated body
`,
		);

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChange) {
			throw new Error('Expected content processor watch onChange handler');
		}
		await watchConfig.onChange({ path: introPath } as never);

		expect(fileSystem.readFileSync(cacheFile)).toBe(entriesBefore);
		expect(fileSystem.readFileSync(serverCacheFile)).toBe(serverBefore);
		expect(fileSystem.readFileSync(typesFile)).toBe(typesBefore);
		expect(plugin.collectionServerCompiledModules.docs).toBeUndefined();
	});

	test('setup generates virtual modules without compiling the collection artifact', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-lazy-artifact-');
		tempRoots.push(rootDir);
		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			path.join(contentDir, 'intro.mdx'),
			'---\ntitle: Intro\ndescription: Test\norder: 1\n---\n# Intro\n',
		);

		const plugin = createContentProcessorPlugin({ docs: { contentDir: 'content/docs' } });
		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		installBuildRuntime(appConfig);
		await plugin.setup();

		expect(getCollectionServerBuildArtifact(appConfig, 'docs')).toBeUndefined();
	});

	test('frontmatter edits rewrite the entries module but not the server barrel', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-frontmatter-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		const introPath = path.join(contentDir, 'intro.mdx');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			introPath,
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const cacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.ts',
		);
		const serverCacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.server.ts',
		);
		const entriesBefore = fileSystem.readFileSync(cacheFile);
		const serverBefore = fileSystem.readFileSync(serverCacheFile);

		fileSystem.write(
			introPath,
			`---
title: Intro Updated
description: Welcome
order: 1
---
# Intro
`,
		);

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChange) {
			throw new Error('Expected content processor watch onChange handler');
		}
		await watchConfig.onChange({ path: introPath } as never);

		expect(fileSystem.readFileSync(cacheFile)).not.toBe(entriesBefore);
		expect(fileSystem.readFileSync(cacheFile)).toContain('Intro Updated');
		expect(fileSystem.readFileSync(serverCacheFile)).toBe(serverBefore);
	});

	test('create, delete, and rename events regenerate collection modules', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-mutations-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		const introPath = path.join(contentDir, 'intro.mdx');
		const guidePath = path.join(contentDir, 'guide.mdx');
		const renamedGuidePath = path.join(contentDir, 'getting-started', 'guide.mdx');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			introPath,
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});
		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();
		const cacheFile = path.join(
			appConfig.absolutePaths.workDir,
			GENERATED_BASE_PATHS.cache,
			plugin.name,
			'docs.ts',
		);
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onCreate || !watchConfig.onDelete) {
			throw new Error('Expected content processor create and delete watch handlers');
		}

		fileSystem.write(
			guidePath,
			`---
title: Guide
description: Welcome
order: 2
---
# Guide
`,
		);
		await watchConfig.onCreate({ path: guidePath } as never);
		expect(fileSystem.readFileSync(cacheFile)).toContain('"slug":"guide"');

		fileSystem.ensureDir(path.dirname(renamedGuidePath));
		fileSystem.write(renamedGuidePath, fileSystem.readFileSync(guidePath));
		fileSystem.remove(guidePath);
		await watchConfig.onDelete({ path: guidePath } as never);
		await watchConfig.onCreate({ path: renamedGuidePath } as never);
		expect(fileSystem.readFileSync(cacheFile)).toContain('"slug":"getting-started/guide"');
		expect(fileSystem.readFileSync(cacheFile)).not.toContain('"slug":"guide"');

		fileSystem.remove(introPath);
		await watchConfig.onDelete({ path: introPath } as never);
		expect(fileSystem.readFileSync(cacheFile)).not.toContain('"slug":"intro"');
	});

	test('collectDevPrewarmPlan honors collection pathnames and readiness', async () => {
		const rootDir = createTempRoot('ecopages-content-prewarm-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		fileSystem.ensureDir(contentDir);
		fileSystem.write(
			path.join(contentDir, 'intro.mdx'),
			`---
title: Intro
description: Welcome
order: 1
---
# Intro
`,
		);

		const plugin = contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						schema: testContentSchema,
						routePrefix: '/docs',
						devPrewarm: 'first',
						devPrewarmReadiness: 'beforeReady',
					},
				},
			},
		});

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		expect(await plugin.collectDevPrewarmPlan()).toEqual({
			pathnames: ['/docs/intro'],
			readiness: 'beforeReady',
		});
	});

	test('generates separate client and server collection modules', async () => {
		const rootDir = createTempRoot('ecopages-content-processor-split-');
		tempRoots.push(rootDir);

		const contentDir = path.join(rootDir, 'src', 'content', 'docs');
		fileSystem.ensureDir(contentDir);
		for (let index = 0; index < 5; index += 1) {
			fileSystem.write(
				path.join(contentDir, `entry-${index}.mdx`),
				`---
title: Entry ${index}
description: Test
order: ${index}
---
# Entry ${index}
`,
			);
		}

		const plugin = createContentProcessorPlugin({
			docs: { contentDir: 'content/docs' },
		});

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const workDir = appConfig.absolutePaths.workDir;
		const clientCacheFile = path.join(workDir, GENERATED_BASE_PATHS.cache, plugin.name, 'docs.ts');
		const serverCacheFile = path.join(workDir, GENERATED_BASE_PATHS.cache, plugin.name, 'docs.server.ts');

		expect(fileSystem.exists(clientCacheFile)).toBe(true);
		expect(fileSystem.exists(serverCacheFile)).toBe(true);
		expect(fileSystem.readFileSync(clientCacheFile)).not.toContain('export async function getComponent');
		expect(fileSystem.readFileSync(serverCacheFile)).toContain('export async function getComponent');
		expect(fileSystem.readFileSync(serverCacheFile).match(/import\(/g)?.length ?? 0).toBe(5);
	});
});
