import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContentScanner } from '@ecopages/content-processor';
import { compareDocsEntries, docsFrontmatterSchema, type DocsFrontmatter } from '../src/content/docs';
import { configuredSiteOrigin, normalizeSiteOrigin } from '../src/lib/docs/site-meta';
import {
	appendAgentSkillSection,
	exportLlmSectionPages,
	groupPostsBySection,
	orderedSectionIds,
} from './llm-docs-export';

const docsRoot = join(import.meta.dirname, '..');
const publicRoot = join(docsRoot, 'src/public');
const defaultContentRoot = join(docsRoot, 'src/content/docs');

export type GenerateLlmDocsOptions = {
	contentRoot?: string;
	/**
	 * Site origin used in `llms.txt` links. Defaults to `configuredSiteOrigin()`.
	 */
	baseUrl?: string;
};

function llmDocsOrigin(baseUrl?: string): string {
	return normalizeSiteOrigin(baseUrl ?? configuredSiteOrigin());
}

function createScanner(contentRoot: string): ContentScanner<DocsFrontmatter> {
	return new ContentScanner({
		contentRoot,
		schema: docsFrontmatterSchema,
		orderBy: compareDocsEntries,
	});
}

function buildLlmsTxtPreamble(): string[] {
	return [
		'# Ecopages Documentation',
		'> Ecopages is an HTML-first TypeScript framework. It builds static pages by default and adds islands or server routes when needed.',
		'',
		'## When to use this',
		'',
		'Reach for Ecopages when you are:',
		'',
		'- Scaffolding a new HTML-first multi-page app (`pnpx ecopages init`).',
		'- Authoring Pages and Layouts, then picking an Integration (Ecopages JSX, React, Lit, KitaJS, or MDX).',
		'- Choosing a Cache Strategy (static, dynamic, or revalidate) or adding typed handlers only when a Page needs more than static HTML.',
		'',
		'Do not use this site as a hosted SaaS or authenticated API. It is documentation and generated markdown for the open-source framework.',
		'',
		'## How to read the docs',
		'',
		'- This `llms.txt` file is an index only.',
		'- Follow links to `/docs-llm/<section>/<slug>.md` for full page exports (HTML pages also advertise that URL as `rel=alternate`).',
		'- For a progressive build guide, start at `/skill.txt` or `/skill/SKILL.md`.',
		'',
		'## CLI',
		'',
		'- npm package: [`ecopages`](https://www.npmjs.com/package/ecopages).',
		'- Run without installing: `pnpx ecopages` or `npx ecopages`.',
		'- Guide: `/docs/ecosystem/ecopages` (markdown export: `/docs-llm/ecosystem/ecopages.md`).',
		'',
	];
}

/**
 * Writes generated Markdown page bodies and `llms.txt` into the public directory for static serving.
 *
 * @remarks
 * Agent-facing contract:
 * - `llms.txt` is a `.txt` discovery index only (when-to-use, CLI, section links).
 * - Linked page bodies live under `docs-llm/<section>/<slug>.md`.
 * - Progressive build guidance lives under `skill.txt` and `skill/reference/*.md`.
 * - `docs-llm/` is generator-owned: each successful run replaces that tree so deleted or `llms: false` pages are not left public.
 * - Output is staged in `.docs-llm-staging/` and swapped in only after all writes succeed; a failed run leaves the previous exports intact and removes the staging tree.
 */
export async function generateLlmDocs(outputRoot = publicRoot, options: GenerateLlmDocsOptions = {}): Promise<void> {
	const scanner = createScanner(options.contentRoot ?? defaultContentRoot);
	const posts = await scanner.getManifest();
	const llmRoot = join(outputRoot, 'docs-llm');
	const stagingRoot = join(outputRoot, '.docs-llm-staging');
	const origin = llmDocsOrigin(options.baseUrl);

	try {
		await rm(stagingRoot, { recursive: true, force: true });
		await mkdir(stagingRoot, { recursive: true });
		const lines = buildLlmsTxtPreamble();
		const sections = groupPostsBySection(posts);

		for (const sectionId of orderedSectionIds(sections)) {
			const sectionPosts = sections.get(sectionId);
			if (!sectionPosts || sectionPosts.length === 0) {
				continue;
			}

			await exportLlmSectionPages(scanner, sectionId, sectionPosts, stagingRoot, origin, lines);
		}

		appendAgentSkillSection(lines, origin);

		await mkdir(outputRoot, { recursive: true });
		await writeFile(join(outputRoot, 'llms.txt'), lines.join('\n'), 'utf8');
		await rm(llmRoot, { recursive: true, force: true });
		await rename(stagingRoot, llmRoot);
	} finally {
		await rm(stagingRoot, { recursive: true, force: true });
	}
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	await generateLlmDocs(publicRoot);
	console.log(`[llms] Generated ${join(publicRoot, 'llms.txt')} and ${join(publicRoot, 'docs-llm')}/`);
}
