import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { GENERATED_BASE_PATHS } from '@ecopages/core/constants';
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
		expect(fileSystem.readFileSync(serverCacheFile)).toContain('export function getComponent');
		expect(fileSystem.readFileSync(serverCacheFile)).toContain('export function getEntryDependencies');
		expect(fileSystem.exists(typesFile)).toBe(true);
		expect(fileSystem.readFileSync(typesFile)).toContain('declare module "ecopages:content/docs"');
		expect(fileSystem.readFileSync(typesFile)).toContain('declare module "ecopages:content/docs/server"');
		expect(plugin.collectionModules.docs).toBe(cacheFile);
		expect(plugin.collectionServerModules.docs).toBe(serverCacheFile);
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

		await plugin.watchConfig?.onChange?.({ path: introPath } as never);

		expect(fileSystem.readFileSync(cacheFile)).toBe(entriesBefore);
		expect(fileSystem.readFileSync(serverCacheFile)).toBe(serverBefore);
		expect(fileSystem.readFileSync(typesFile)).toBe(typesBefore);
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

		await plugin.watchConfig?.onChange?.({ path: introPath } as never);

		expect(fileSystem.readFileSync(cacheFile)).not.toBe(entriesBefore);
		expect(fileSystem.readFileSync(cacheFile)).toContain('Intro Updated');
		expect(fileSystem.readFileSync(serverCacheFile)).toBe(serverBefore);
	});
});
