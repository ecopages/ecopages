import { join, dirname } from 'path';
import { exists, mkdir } from 'node:fs/promises';

const ROOT_DIR = join(import.meta.dir, '..');
const SRC_DOCS_DIR = join(ROOT_DIR, 'src/pages/docs');
const PUBLIC_DIR = join(ROOT_DIR, 'src/public');
const OUTPUT_CONTENT_DIR = join(PUBLIC_DIR, 'llms-content');
const INPUT_LLMS_FILE = join(ROOT_DIR, '.eco/llms.txt');
const OUTPUT_LLMS_FILE = join(PUBLIC_DIR, 'llms.txt');

/**
 * Ensures that a directory exists, creating it if necessary.
 * @param path - The absolute path to the directory.
 */
async function ensureDir(path: string) {
	if (!(await exists(path))) {
		await mkdir(path, { recursive: true });
	}
}

/**
 * Finds the corresponding source file for a given navigation path.
 *
 * @param navPath - The path from the navigation link (e.g., /docs/core/concepts).
 * @returns The absolute path to the source file (.mdx or .md), or null if not found.
 */
async function findFile(navPath: string): Promise<string | null> {
	/* Remove /docs prefix if present, as SRC_DOCS_DIR is already pointed to src/pages/docs */
	const relativePath = navPath.replace(/^\/docs\//, '');

	const extensions = ['.mdx', '.md'];

	for (const ext of extensions) {
		const fullPath = join(SRC_DOCS_DIR, `${relativePath}${ext}`);
		if (await exists(fullPath)) {
			return fullPath;
		}
	}

	return null;
}

/**
 * Main function to generate LLM-friendly documentation.
 *
 * 1. Reads `apps/docs/.eco/llms.txt`.
 * 2. Parses links to find source content.
 * 3. Copies content to text files in `apps/docs/src/public/llms-content`.
 * 4. Generates a new `llms.txt` with updated links.
 */
async function main() {
	console.log('Generatig LLM-friendly documentation...');

	if (!(await exists(INPUT_LLMS_FILE))) {
		console.error(`Input file not found: ${INPUT_LLMS_FILE}`);
		process.exit(1);
	}

	await ensureDir(OUTPUT_CONTENT_DIR);

	const content = await Bun.file(INPUT_LLMS_FILE).text();
	const lines = content.split('\n');
	const outputLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (!trimmed.startsWith('- [')) {
			outputLines.push(line);
			continue;
		}

		const match = trimmed.match(/^- \[(.*?)\]\((.*?)\)$/);
		if (!match) {
			outputLines.push(line);
			continue;
		}

		const [_, title, url] = match;
		try {
			const urlObj = new URL(url);
			const pathName = urlObj.pathname;

			const sourceFile = await findFile(pathName);

			if (sourceFile) {
				const relativePath = pathName.replace(/^\/docs\//, '');
				const destFile = join(OUTPUT_CONTENT_DIR, `${relativePath}.txt`);
				const destDir = dirname(destFile);

				await ensureDir(destDir);

				const fileContent = await Bun.file(sourceFile).text();
				await Bun.write(destFile, fileContent);

				const newUrl = `https://ecopages.app/llms-content/${relativePath}.txt`;
				outputLines.push(`- [${title}](${newUrl})`);
				console.log(`✓ Processed: ${title}`);
			} else {
				console.warn(`! Source file not found for: ${pathName} (${title})`);
				outputLines.push(line);
			}
		} catch (e) {
			console.warn(`! Error processing line: ${line}`, e);
			outputLines.push(line);
		}
	}

	await Bun.write(OUTPUT_LLMS_FILE, outputLines.join('\n'));
	console.log(`\nSuccessfully generated llms.txt at ${OUTPUT_LLMS_FILE}`);
}

main().catch(console.error);
