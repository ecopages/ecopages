import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { getDocsLlmUrlFromPathname } from '../src/lib/docs/docs-llm-url';
import { DOCS_SITEMAP_EXTRA_URLS, docsPageHeadLinks } from '../src/lib/docs/site-meta';
import { toLlmMarkdown } from './llm-markdown';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceContentRoot = join(appRoot, 'src/content/docs');
const publicRoot = join(appRoot, 'src/public');

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
	await writeFile(
		join(llmsFixtureDir, 'excluded.mdx'),
		`---
title: "Excluded"
description: "Excluded from LLM exports."
order: 1
llms: false
---

# Excluded from LLM export
`,
		'utf8',
	);
});

afterAll(async () => {
	if (contentRoot) {
		await rm(contentRoot, { recursive: true, force: true });
	}
});

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

test('generateLlmDocs writes llms.txt and markdown exports', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-output-'));

	try {
		const { generateLlmDocs } = await import('./generate-llm-docs');
		await generateLlmDocs(outputRoot, { contentRoot });

		const llmsTxt = await readFile(join(outputRoot, 'llms.txt'), 'utf8');
		expect(llmsTxt).toContain('Introduction');
		expect(llmsTxt).toContain('Installation');
		expect(llmsTxt).not.toContain('Excluded');
		expect(llmsTxt).toContain('## When to use this');
		expect(llmsTxt).toContain('Scaffolding a new HTML-first multi-page app');
		expect(llmsTxt).toContain('## How to read the docs');
		expect(llmsTxt).toContain('This `llms.txt` file is an index only.');
		expect(llmsTxt).toContain('/docs-llm/<section>/<slug>.md');
		expect(llmsTxt).toContain('## CLI');
		expect(llmsTxt).toContain('pnpx ecopages');
		expect(llmsTxt).toContain('npx ecopages');
		expect(llmsTxt).not.toContain('bunx ecopages');
		expect(llmsTxt).toContain('/docs/ecosystem/ecopages');
		expect(llmsTxt).toContain('## Agent Skill');
		expect(llmsTxt).toContain('/skill/SKILL.md');
		expect(llmsTxt).toContain('/skill/reference/processors-and-plugins.md');

		const introduction = await readFile(join(outputRoot, 'docs-llm/getting-started/introduction.md'), 'utf8');
		expect(introduction).toContain('# Welcome to Ecopages');
		expect(introduction).not.toContain('import { CodeTabs }');
		expect(introduction).not.toContain('<CodeTabs');
		expect(introduction).toContain('**npm**');
		expect(await pathExists(join(outputRoot, 'docs-llm/llms-fixture/excluded.md'))).toBe(false);
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});

test('toLlmMarkdown removes UI-only MDX from agent exports', () => {
	const markdown = toLlmMarkdown(`
import { RuiAlert } from '@ecopages/radiant-ui/alert';

# Example

<RuiAlert><RuiAlertTitle>Note</RuiAlertTitle><RuiAlertDescription>Read the [guide](https://example.com/guide).</RuiAlertDescription></RuiAlert>

<EcoImage src="/hero.png" alt="Hero" />

\`\`\`tsx
<EcoImage src="/hero.png" alt="Hero" />
\`\`\`
`);

	expect(markdown).toContain('> **Note:**');
	expect(markdown).toContain('[guide](https://example.com/guide)');
	expect(markdown).toContain('![Hero](/hero.png)');
	expect(markdown).not.toContain('<RuiAlert');
	expect(markdown).not.toContain('<EcoImage src="/hero.png" alt="Hero" />\n\n```');
	expect(markdown).toContain('```tsx\n<EcoImage src="/hero.png" alt="Hero" />');
});

test('generateLlmDocs leaves no staging directory behind', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-staging-cleanup-'));

	try {
		const { generateLlmDocs } = await import('./generate-llm-docs');
		await generateLlmDocs(outputRoot, { contentRoot });

		expect(await pathExists(join(outputRoot, '.docs-llm-staging'))).toBe(false);
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});

test('generateLlmDocs replaces stale generator-owned exports', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-stale-'));

	try {
		await mkdir(join(outputRoot, 'docs-llm/stale-section'), { recursive: true });
		await mkdir(join(outputRoot, 'docs-llm/llms-fixture'), { recursive: true });
		await writeFile(join(outputRoot, 'docs-llm/stale-section/gone.md'), '# Obsolete export\n', 'utf8');
		await writeFile(join(outputRoot, 'docs-llm/llms-fixture/excluded.md'), '# Should be removed\n', 'utf8');

		const { generateLlmDocs } = await import('./generate-llm-docs');
		await generateLlmDocs(outputRoot, { contentRoot });

		expect(await pathExists(join(outputRoot, 'docs-llm/stale-section/gone.md'))).toBe(false);
		expect(await pathExists(join(outputRoot, 'docs-llm/llms-fixture/excluded.md'))).toBe(false);
		expect(await pathExists(join(outputRoot, 'docs-llm/getting-started/introduction.md'))).toBe(true);
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});

test('generateLlmDocs index links, HTML alternates, and sitemap extras stay consistent', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-contract-'));
	const origin = 'https://docs.example.com/';

	try {
		const { generateLlmDocs } = await import('./generate-llm-docs');
		await generateLlmDocs(outputRoot, { contentRoot, baseUrl: origin });

		const llmsTxt = await readFile(join(outputRoot, 'llms.txt'), 'utf8');
		expect(llmsTxt).not.toContain('https://docs.example.com//');

		const pageLinks = [...llmsTxt.matchAll(/\]\((https?:\/\/[^)]+\/docs-llm\/[^)]+)\)/g)].map((match) => match[1]);
		expect(pageLinks.length).toBeGreaterThan(0);

		for (const href of pageLinks) {
			const url = new URL(href);
			expect(url.origin).toBe('https://docs.example.com');
			expect(await pathExists(join(outputRoot, url.pathname.slice(1)))).toBe(true);

			const segments = url.pathname.replace(/^\//, '').replace(/\.md$/, '').split('/');
			const section = segments[1];
			const slug = segments[2];
			expect(section).toBeDefined();
			expect(slug).toBeDefined();
			expect(getDocsLlmUrlFromPathname(`/docs/${section}/${slug}`)).toBe(url.pathname);
			expect(docsPageHeadLinks(`/docs/${section}/${slug}`, origin).markdownAlternate).toBe(href);
			expect(docsPageHeadLinks(`/docs/${section}/${slug}`, origin).canonical).toBe(
				`https://docs.example.com/docs/${section}/${slug}`,
			);
		}

		for (const extraUrl of DOCS_SITEMAP_EXTRA_URLS) {
			const relativePath = extraUrl.replace(/^\//, '');
			const generatedPath = join(outputRoot, relativePath);
			const publicPath = join(publicRoot, relativePath);
			expect((await pathExists(generatedPath)) || (await pathExists(publicPath))).toBe(true);
		}
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});
