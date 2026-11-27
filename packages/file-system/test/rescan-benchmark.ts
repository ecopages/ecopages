/**
 * Cost of one safety rescan of a real app tree.
 * Run with: pnpm --filter @ecopages/file-system run benchmark:rescan [folder]
 *
 * @remarks
 * Watches the kitchen-sink playground (or the folder given) the way the dev server does, skipping installed
 * packages and build output, and times `RecursiveFileWatcher.rescanNow()` on a quiet tree with mitata. It prints
 * the number of entries a rescan checks and of `ignored` calls it makes, and the wait the watcher would take before
 * the next rescan, so the factor and the cap in `safety-rescan.ts` can be tuned from numbers.
 */

import { bench, run } from 'mitata';
import { readdirSync } from 'node:fs';
import { path } from '../src/path.ts';
import { RecursiveFileWatcher } from '../src/adapters/recursive-file-watcher.ts';
import { nextRescanWaitMs, SAFETY_RESCAN_DEFAULT_MS } from '../src/adapters/safety-rescan.ts';

const IGNORED_FOLDERS = new Set(['node_modules', '.git', '.eco', 'dist', '.data', 'results']);

const here = path.dirname(path.fromFileUrl(import.meta.url));
const tree = path.resolve(process.argv[2] ?? path.join(here, '../../../playground/kitchen-sink'));

let ignoredCalls = 0;
const isIgnored = (entryPath: string): boolean => {
	ignoredCalls++;
	return entryPath.split('/').some((segment) => IGNORED_FOLDERS.has(segment));
};

function countEntries(directory: string): number {
	let total = 0;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (IGNORED_FOLDERS.has(entry.name)) continue;
		total += 1;
		if (entry.isDirectory()) total += countEntries(path.join(directory, entry.name));
	}
	return total;
}

const entries = countEntries(tree);

const watcher = new RecursiveFileWatcher(
	[tree],
	{
		onChange: () => {},
		onError: (error) => {
			throw error;
		},
		ignored: isIgnored,
	},
	{ rescans: false },
);
await watcher.ready;

ignoredCalls = 0;
const startedAt = performance.now();
await watcher.rescanNow();
const firstDuration = performance.now() - startedAt;
const callsPerRescan = ignoredCalls;

console.log(`\nsafety rescan of ${tree}`);
console.log(`entries checked: ${entries}, ignored calls per rescan: ${callsPerRescan}`);
console.log(
	`one rescan: ${firstDuration.toFixed(1)} ms, next wait at a ${SAFETY_RESCAN_DEFAULT_MS} ms interval: ${nextRescanWaitMs(firstDuration, SAFETY_RESCAN_DEFAULT_MS).toFixed(0)} ms`,
);

bench('rescanNow on a quiet tree', async () => {
	await watcher.rescanNow();
});

await run();
await watcher.close();
