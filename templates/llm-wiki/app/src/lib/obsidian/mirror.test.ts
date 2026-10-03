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
import { mirrorKnowledgeLayers, obsidianCopyMessage, promptObsidianCopy, requireObsidianVaultPath } from './mirror.ts';

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

test('the copy prompt waits for yes, then asks about a full replace', async () => {
	vi.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
	const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
	Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe('replace-files');
		expect(note).toHaveBeenCalledWith(expect.stringContaining('/vault/llm-wiki'), 'Confirm the directory');
		expect(confirm).toHaveBeenCalledTimes(2);
	} finally {
		if (tty) {
			Object.defineProperty(process.stdout, 'isTTY', tty);
		}
	}
});

test('a yes on the second prompt selects a full replace', async () => {
	vi.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
	const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
	Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe('full');
	} finally {
		if (tty) {
			Object.defineProperty(process.stdout, 'isTTY', tty);
		}
	}
});

test('--yes copies without asking and does not clear the directory', async () => {
	process.argv.push('--yes');
	const callsBefore = vi.mocked(confirm).mock.calls.length;
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe('replace-files');
		expect(vi.mocked(confirm).mock.calls.length).toBe(callsBefore);
	} finally {
		process.argv.pop();
	}
});

test('--yes --clear copies and clears the directory without asking', async () => {
	process.argv.push('--yes', '--clear');
	try {
		await expect(promptObsidianCopy('/vault/llm-wiki')).resolves.toBe('full');
	} finally {
		process.argv.pop();
		process.argv.pop();
	}
});

test('requireObsidianVaultPath throws when the variable is unset', () => {
	expect(() => requireObsidianVaultPath({})).toThrow(/OBSIDIAN_VAULT_PATH is unset/);
});

test('full replace removes files that are not part of the copy', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-mirror-full-'));
	roots.push(root);
	const repoRoot = path.join(root, 'repo');
	const destDir = path.join(root, 'vault', 'llm-wiki');
	const kept = path.join(destDir, 'notes', 'local.md');
	await mkdir(path.join(repoRoot, 'wiki'), { recursive: true });
	await mkdir(path.dirname(kept), { recursive: true });
	await writeFile(path.join(repoRoot, 'wiki/page.md'), 'page', 'utf8');
	await writeFile(kept, 'local note', 'utf8');

	await mirrorKnowledgeLayers(repoRoot, destDir, { replaceDirectory: true });

	await expect(readFile(kept, 'utf8')).rejects.toThrow();
	expect(await readFile(path.join(destDir, 'wiki/page.md'), 'utf8')).toBe('page');
});
