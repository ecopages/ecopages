import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { DocsSiteContent } from '../content/docs-site-content.types';
import { defineDocsKit, clearDocsKitConfig } from '../config';
import { buildDocsManifest } from './build-docs-manifest';
import { clearDocsManifestCache } from './get-docs-manifest';

const appRoot = path.resolve(import.meta.dirname, '../../../..');

const testContent = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			pages: [
				{
					slug: 'introduction',
					title: 'Introduction',
					description: 'Test description',
					content: () => null,
				},
				{
					slug: 'installation',
					title: 'Installation',
					description: 'Install Ecopages.',
					content: () => null,
				},
			],
		},
		{
			id: 'core',
			title: 'Core Concepts',
			pages: [
				{
					slug: 'concepts',
					title: 'Concepts',
					description: 'Core concepts.',
					content: () => null,
				},
			],
		},
		{
			id: 'llms-fixture',
			title: 'LLM Fixture',
			pages: [
				{
					slug: 'excluded',
					title: 'Excluded',
					description: 'Excluded from LLM exports.',
					llms: false,
					content: () => null,
				},
			],
		},
	],
} satisfies DocsSiteContent;

let contentRoot = join(appRoot, 'src/content/docs');

beforeAll(async () => {
	contentRoot = await mkdtemp(join(tmpdir(), 'docs-manifest-content-'));
	const gettingStartedDir = join(contentRoot, 'getting-started');
	const coreDir = join(contentRoot, 'core');
	const llmsFixtureDir = join(contentRoot, 'llms-fixture');
	await mkdir(gettingStartedDir, { recursive: true });
	await mkdir(coreDir, { recursive: true });
	await mkdir(llmsFixtureDir, { recursive: true });
	await writeFile(join(gettingStartedDir, 'introduction.mdx'), '# Introduction', 'utf8');
	await writeFile(join(gettingStartedDir, 'installation.mdx'), '# Installation', 'utf8');
	await writeFile(join(coreDir, 'concepts.mdx'), '# Concepts', 'utf8');
	await writeFile(join(llmsFixtureDir, 'excluded.mdx'), '# Excluded', 'utf8');

	defineDocsKit({
		rootDir: appRoot,
		contentRoot,
		content: testContent,
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
});

afterAll(async () => {
	clearDocsKitConfig();
	clearDocsManifestCache();
	await rm(contentRoot, { recursive: true, force: true });
});

test('buildDocsManifest preserves semantic section and page order', async () => {
	const manifest = await buildDocsManifest(testContent);

	expect(manifest.sections[0]?.id).toBe('getting-started');
	expect(manifest.sections[0]?.pages[0]?.slug).toBe('introduction');
	expect(manifest.sections[1]?.pages[0]?.slug).toBe('concepts');
});

test('buildDocsManifest carries description from content tree', async () => {
	clearDocsManifestCache();
	const manifest = await buildDocsManifest(testContent);
	const introduction = manifest.sections[0]?.pages.find((page) => page.slug === 'introduction');

	expect(introduction?.description).toBe('Test description');
});

test('buildDocsManifest throws when a content entry has no MDX file', async () => {
	await expect(
		buildDocsManifest({
			rootDir: '/docs',
			sections: [
				{
					id: 'missing',
					title: 'Missing',
					pages: [
						{
							slug: 'page',
							title: 'Missing Page',
							description: 'Missing page.',
							content: () => null,
						},
					],
				},
			],
		}),
	).rejects.toThrow(/Docs content entry has no MDX file/);
});

test('buildDocsManifest throws when a content file is missing from site content', async () => {
	const orphanRoot = await mkdtemp(join(tmpdir(), 'docs-content-orphan-'));
	await mkdir(join(orphanRoot, 'getting-started'), { recursive: true });
	await writeFile(join(orphanRoot, 'getting-started/orphan.mdx'), '# Orphan', 'utf8');

	defineDocsKit({
		rootDir: appRoot,
		contentRoot: orphanRoot,
		content: { rootDir: '/docs', sections: [] },
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
	clearDocsManifestCache();

	await expect(buildDocsManifest()).rejects.toThrow(/Content files are not listed in docs site content/);

	defineDocsKit({
		rootDir: appRoot,
		contentRoot,
		content: testContent,
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
	clearDocsManifestCache();
});

test('buildDocsManifest carries llms:false from content tree', async () => {
	clearDocsManifestCache();
	const manifest = await buildDocsManifest(testContent);
	const excluded = manifest.sections
		.find((section) => section.id === 'llms-fixture')
		?.pages.find((page) => page.slug === 'excluded');

	expect(excluded?.llms).toBe(false);
});
