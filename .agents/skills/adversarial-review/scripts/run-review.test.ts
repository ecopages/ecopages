import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';

const SCRIPT = path.join(import.meta.dirname, 'run-review.mts');

let root: string;
let repo: string;
let bin: string;
let log: string;
let notes: string;

/**
 * Runs the CLI in a scratch repository with a fake `cursor-agent` first on `PATH` that logs its arguments.
 * The developer's own `ADVERSARIAL_REVIEW_*` variables are dropped so only the scratch `.env` counts.
 */
function run(...args: string[]) {
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ADVERSARIAL_REVIEW_')));
	return spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT, '--base', 'main', '--notes', notes, ...args], {
		cwd: repo,
		encoding: 'utf8',
		env: { ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
	});
}

beforeAll(() => {
	root = mkdtempSync(path.join(os.tmpdir(), 'run-review-'));
	repo = path.join(root, 'repo');
	bin = path.join(root, 'bin');
	log = path.join(root, 'argv.json');
	notes = path.join(root, 'notes.md');
	writeFileSync(notes, 'Own review: fixed a missing null check; left the rename as a nit.\n');
	mkdirSync(repo);
	mkdirSync(bin);
	writeFileSync(
		path.join(bin, 'cursor-agent'),
		`#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), key: process.env.CURSOR_API_KEY }));\n`,
	);
	chmodSync(path.join(bin, 'cursor-agent'), 0o755);

	const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo });
	git('init', '-q', '-b', 'main');
	writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
	git('add', '.');
	git('commit', '-q', '-m', 'base');
	git('switch', '-q', '-c', 'feature');
	writeFileSync(path.join(repo, 'a.ts'), 'export const a = 2;\n');
	git('commit', '-q', '-am', 'committed change');
	writeFileSync(path.join(repo, 'a.ts'), 'export const a = 3;\n');
	writeFileSync(path.join(repo, 'b.ts'), 'export const b = 1;\n');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

test('refuses a third round without calling a harness', () => {
	const result = run('--round', '3');

	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('at most two rounds');
	expect(existsSync(log)).toBe(false);
});

test('exits 2 without calling a harness when none is configured', () => {
	const result = run();

	expect(result.status).toBe(2);
	expect(result.stderr).toContain('No review harness is configured');
	expect(run('--model', 'sonnet').stderr).toContain('--model needs --harness');
	expect(existsSync(log)).toBe(false);
});

test('fails, rather than skipping, when the harness is set but not supported', () => {
	writeFileSync(path.join(repo, '.env'), 'ADVERSARIAL_REVIEW_HARNESS=Claude\nADVERSARIAL_REVIEW_MODEL=opus\n');
	const result = run();
	rmSync(path.join(repo, '.env'));

	expect(result.status).toBe(1);
	expect(result.stderr).toContain('"Claude" is not supported');
	expect(existsSync(log)).toBe(false);
});

test('refuses a fast model variant without calling a harness', () => {
	writeFileSync(path.join(repo, '.env'), 'ADVERSARIAL_REVIEW_HARNESS=cursor\nADVERSARIAL_REVIEW_MODEL=grok-4.7-high-fast\n');
	const result = run();
	rmSync(path.join(repo, '.env'));

	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('a fast variant');
	expect(existsSync(log)).toBe(false);
});

test('sends the brief, the round, the notes, every change since the merge base and the untracked files to the harness from .env, with the API key under the variable the harness reads', () => {
	writeFileSync(path.join(repo, '.env'), 'ADVERSARIAL_REVIEW_HARNESS=cursor\nADVERSARIAL_REVIEW_MODEL=grok-4\nADVERSARIAL_REVIEW_API_KEY=review-key\n');
	const result = run();
	rmSync(path.join(repo, '.env'));

	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
	const { argv, key }: { argv: string[]; key?: string } = JSON.parse(readFileSync(log, 'utf8'));
	expect(key).toBe('review-key');
	expect(argv).toEqual(expect.arrayContaining(['-p', '--trust', '--mode', 'ask', '--model', 'grok-4']));
	const prompt = argv[argv.length - 1];
	expect(prompt).toContain('# Review from a second model');
	expect(prompt).toContain('Round 1 of 2.');
	expect(prompt).toContain('fixed a missing null check');
	expect(prompt).toContain('-export const a = 1;\n+export const a = 3;');
	expect(prompt).toContain('- b.ts');
});

test('reviews on the harness and model passed as flags when none is configured, without the configured API key', () => {
	writeFileSync(path.join(repo, '.env'), 'ADVERSARIAL_REVIEW_API_KEY=env-key\n');
	const result = run('--harness', 'cursor', '--model', 'gpt-5.6-sol-high');
	rmSync(path.join(repo, '.env'));

	expect(result.status).toBe(0);
	const { argv, key }: { argv: string[]; key?: string } = JSON.parse(readFileSync(log, 'utf8'));
	expect(argv).toEqual(expect.arrayContaining(['--model', 'gpt-5.6-sol-high']));
	expect(key).not.toBe('env-key');
});
