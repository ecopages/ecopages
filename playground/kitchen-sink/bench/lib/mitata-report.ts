/**
 * Mitata report helpers for the kitchen-sink bundle benchmark suite.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { stats } from 'mitata';

export const BENCH_RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));
export const MITATA_BENCH_JSON = path.join(BENCH_RESULTS_DIR, 'mitata-bench.json');

export type BenchStats = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p75: number;
	p99: number;
	hz: number;
};

export type MitataBenchReport = {
	generatedAt: string;
	runtime: string;
	platform: string;
	scenarios: Record<string, BenchStats>;
};

type MitataRun = {
	name: string;
	stats?: stats;
	error?: unknown;
};

type MitataTrial = {
	runs: MitataRun[];
};

export function shouldRunBench(): boolean {
	return process.env.ECOPAGES_BENCH === '1';
}

export function nsToMs(value: number): number {
	return Math.round((value / 1_000_000) * 1000) / 1000;
}

export function statsToBenchStats(runStats: stats): BenchStats {
	return {
		count: runStats.samples.length,
		min: nsToMs(runStats.min),
		max: nsToMs(runStats.max),
		mean: nsToMs(runStats.avg),
		median: nsToMs(runStats.p50),
		p75: nsToMs(runStats.p75),
		p99: nsToMs(runStats.p99),
		hz: runStats.avg > 0 ? Math.round(1_000_000_000 / runStats.avg) : 0,
	};
}

export function scenariosFromMitataTrials(benchmarks: MitataTrial[]): Record<string, BenchStats> {
	const scenarios: Record<string, BenchStats> = {};

	for (const trial of benchmarks) {
		for (const run of trial.runs) {
			if (!run.stats || run.error) {
				continue;
			}

			scenarios[run.name] = statsToBenchStats(run.stats);
		}
	}

	return scenarios;
}

function getRuntimeLabel(): string {
	const bun = (globalThis as { Bun?: { version: string } }).Bun;
	return bun ? `bun ${bun.version}` : `node ${process.version}`;
}

export function writeMitataBenchReport(benchmarks: MitataTrial[]): MitataBenchReport {
	const report: MitataBenchReport = {
		generatedAt: new Date().toISOString(),
		runtime: getRuntimeLabel(),
		platform: process.platform,
		scenarios: scenariosFromMitataTrials(benchmarks),
	};

	mkdirSync(BENCH_RESULTS_DIR, { recursive: true });
	writeFileSync(MITATA_BENCH_JSON, JSON.stringify(report, null, 2), 'utf-8');
	return report;
}

/** Prints a compact median/p99 table after mitata's own console report. */
export function printMitataBenchReport(report: MitataBenchReport): void {
	const rows = Object.entries(report.scenarios).sort(([left], [right]) => left.localeCompare(right));
	if (rows.length === 0) {
		console.warn('No benchmark scenarios recorded.');
		return;
	}

	console.log(`\nKitchen-sink summary (${report.runtime}, ${report.platform})`);
	console.log('─'.repeat(80));
	console.log(`${'Scenario'.padEnd(52)} ${'median'.padStart(8)} ${'p99'.padStart(8)} ${'ops/s'.padStart(8)}`);
	for (const [name, stats] of rows) {
		console.log(
			`${name.padEnd(52)} ${`${stats.median}ms`.padStart(8)} ${`${stats.p99}ms`.padStart(8)} ${String(stats.hz).padStart(8)}`,
		);
	}
	console.log('─'.repeat(80));
}

export function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) {
		return 0;
	}

	const idx = (sorted.length - 1) * q;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) {
		return sorted[lo]!;
	}

	return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function summarize(durations: number[]): Omit<BenchStats, 'p75' | 'p99' | 'hz'> & { p95: number } {
	if (durations.length === 0) {
		return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0 };
	}

	const sorted = [...durations].sort((left, right) => left - right);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		count: sorted.length,
		min: sorted[0]!,
		max: sorted[sorted.length - 1]!,
		mean: sum / sorted.length,
		median: quantile(sorted, 0.5),
		p95: quantile(sorted, 0.95),
	};
}
