import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import '../src/docs-kit.instance';
import { getContentFilePath } from '../src/lib/docs-kit/manifest/build-docs-manifest';
import { getDocsManifest } from '../src/lib/docs-kit/manifest/get-docs-manifest';

const docsRoot = join(import.meta.dirname, '..');
const publicRoot = join(docsRoot, 'src/public');

async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

/**
 * Writes raw MDX bodies and `llms.txt` into the public directory for static serving.
 */
export async function generateLlmDocs(outputRoot = publicRoot): Promise<void> {
	const manifest = await getDocsManifest();
	const llmRoot = join(outputRoot, 'docs-llm');
	const lines: string[] = [
		'# Ecopages Documentation',
		'> Ecopages is a static site generator written in TypeScript.',
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

	await ensureDir(outputRoot);
	await writeFile(join(outputRoot, 'llms.txt'), lines.join('\n'), 'utf8');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	await generateLlmDocs();
	console.log(`[llms] Generated ${join(publicRoot, 'llms.txt')} and ${join(publicRoot, 'docs-llm')}/`);
}
