import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, test, vi } from 'vitest';
import { path } from '../path.ts';
import type { FileChange } from '../types.ts';
import { RecursiveFileWatcher } from './recursive-file-watcher.ts';

/**
 * Longest a test waits for the watcher to report a change.
 *
 * @remarks
 * The deadline is longer than the safety rescan interval used here by an order of magnitude, so a wait that fails
 * means the change was never reported.
 */
const EVENT_DEADLINE_MS = 15_000;
const SAFETY_RESCAN_MS = 300;
const CHURN_PROCESSES = 6;
/** Time for the system to deliver what the writers left, so it does not reach the next test file. */
const CHURN_SETTLE_MS = 500;

/**
 * Starts processes that create and remove many files in a directory outside the watched one.
 *
 * @remarks
 * On macOS, `fseventsd` drops native events of every watcher on the volume while such writers run. The measured
 * loss of a raw `fs.watch` was 8 edits in 10 with six writers.
 */
function startChurn(directory: string): { stop: () => Promise<void> } {
	const script = `
		const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
		const { join } = require('node:path');
		const end = Date.now() + 60_000;
		let round = 0;
		(async () => {
			while (Date.now() < end) {
				const dir = join(process.argv[1], 'd' + (round % 40));
				mkdirSync(dir, { recursive: true });
				for (let file = 0; file < 20; file++) writeFileSync(join(dir, 'f' + file + '.txt'), String(round));
				if (round % 10 === 0) rmSync(dir, { recursive: true, force: true });
				round++;
				if (round % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 1));
			}
		})();
	`;
	const children: ChildProcess[] = [];
	for (let index = 0; index < CHURN_PROCESSES; index++) {
		children.push(
			spawn(process.execPath, ['-e', script, path.join(directory, `writer-${index}`)], { stdio: 'ignore' }),
		);
	}
	return {
		stop: async () => {
			await Promise.all(
				children.map(
					(child) =>
						new Promise<void>((resolve) => {
							if (child.exitCode !== null) return resolve();
							child.once('exit', () => resolve());
							child.kill('SIGKILL');
						}),
				),
			);
			await new Promise((resolve) => setTimeout(resolve, CHURN_SETTLE_MS));
		},
	};
}

function createWatchedDirectory(prefix: string, fileCount: number): { directory: string; files: string[] } {
	const directory = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), prefix))));
	const files = Array.from({ length: fileCount }, (_, index) => path.join(directory, `file-${index}.ts`));
	for (const file of files) writeFileSync(file, 'export const value = 1;', 'utf8');
	return { directory, files };
}

function watch(directory: string, changes: FileChange[]): RecursiveFileWatcher {
	return new RecursiveFileWatcher(
		[directory],
		{
			onChange: (change) => changes.push(change),
			onError: (error) => {
				throw error;
			},
		},
		{ safetyRescanMs: SAFETY_RESCAN_MS, rescans: true },
	);
}

test.runIf(process.platform === 'darwin')(
	'RecursiveFileWatcher reports every edit made while other processes write many files',
	async () => {
		const churnRoot = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-watch-churn-'))));
		const { directory, files } = createWatchedDirectory('eco-watch-churn-target-', 8);
		const changes: FileChange[] = [];
		const watcher = watch(directory, changes);
		const churn = startChurn(churnRoot);

		try {
			await watcher.ready;
			await new Promise((resolve) => setTimeout(resolve, 500));
			for (const file of files) writeFileSync(file, 'export const value = 2;', 'utf8');
			await vi.waitFor(
				() => {
					for (const file of files) expect(changes).toContainEqual({ type: 'change', path: file });
				},
				{ timeout: EVENT_DEADLINE_MS, interval: 50 },
			);
		} finally {
			await churn.stop();
			await watcher.close();
			rmSync(churnRoot, { recursive: true, force: true });
			rmSync(directory, { recursive: true, force: true });
		}
	},
	60_000,
);

test.runIf(process.platform === 'darwin')(
	'RecursiveFileWatcher reports an added and a removed file while other processes write many files',
	async () => {
		const churnRoot = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-watch-churn-'))));
		const { directory, files } = createWatchedDirectory('eco-watch-churn-target-', 6);
		const changes: FileChange[] = [];
		const watcher = watch(directory, changes);
		const churn = startChurn(churnRoot);
		const added = path.join(directory, 'nested', 'added.ts');

		try {
			await watcher.ready;
			await new Promise((resolve) => setTimeout(resolve, 500));
			mkdirSync(path.dirname(added));
			writeFileSync(added, 'export {};', 'utf8');
			for (const file of files) rmSync(file);
			await vi.waitFor(
				() => {
					expect(changes).toContainEqual({ type: 'add', path: added });
					for (const file of files) expect(changes).toContainEqual({ type: 'unlink', path: file });
				},
				{ timeout: EVENT_DEADLINE_MS, interval: 50 },
			);
		} finally {
			await churn.stop();
			await watcher.close();
			rmSync(churnRoot, { recursive: true, force: true });
			rmSync(directory, { recursive: true, force: true });
		}
	},
	60_000,
);

test('RecursiveFileWatcher reports a change once on a quiet volume, with rescans running', async () => {
	const { directory, files } = createWatchedDirectory('eco-watch-quiet-', 1);
	const [file] = files as [string];
	const added = path.join(directory, 'added.ts');
	const changes: FileChange[] = [];
	const watcher = watch(directory, changes);

	try {
		await watcher.ready;
		writeFileSync(file, 'export const value = 2;', 'utf8');
		writeFileSync(added, 'export {};', 'utf8');
		await vi.waitFor(
			() => {
				expect(changes).toContainEqual({ type: 'change', path: file });
				expect(changes).toContainEqual({ type: 'add', path: added });
			},
			{ timeout: EVENT_DEADLINE_MS, interval: 25 },
		);
		rmSync(added);
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'unlink', path: added }), {
			timeout: EVENT_DEADLINE_MS,
			interval: 25,
		});
		await new Promise((resolve) => setTimeout(resolve, SAFETY_RESCAN_MS * 6));

		expect(changes.filter(({ type }) => type === 'change')).toEqual([{ type: 'change', path: file }]);
		expect(changes.filter(({ type }) => type === 'add')).toEqual([{ type: 'add', path: added }]);
		expect(changes.filter(({ type }) => type === 'unlink')).toEqual([{ type: 'unlink', path: added }]);
	} finally {
		await watcher.close();
		rmSync(directory, { recursive: true, force: true });
	}
}, 60_000);
