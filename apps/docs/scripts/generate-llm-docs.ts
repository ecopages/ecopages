import { mkdir, writeFile } from 'node:fs/promises';
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
import { SKILL_REFERENCE_MODULES } from './skill-reference-modules';

const docsRoot = join(import.meta.dirname, '..');
const publicRoot = join(docsRoot, 'src/public');
const defaultContentRoot = join(docsRoot, 'src/content/docs');

export type GenerateLlmDocsOptions = {
	contentRoot?: string;
};

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
 * Agent-facing contract:
 * - `llms.txt` is a `.txt` discovery index only.
 * - Linked page bodies live under `docs-llm/<section>/<slug>.md`.
 * - Progressive build guidance lives under `skill.txt` and `skill/reference/*.md`.
 */
export async function generateLlmDocs(outputRoot = publicRoot, options: GenerateLlmDocsOptions = {}): Promise<void> {
	const scanner = createScanner(options.contentRoot ?? defaultContentRoot);
	const posts = await scanner.getManifest();
	const llmRoot = join(outputRoot, 'docs-llm');
	const lines: string[] = [
		'# Ecopages Documentation',
		'> Ecopages is a static site generator written in TypeScript.',
		'',
		'## How to use this file',
		'',
		'- This `llms.txt` file is an index only.',
		'- Follow links to `/docs-llm/<section>/<slug>.md` for full page exports.',
		'- For a progressive build guide, start at `/skill.txt` or `/skill/SKILL.md`.',
		'',
	];

	const baseUrl = process.env.ECOPAGES_BASE_URL ?? 'https://ecopages.app';
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
			const outputPath = join(llmRoot, sectionId, `${pageSlug}.md`);
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, body, 'utf8');

			const url = `${baseUrl}/docs-llm/${sectionId}/${pageSlug}.md`;
			lines.push(`- [${page.title}](${url})`);
		}

		lines.push('');
	}

	lines.push('## Agent Skill');
	lines.push('');
	lines.push(`- [Skill index](${baseUrl}/skill.txt)`);
	lines.push(`- [SKILL.md](${baseUrl}/skill/SKILL.md)`);

	for (const module of SKILL_REFERENCE_MODULES) {
		if (module.path === 'SKILL.md') {
			continue;
		}

		lines.push(`- [${module.title}](${baseUrl}/skill/${module.path})`);
	}

	lines.push('');

	await mkdir(outputRoot, { recursive: true });
	await writeFile(join(outputRoot, 'llms.txt'), lines.join('\n'), 'utf8');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	await generateLlmDocs();
	console.log(`[llms] Generated ${join(publicRoot, 'llms.txt')} and ${join(publicRoot, 'docs-llm')}/`);
}
