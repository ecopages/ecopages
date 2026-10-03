import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { mirrorKnowledgeLayers } from './mirror.ts';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('mirror copies knowledge files and leaves existing files in place', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-mirror-'));
	roots.push(root);
	const repoRoot = path.join(root, 'repo');
	const destDir = path.join(root, 'vault', 'llm-wiki');
	const kept = path.join(destDir, 'notes', 'local.md');
	await mkdir(path.join(repoRoot, 'wiki'), { recursive: true });
	await mkdir(path.dirname(kept), { recursive: true });
	await writeFile(path.join(repoRoot, 'wiki/page.md'), 'page', 'utf8');
	await writeFile(path.join(repoRoot, 'README.md'), 'readme', 'utf8');
	await writeFile(kept, 'local note', 'utf8');

	await mirrorKnowledgeLayers(repoRoot, destDir);

	expect(await readFile(kept, 'utf8')).toBe('local note');
	expect(await readFile(path.join(destDir, 'wiki/page.md'), 'utf8')).toBe('page');
	expect(await readFile(path.join(destDir, 'README.md'), 'utf8')).toBe('readme');
	expect(await readFile(path.join(destDir, 'OBSIDIAN_MIRROR.md'), 'utf8')).toContain('left in place');
});

test('mirror refuses a dot destination', async () => {
	await expect(mirrorKnowledgeLayers(process.cwd(), '.')).rejects.toThrow(/Refusing directory target/);
});
