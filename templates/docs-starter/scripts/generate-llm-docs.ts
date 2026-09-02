import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContentScanner } from '@ecopages/content-processor';
import {
	compareDocsEntries,
	DOCS_SECTION_CONFIG,
	docsFrontmatterSchema,
	LLM_SECTION_ORDER,
	type DocsFrontmatter,
} from '../src/content/docs';
import { absoluteUrl, configuredSiteOrigin, normalizeSiteOrigin } from '../src/lib/docs/site-meta';

const appRoot = join(import.meta.dirname, '..');
const publicRoot = join(appRoot, 'src/public');
const defaultContentRoot = join(appRoot, 'src/content/docs');

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

/**
 * Writes raw MDX bodies and `llms.txt` into the public directory for static serving.
 *
 * @remarks
 * - `llms.txt` is a `.txt` discovery index only (when-to-use, CLI, section links).
 * - Linked page bodies live under `docs-llm/<section>/<slug>.md`.
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
		const lines: string[] = [
			'# Docs Starter',
			'> Minimal Ecopages docs site template.',
			'',
			'## When to use this',
			'',
			'Reach for this starter when you are:',
			'',
			'- Scaffolding an Ecopages documentation site (`npx ecopages init` and choose docs-starter).',
			'- Authoring MDX docs pages under `src/content/docs` with a catch-all route, sidebar, and Copy for LLM.',
			'- Pointing agents at generated markdown via this index and `/docs-llm/<section>/<slug>.md`.',
			'',
			'This template is documentation, not a hosted SaaS or authenticated API.',
			'',
			'## How to read the docs',
			'',
			'- This `llms.txt` file is an index only.',
			'- Follow links to `/docs-llm/<section>/<slug>.md` for full page exports (HTML pages also advertise that URL as `rel=alternate`).',
			'',
			'## CLI',
			'',
			'- npm package: [`ecopages`](https://www.npmjs.com/package/ecopages).',
			'- Run without installing: `npx ecopages`, `pnpm dlx ecopages`, or `bunx ecopages`.',
			'',
		];

		const sections = new Map<string, typeof posts>();

		for (const post of posts) {
			const sectionId = post.segments[0] ?? 'other';
			if (!sections.has(sectionId)) {
				sections.set(sectionId, []);
			}
			sections.get(sectionId)!.push(post);
		}

		const orderedSections = [
			...LLM_SECTION_ORDER.filter((section) => sections.has(section)),
			...Array.from(sections.keys())
				.filter((section) => !LLM_SECTION_ORDER.includes(section as (typeof LLM_SECTION_ORDER)[number]))
				.sort((a, b) => a.localeCompare(b)),
		];

		for (const sectionId of orderedSections) {
			const sectionPosts = sections.get(sectionId);
			if (!sectionPosts || sectionPosts.length === 0) {
				continue;
			}

			const sectionTitle = DOCS_SECTION_CONFIG[sectionId as keyof typeof DOCS_SECTION_CONFIG]?.title ?? sectionId;
			lines.push(`## ${sectionTitle}`);

			for (const page of sectionPosts) {
				if (page.llms === false) {
					continue;
				}

				const pageSlug = page.segments[page.segments.length - 1]!;
				const body = await scanner.getRawContent(page.slug);
				const outputPath = join(stagingRoot, sectionId, `${pageSlug}.md`);
				await mkdir(dirname(outputPath), { recursive: true });
				await writeFile(outputPath, body, 'utf8');

				const url = absoluteUrl(`/docs-llm/${sectionId}/${pageSlug}.md`, origin);
				lines.push(`- [${page.title}](${url})`);
			}

			lines.push('');
		}

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
