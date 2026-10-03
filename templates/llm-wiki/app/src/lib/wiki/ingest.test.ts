import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { copySources, ingestVault } from './ingest.ts';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));
	roots.push(root);
	return root;
}

const demoPage = `---
title: Demo
summary: example page
updated: 2026-09-13
---

# Demo
`;

test('ingest overwrites pages and leaves directories it did not write', async () => {
	const root = await tempRoot();
	const appRoot = path.join(root, 'app');
	const sourceDir = path.join(root, 'wiki');
	const staleContent = path.join(appRoot, 'src/content/wiki/old/gone.mdx');
	const stalePublic = path.join(appRoot, 'src/public/wiki/old/gone.md');
	await mkdir(path.dirname(staleContent), { recursive: true });
	await mkdir(path.dirname(stalePublic), { recursive: true });
	await mkdir(path.join(sourceDir, 'app'), { recursive: true });
	await mkdir(path.join(appRoot, 'src/content/wiki/app'), { recursive: true });
	await writeFile(staleContent, 'stale content', 'utf8');
	await writeFile(stalePublic, 'stale public', 'utf8');
	await writeFile(path.join(appRoot, 'src/content/wiki/app/demo.mdx'), 'previous page', 'utf8');
	await writeFile(path.join(sourceDir, 'app/demo.md'), demoPage, 'utf8');

	await ingestVault({ appRoot, sourceDir });

	expect(await readFile(staleContent, 'utf8')).toBe('stale content');
	expect(await readFile(stalePublic, 'utf8')).toBe('stale public');
	const replaced = await readFile(path.join(appRoot, 'src/content/wiki/app/demo.mdx'), 'utf8');
	expect(replaced).toContain('title: "Demo"');
	expect(replaced).not.toContain('previous page');
});

test('copySources leaves files that are no longer in the source directory', async () => {
	const root = await tempRoot();
	const sourcesDir = path.join(root, 'sources');
	const outputDir = path.join(root, 'public-sources');
	await mkdir(sourcesDir, { recursive: true });
	await mkdir(outputDir, { recursive: true });
	await writeFile(path.join(sourcesDir, 'kept.md'), 'kept', 'utf8');
	await writeFile(path.join(outputDir, 'kept.md'), 'previous copy', 'utf8');
	await writeFile(path.join(outputDir, 'removed.md'), 'still here', 'utf8');

	await copySources({ sourcesDir, outputDir });

	expect(await readFile(path.join(outputDir, 'removed.md'), 'utf8')).toBe('still here');
	expect(await readFile(path.join(outputDir, 'kept.md'), 'utf8')).toBe('kept');
});

test('ingest refuses a dot directory instead of using it', async () => {
	const root = await tempRoot();
	await expect(ingestVault({ appRoot: root, sourceDir: path.join(root, 'wiki'), outputDir: '.' })).rejects.toThrow(
		/Refusing directory target/,
	);
});
