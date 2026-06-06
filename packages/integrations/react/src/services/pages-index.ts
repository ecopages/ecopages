/**
 * Per-app index of React-owned page entrypoints.
 *
 * @remarks
 * The HMR strategy previously called `fileSystem.glob` on every
 * layout change. For apps with many pages this is wasteful: O(pages)
 * on every HMR event, and the result rarely changes between HMR
 * rebuilds.
 *
 * `PagesIndex` maintains a `Set` of owned page entrypoint paths. The
 * initial population is a single glob; subsequent mutations go through
 * `add` / `remove` (called by the HMR strategy when it observes a
 * file create/delete under `pagesDir`). The strategy reads via
 * `list()` for an O(1) snapshot of the current set.
 *
 * Phase 1 ships the class and the `list()` consumer. Watcher-driven
 * `add` / `remove` integration lands in a follow-up — for now the
 * strategy calls `refresh()` lazily, which is equivalent to the old
 * glob behavior but with a stable API for the future incremental
 * path.
 */

import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

const DEFAULT_EXTENSIONS = ['.tsx', '.kita.tsx', '.lit.tsx', '.eco.tsx', '.mdx', '.react.tsx'];

export type PagesIndexOptions = {
	pagesDir: string;
	extensions?: string[];
	/**
	 * Optional predicate to filter out non-page entrypoints (e.g.
	 * test fixtures, generated files). Defaults to including every
	 * file matching an extension.
	 */
	isPageEntrypoint?: (absolutePath: string) => boolean;
};

export class PagesIndex {
	private readonly pagesDir: string;
	private readonly extensions: string[];
	private readonly isPageEntrypoint: (absolutePath: string) => boolean;
	private readonly pages = new Set<string>();
	private lastRefreshAt: number = 0;

	constructor(options: PagesIndexOptions) {
		this.pagesDir = options.pagesDir;
		this.extensions = options.extensions ?? DEFAULT_EXTENSIONS;
		this.isPageEntrypoint = options.isPageEntrypoint ?? (() => true);
	}

	/**
	 * Rescan the pages directory and rebuild the index.
	 *
	 * Cheap to call multiple times in sequence (just a glob). The
	 * real value of `PagesIndex` is the `add` / `remove` path that
	 * callers can wire to the file watcher; for now this is the
	 * fallback used on layout changes.
	 */
	async refresh(): Promise<void> {
		const files = await fileSystem.glob(this.extensions.map((ext) => `**/*${ext}`), {
			cwd: this.pagesDir,
		});

		const next = new Set<string>();
		for (const file of files) {
			const absolutePath = path.join(this.pagesDir, file);
			if (!this.isPageEntrypoint(absolutePath)) continue;
			if (file.includes('.ecopages-node.')) continue;
			next.add(absolutePath);
		}

		this.pages.clear();
		for (const p of next) this.pages.add(p);
		this.lastRefreshAt = Date.now();
	}

	/**
	 * Add a single entrypoint. Idempotent.
	 */
	add(absolutePath: string): void {
		if (!this.isPageEntrypoint(absolutePath)) return;
		this.pages.add(absolutePath);
	}

	/**
	 * Remove a single entrypoint. Idempotent.
	 */
	remove(absolutePath: string): void {
		this.pages.delete(absolutePath);
	}

	/** True if the index contains `absolutePath`. */
	has(absolutePath: string): boolean {
		return this.pages.has(absolutePath);
	}

	/** Snapshot of the current set, sorted by absolute path. */
	list(): string[] {
		return Array.from(this.pages).sort();
	}

	/** Number of indexed entrypoints. */
	get size(): number {
		return this.pages.size;
	}

	/** Last refresh timestamp (ms since epoch). */
	get refreshedAt(): number {
		return this.lastRefreshAt;
	}
}
