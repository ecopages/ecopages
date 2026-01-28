import { join, dirname, basename } from 'path';
import { exists, mkdir, readdir } from 'node:fs/promises';

const ROOT_DIR = join(import.meta.dir, '..');
const SRC_DOCS_DIR = join(ROOT_DIR, 'src/pages/docs');
const ECO_DIR = join(ROOT_DIR, '.eco');
const OUTPUT_CONTENT_DIR = join(ECO_DIR, 'llms-content');
const OUTPUT_LLMS_FILE = join(ECO_DIR, 'llms.txt');

async function ensureDir(path: string) {
	if (!(await exists(path))) {
		await mkdir(path, { recursive: true });
	}
}

async function scanDocs(
	dir: string,
	relativePath = '',
): Promise<Array<{ filePath: string; relativePath: string; title: string }>> {
	const results: Array<{ filePath: string; relativePath: string; title: string }> = [];

	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		const newRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			const subResults = await scanDocs(fullPath, newRelativePath);
			results.push(...subResults);
		} else if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
			const baseName = basename(entry.name, entry.name.endsWith('.mdx') ? '.mdx' : '.md');
			const pathWithoutExt = relativePath ? `${relativePath}/${baseName}` : baseName;

			const title = baseName
				.split('-')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');

			results.push({
				filePath: fullPath,
				relativePath: pathWithoutExt,
				title,
			});
		}
	}

	return results;
}

function groupBySection(
	files: Array<{ filePath: string; relativePath: string; title: string }>,
): Map<string, Array<{ filePath: string; relativePath: string; title: string }>> {
	const sections = new Map<string, Array<{ filePath: string; relativePath: string; title: string }>>();

	for (const file of files) {
		const parts = file.relativePath.split('/');
		const section = parts[0] || 'other';

		if (!sections.has(section)) {
			sections.set(section, []);
		}
		sections.get(section)?.push(file);
	}

	return sections;
}

async function main() {
	await ensureDir(ECO_DIR);
	await ensureDir(OUTPUT_CONTENT_DIR);

	const files = await scanDocs(SRC_DOCS_DIR);
	const sections = groupBySection(files);

	const sectionOrder = ['getting-started', 'core', 'server', 'ecosystem', 'integrations', 'plugins', 'reference'];

	const outputLines: string[] = [
		'# Ecopages Documentation',
		'> Ecopages is a static site generator written in TypeScript.',
		'',
	];

	const baseUrl = process.env.ECOPAGES_BASE_URL || 'https://ecopages.app';

	for (const section of sectionOrder) {
		const sectionFiles = sections.get(section);
		if (!sectionFiles || sectionFiles.length === 0) continue;

		const sectionTitle = section
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');

		outputLines.push(`## ${sectionTitle}`);

		for (const file of sectionFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
			const destFile = join(OUTPUT_CONTENT_DIR, `${file.relativePath}.txt`);
			const destDir = dirname(destFile);

			await ensureDir(destDir);

			const fileContent = await Bun.file(file.filePath).text();
			await Bun.write(destFile, fileContent);

			const url = `${baseUrl}/llms-content/${file.relativePath}.txt`;
			outputLines.push(`- [${file.title}](${url})`);
		}

		outputLines.push('');
	}

	await Bun.write(OUTPUT_LLMS_FILE, outputLines.join('\n'));
	console.log(`[llms.txt] Successfully generated at ${OUTPUT_LLMS_FILE}`);
	console.log(`[llms.txt] Generated ${files.length} documentation files`);
}

main().catch(console.error);
