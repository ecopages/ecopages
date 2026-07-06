import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { defineDocsKit, clearDocsKitConfig } from '../src/lib/docs-kit/config';
import { clearDocsManifestCache } from '../src/lib/docs-kit/manifest/get-docs-manifest';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceContentRoot = join(appRoot, 'src/content/docs');

let contentRoot = '';

beforeAll(async () => {
	contentRoot = await mkdtemp(join(tmpdir(), 'docs-llm-content-'));
	const gettingStartedDir = join(contentRoot, 'getting-started');
	const llmsFixtureDir = join(contentRoot, 'llms-fixture');
	await mkdir(gettingStartedDir, { recursive: true });
	await mkdir(llmsFixtureDir, { recursive: true });
	await copyFile(
		join(sourceContentRoot, 'getting-started/introduction.mdx'),
		join(gettingStartedDir, 'introduction.mdx'),
	);
	await copyFile(
		join(sourceContentRoot, 'getting-started/installation.mdx'),
		join(gettingStartedDir, 'installation.mdx'),
	);
	await writeFile(join(llmsFixtureDir, 'excluded.mdx'), '# Excluded from LLM export', 'utf8');

	defineDocsKit({
		rootDir: appRoot,
		contentRoot,
		content: {
			rootDir: '/docs',
			sections: [
				{
					id: 'getting-started',
					title: 'Getting Started',
					pages: [
						{
							slug: 'introduction',
							title: 'Introduction',
							description: 'Intro.',
							content: () => null,
						},
						{
							slug: 'installation',
							title: 'Installation',
							description: 'Install.',
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
		},
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
});

afterAll(async () => {
	clearDocsKitConfig();
	clearDocsManifestCache();
	if (contentRoot) {
		await rm(contentRoot, { recursive: true, force: true });
	}
});

test('generateLlmDocs writes llms.txt and markdown exports', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-output-'));

	try {
		const { generateLlmDocs } = await import('./generate-llm-docs');
		await generateLlmDocs(outputRoot);

		const llmsTxt = await readFile(join(outputRoot, 'llms.txt'), 'utf8');
		expect(llmsTxt).toContain('Introduction');
		expect(llmsTxt).toContain('Installation');
		expect(llmsTxt).not.toContain('Excluded');
		expect(llmsTxt).toContain('## Agent Skill');
		expect(llmsTxt).toContain('/skill/SKILL.md');
		expect(llmsTxt).toContain('/skill/reference/processors-and-plugins.md');

		const introduction = await readFile(join(outputRoot, 'docs-llm/getting-started/introduction.md'), 'utf8');
		expect(introduction).toContain('# Welcome to Ecopages');
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});
