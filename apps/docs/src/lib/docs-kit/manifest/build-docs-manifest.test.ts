import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { defineDocsKit, getDocsKit } from '../config';
import { docsManifestConfig } from './docs-manifest.config';
import { buildDocsManifest } from './build-docs-manifest';
import { clearDocsManifestCache } from './get-docs-manifest';

const contentRoot = join(import.meta.dirname, '../../../content/docs');

test('buildDocsManifest preserves semantic section and page order', async () => {
	const manifest = await buildDocsManifest();

	expect(manifest.sections[0]?.id).toBe('getting-started');
	expect(manifest.sections[0]?.pages[0]?.slug).toBe('introduction');
	expect(manifest.sections[1]?.pages[0]?.slug).toBe('concepts');
	expect(manifest.sections.flatMap((section) => section.pages)).toHaveLength(43);
});

test('buildDocsManifest loads description from sibling meta file', async () => {
	const metaPath = join(contentRoot, 'getting-started/introduction.meta.json');
	await mkdir(join(contentRoot, 'getting-started'), { recursive: true });
	await writeFile(metaPath, JSON.stringify({ description: 'Test description' }), 'utf8');

	clearDocsManifestCache();
	const manifest = await buildDocsManifest();
	const introduction = manifest.sections[0]?.pages.find((page) => page.slug === 'introduction');

	expect(introduction?.description).toBe('Test description');
});

test('buildDocsManifest throws when a manifest entry has no content file', async () => {
	await expect(
		buildDocsManifest({
			rootDir: '/docs',
			sections: [
				{
					id: 'missing',
					title: 'Missing',
					pages: [{ section: 'missing', slug: 'page', title: 'Missing Page' }],
				},
			],
		}),
	).rejects.toThrow(/Manifest entry has no content file/);
});

test('buildDocsManifest throws when a content file is missing from the manifest', async () => {
	const kit = getDocsKit();
	const manifestWithoutIntroduction = {
		...kit.manifest,
		sections: kit.manifest.sections.map((section) =>
			section.id === 'getting-started'
				? {
						...section,
						pages: section.pages.filter((page) => page.slug !== 'introduction'),
					}
				: section,
		),
	};

	defineDocsKit({ ...kit, manifest: manifestWithoutIntroduction });
	clearDocsManifestCache();

	try {
		await expect(buildDocsManifest()).rejects.toThrow(/Content files are not listed in the docs manifest/);
	} finally {
		defineDocsKit({ ...kit, manifest: docsManifestConfig });
		clearDocsManifestCache();
	}
});

test('buildDocsManifest respects llms:false in meta file', async () => {
	const metaPath = join(contentRoot, 'getting-started/installation.meta.json');
	await mkdir(join(contentRoot, 'getting-started'), { recursive: true });
	await writeFile(metaPath, JSON.stringify({ llms: false }), 'utf8');

	clearDocsManifestCache();
	const manifest = await buildDocsManifest();
	const installation = manifest.sections[0]?.pages.find((page) => page.slug === 'installation');

	expect(installation?.llms).toBe(false);
});
