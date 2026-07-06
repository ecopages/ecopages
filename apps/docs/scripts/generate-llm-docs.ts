import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineDocsKit } from '../src/lib/docs-kit/config';
import type { DocsSiteContent, DocsSiteContentMeta } from '../src/lib/docs-kit/content/docs-site-content.types';
import type { DocsMdxComponent } from '../src/lib/docs-kit/mdx/docs-mdx.types';
import { getContentFilePath } from '../src/lib/docs-kit/manifest/build-docs-manifest';
import { getDocsManifest } from '../src/lib/docs-kit/manifest/get-docs-manifest';
import { SKILL_REFERENCE_MODULES } from './skill-reference-modules';

const docsRoot = join(import.meta.dirname, '..');
const publicRoot = join(docsRoot, 'src/public');

function withStubContent(meta: DocsSiteContentMeta): DocsSiteContent {
	const stub: DocsMdxComponent = () => null;

	return {
		rootDir: meta.rootDir,
		sections: meta.sections.map((section) => ({
			...section,
			pages: section.pages.map((page) => ({
				...page,
				content: stub,
			})),
		})),
	};
}

async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
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
export async function generateLlmDocs(outputRoot = publicRoot): Promise<void> {
	const manifest = await getDocsManifest();
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

	for (const section of manifest.sections) {
		lines.push(`## ${section.title}`);

		for (const page of section.pages) {
			if (page.llms === false) {
				continue;
			}

			const sourcePath = getContentFilePath(page.section, page.slug);
			const body = await readFile(sourcePath, 'utf8');
			const outputPath = join(llmRoot, page.section, `${page.slug}.md`);
			await ensureDir(dirname(outputPath));
			await writeFile(outputPath, body, 'utf8');

			const url = `${baseUrl}/docs-llm/${page.section}/${page.slug}.md`;
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

	await ensureDir(outputRoot);
	await writeFile(join(outputRoot, 'llms.txt'), lines.join('\n'), 'utf8');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	const { docsSiteContentMeta } = await import('../src/content/docs/content.meta');

	defineDocsKit({
		rootDir: docsRoot,
		content: withStubContent(docsSiteContentMeta),
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
	await generateLlmDocs();
	console.log(`[llms] Generated ${join(publicRoot, 'llms.txt')} and ${join(publicRoot, 'docs-llm')}/`);
}
