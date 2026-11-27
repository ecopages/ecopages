/**
 * The policy of the watcher's safety rescan: how long to wait between rescans, and which changes a rescan has
 * already reported.
 * @module
 */

/** The wait between safety rescans of a quiet, small tree, in milliseconds. */
export const SAFETY_RESCAN_DEFAULT_MS = 2_000;

/** The wait after a rescan, in rescan durations, so that a rescan uses about a tenth of the time. */
const WAIT_PER_DURATION = 10;

/** The cap on that wait, in intervals, so that a slow rescan delays the next report by a bounded time. */
const MAX_WAIT_INTERVALS = 5;

/** How long a rescan's report of a file can swallow a late native change for it, in intervals. */
const REPORT_TTL_INTERVALS = 10;

/**
 * How long to wait before the next rescan, given how long the last one took.
 *
 * @remarks
 * The wait is ten times the duration, so a rescan costs about a tenth of the time, but never less than one
 * interval and never more than five. The floor keeps a tiny tree from rescanning in a tight loop. The cap bounds
 * the time to report a dropped change even on a slow volume or a huge tree, where the duty cycle then rises above a
 * tenth.
 */
export function nextRescanWaitMs(durationMs: number, intervalMs: number): number {
	return Math.min(Math.max(intervalMs, durationMs * WAIT_PER_DURATION), intervalMs * MAX_WAIT_INTERVALS);
}

/** What identifies one version of a file: the fields of `Stats` that change when its content or identity does. */
export interface EntryVersion {
	size: number;
	mtimeMs: number;
	ctimeMs: number;
	ino: number;
}

export function hasSameEntryVersion(previous: EntryVersion, next: EntryVersion): boolean {
	return (
		previous.size === next.size &&
		previous.mtimeMs === next.mtimeMs &&
		previous.ctimeMs === next.ctimeMs &&
		previous.ino === next.ino
	);
}

/**
 * The files a safety rescan reported, so that a native `change` that was only late is not reported again.
 *
 * @remarks
 * A native event that is slow, not dropped, arrives after the rescan has reported its change. A report is consumed
 * by the first native change for the same {@link EntryVersion}, so the change is reported once; a newer edit has
 * another version and is reported. A report nobody consumed is forgotten when the file is removed, and dropped by
 * {@link RescanReports.prune} once ten intervals old, so the ledger does not grow with the files a long session
 * touches.
 */
export class RescanReports {
	private readonly reports = new Map<string, { version: EntryVersion; reportedAt: number }>();

	private readonly intervalMs: number;
	private readonly now: () => number;

	public constructor(intervalMs: number, now: () => number = () => performance.now()) {
		this.intervalMs = intervalMs;
		this.now = now;
	}

	public get size(): number {
		return this.reports.size;
	}

	public remember(entryPath: string, version: EntryVersion): void {
		this.reports.set(entryPath, { version, reportedAt: this.now() });
	}

	/**
	 * True when a native change for `version` repeats a report that is still recent. The report is consumed either way.
	 */
	public consumeIfRepeat(entryPath: string, version: EntryVersion): boolean {
		const report = this.reports.get(entryPath);
		if (!report) return false;
		this.reports.delete(entryPath);
		return this.isRecent(report.reportedAt) && hasSameEntryVersion(report.version, version);
	}

	public forget(entryPath: string): void {
		this.reports.delete(entryPath);
	}

	public prune(): void {
		for (const [entryPath, report] of this.reports)
			if (!this.isRecent(report.reportedAt)) this.reports.delete(entryPath);
	}

	public clear(): void {
		this.reports.clear();
	}

	private isRecent(reportedAt: number): boolean {
		return this.now() - reportedAt < this.intervalMs * REPORT_TTL_INTERVALS;
	}
}
