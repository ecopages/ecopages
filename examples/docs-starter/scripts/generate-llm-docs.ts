import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineDocsKit } from '../src/docs-kit/config';
import { getContentFilePath } from '../src/docs-kit/manifest/build-docs-manifest';
import { getDocsManifest } from '../src/docs-kit/manifest/get-docs-manifest';

const appRoot = join(import.meta.dirname, '..');
const publicRoot = join(appRoot, 'src/public');

async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

/**
 * Writes raw MDX bodies and `llms.txt` into the public directory for static serving.
 *
 * @remarks
 * - `llms.txt` is a `.txt` discovery index only.
 * - Linked page bodies live under `docs-llm/<section>/<slug>.md`.
 */
export async function generateLlmDocs(outputRoot = publicRoot): Promise<void> {
	const manifest = await getDocsManifest();
	const llmRoot = join(outputRoot, 'docs-llm');
	const baseUrl = process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';
	const lines: string[] = [
		'# Docs Starter',
		'> Minimal Ecopages docs site template.',
		'',
		'## How to use this file',
		'',
		'- This `llms.txt` file is an index only.',
		'- Follow links to `/docs-llm/<section>/<slug>.md` for full page exports.',
		'',
	];

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

	await ensureDir(outputRoot);
	await writeFile(join(outputRoot, 'llms.txt'), lines.join('\n'), 'utf8');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	const { docsSiteContentMeta } = await import('../src/content/docs/content.meta.ts');
	const { stubDocsSiteContent } = await import('../src/content/docs/attach-docs-content-modules.ts');

	defineDocsKit({
		rootDir: appRoot,
		content: stubDocsSiteContent(docsSiteContentMeta),
		mdxComponents: {},
		shellLayout: () => null,
		layoutComponents: [],
	});
	await generateLlmDocs();
	console.log(`[llms] Generated ${join(publicRoot, 'llms.txt')} and ${join(publicRoot, 'docs-llm')}/`);
}
