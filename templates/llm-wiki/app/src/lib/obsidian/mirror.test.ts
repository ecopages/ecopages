import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@clack/prompts', () => ({
	cancel: vi.fn(),
	confirm: vi.fn(),
	intro: vi.fn(),
	isCancel: () => false,
	log: { error: vi.fn() },
	note: vi.fn(),
	outro: vi.fn(),
}));

import { confirm, note } from '@clack/prompts';
import { mirrorKnowledgeLayers, obsidianCopyMessage, promptObsidianCopy } from './mirror.ts';

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
	await mkdir(path.join(destDir, 'wiki'), { recursive: true });
	await mkdir(path.dirname(kept), { recursive: true });
	await writeFile(path.join(repoRoot, 'wiki/page.md'), 'page', 'utf8');
	await writeFile(path.join(destDir, 'wiki/page.md'), 'previous page', 'utf8');
	await writeFile(path.join(repoRoot, 'README.md'), 'readme', 'utf8');
	await writeFile(path.join(destDir, 'README.md'), 'previous readme', 'utf8');
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

test('the copy prompt names the destination and the paths it will write', () => {
	const message = obsidianCopyMessage('/vault/llm-wiki');
	expect(message).toContain('Destination: /vault/llm-wiki');
	expect(message).toContain('wiki/');
	expect(message).toContain('sources/');
	expect(message).toContain('left in place');
});

test('the copy prompt waits for yes before copying', async () => {
	vi.mocked(confirm).mockResolvedValueOnce(false);
	const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
	Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe(false);
		expect(note).toHaveBeenCalledWith(expect.stringContaining('/vault/llm-wiki'), 'Confirm the directory');
	} finally {
		if (tty) {
			Object.defineProperty(process.stdout, 'isTTY', tty);
		}
	}
});

test('--yes copies without asking', async () => {
	process.argv.push('--yes');
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe(true);
	} finally {
		process.argv.pop();
	}
});
