import { describe, expect, it } from 'vitest';
import { nextRescanWaitMs, RescanReports, type EntryVersion } from './safety-rescan.ts';

describe('nextRescanWaitMs', () => {
	it.each([
		{ duration: 0, wait: 2_000 },
		{ duration: 50, wait: 2_000 },
		{ duration: 300, wait: 3_000 },
		{ duration: 700, wait: 7_000 },
		{ duration: 1_000, wait: 10_000 },
		{ duration: 60_000, wait: 10_000 },
	])('waits $wait ms after a rescan of $duration ms with a 2 s interval', ({ duration, wait }) => {
		expect(nextRescanWaitMs(duration, 2_000)).toBe(wait);
	});

	it('scales the floor and the cap with the interval', () => {
		expect(nextRescanWaitMs(0, 100)).toBe(100);
		expect(nextRescanWaitMs(1_000, 100)).toBe(500);
	});
});

describe('RescanReports', () => {
	const version: EntryVersion = { size: 10, mtimeMs: 1_000, ctimeMs: 1_000, ino: 7 };

	function createReports() {
		let now = 0;
		const reports = new RescanReports(100, () => now);
		return { reports, advance: (ms: number) => (now += ms) };
	}

	it('recognizes a native change for the version it reported, once', () => {
		const { reports } = createReports();
		reports.remember('/a.ts', version);

		expect(reports.consumeIfRepeat('/a.ts', { ...version })).toBe(true);
		expect(reports.consumeIfRepeat('/a.ts', { ...version })).toBe(false);
	});

	it.each([
		['size', { size: 11 }],
		['modification time', { mtimeMs: 1_001 }],
		['change time', { ctimeMs: 1_001 }],
		['inode', { ino: 8 }],
	])('does not swallow a native change for a newer %s', (_name, changed) => {
		const { reports } = createReports();
		reports.remember('/a.ts', version);

		expect(reports.consumeIfRepeat('/a.ts', { ...version, ...changed })).toBe(false);
	});

	it('does not know a file it never reported', () => {
		const { reports } = createReports();

		expect(reports.consumeIfRepeat('/a.ts', version)).toBe(false);
	});

	it('stops swallowing after ten intervals', () => {
		const { reports, advance } = createReports();
		reports.remember('/a.ts', version);
		advance(1_000);

		expect(reports.consumeIfRepeat('/a.ts', version)).toBe(false);
	});

	it('still swallows just inside ten intervals', () => {
		const { reports, advance } = createReports();
		reports.remember('/a.ts', version);
		advance(999);

		expect(reports.consumeIfRepeat('/a.ts', version)).toBe(true);
	});

	it('forgets a removed file', () => {
		const { reports } = createReports();
		reports.remember('/a.ts', version);

		reports.forget('/a.ts');

		expect(reports.consumeIfRepeat('/a.ts', version)).toBe(false);
	});

	it('prunes the reports no event consumed, and keeps the recent ones', () => {
		const { reports, advance } = createReports();
		reports.remember('/old.ts', version);
		advance(1_001);
		reports.remember('/recent.ts', version);

		reports.prune();

		expect(reports.size).toBe(1);
		expect(reports.consumeIfRepeat('/recent.ts', version)).toBe(true);
	});

	it('clears every report', () => {
		const { reports } = createReports();
		reports.remember('/a.ts', version);

		reports.clear();

		expect(reports.size).toBe(0);
	});
});
