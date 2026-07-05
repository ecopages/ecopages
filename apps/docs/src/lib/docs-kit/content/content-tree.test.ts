import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

async function collectMdxFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMdxFiles(fullPath)));
		} else if (entry.isFile() && entry.name.endsWith('.mdx')) {
			files.push(fullPath);
		}
	}

	return files;
}

describe('content tree', () => {
	test('every content/docs MDX file is ceremony-free', async () => {
		const contentDir = join(import.meta.dirname, '../../../content/docs');
		const files = await collectMdxFiles(contentDir);

		expect(files.length).toBeGreaterThanOrEqual(43);

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			const preamble = source.split('\n').slice(0, 20).join('\n');

			expect(preamble, `${file} should not retain DocsLayout import`).not.toMatch(/import \{ DocsLayout \}/);
			expect(preamble, `${file} should not retain page config`).not.toMatch(/export const config\s*=/);
			expect(preamble, `${file} should not retain getMetadata`).not.toMatch(/export const getMetadata\s*=/);
		}
	});
});
