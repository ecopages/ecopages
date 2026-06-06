/**
 * Shared timing and reporting utilities for the bundle benchmark suite.
 *
 * The bench is gated by `ECOPAGES_BENCH=1` so it does not run on every
 * developer CI run. To regenerate baseline numbers, set the env var and run:
 *
 *   pnpm test:vitest packages/core/src/bench/
 *
 * The resulting `baseline.json` is committed and diffed in subsequent PRs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_RESULTS_DIR = fileURLToPath(new URL('./results', import.meta.url));

export type BenchStats = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p95: number;
};

export type BenchSample = {
	name: string;
	durationMs: number;
	heapBefore: NodeJS.MemoryUsage;
	heapAfter: NodeJS.MemoryUsage;
	extras?: Record<string, unknown>;
};

export type BenchResult = {
	gitHead?: string;
	nodeVersion: string;
	platform: string;
	runtime: string;
	timestamp: string;
	scenario: string;
	stats: BenchStats;
	samples: BenchSample[];
};

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const idx = (sorted.length - 1) * q;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo]!;
	return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function summarize(durations: number[]): BenchStats {
	if (durations.length === 0) {
		return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0 };
	}
	const sorted = [...durations].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, n) => acc + n, 0);
	return {
		count: sorted.length,
		min: sorted[0]!,
		max: sorted[sorted.length - 1]!,
		mean: sum / sorted.length,
		median: quantile(sorted, 0.5),
		p95: quantile(sorted, 0.95),
	};
}

export function shouldRunBench(): boolean {
	return process.env.ECOPAGES_BENCH === '1';
}

export function isCi(): boolean {
	return Boolean(process.env.CI);
}

/**
 * Runs `body` `iterations` times, dropping `warmup` initial passes.
 * Returns the bench samples (without the warmup passes).
 */
export async function runIterations(
	iterations: number,
	warmup: number,
	body: (iteration: number) => Promise<Omit<BenchSample, 'heapBefore' | 'heapAfter'>>,
): Promise<BenchSample[]> {
	const samples: BenchSample[] = [];

	const total = warmup + iterations;
	for (let i = 0; i < total; i++) {
		const heapBefore = process.memoryUsage();
		const start = performance.now();
		const partial = await body(i);
		const durationMs = performance.now() - start;
		const heapAfter = process.memoryUsage();
		samples.push({ ...partial, durationMs, heapBefore, heapAfter });
	}

	return samples.slice(warmup);
}

export function writeBenchResult(name: string, result: BenchResult): void {
	if (!shouldRunBench()) return;

	mkdirSync(BENCH_RESULTS_DIR, { recursive: true });
	const file = path.join(BENCH_RESULTS_DIR, `${name}.json`);
	const payload = JSON.stringify(result, null, 2);
	writeFileSync(file, payload, 'utf-8');
}

export function captureRuntimeMeta(): { nodeVersion: string; platform: string; runtime: string } {
	return {
		nodeVersion: process.version,
		platform: process.platform,
		runtime: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`,
	};
}

export function readMemory(): NodeJS.MemoryUsage {
	return process.memoryUsage();
}
