/**
 * Per-plugin cache for `@/...` alias resolution.
 *
 * @remarks
 * The `ecopages-alias-resolver` plugin resolves project aliases like
 * `@/components/Button` to concrete file paths under the app's `srcDir`.
 * Each resolution can trigger up to 22 `existsSync` calls and (when
 * the resolved path is a barrel) a `readFileSync` to detect
 * `export * from './...'` forwarding.
 *
 * This cache memoizes the result keyed by `(srcDir, specifier)`. It is
 * process-local and not currently invalidated by the file watcher —
 * `srcDir` contents are assumed to be stable for the lifetime of the
 * process. The watcher's `uncacheModules` path (Phase 0+1.6) will
 * integrate this once pagesIndex work lands.
 *
 * Survives into Phase 3 (Rolldown): Rolldown's `oxc-resolver` replaces
 * this plugin's manual resolution, so the cache becomes a no-op.
 */

import path from 'node:path';

const DEFAULT_MAX_ENTRIES = 2_000;

type CacheKey = string;

type CacheEntry = {
	srcDir: string;
	/** Resolved absolute path, or `undefined` if the specifier did not resolve. */
	resolved: string | undefined;
};

export class AliasResolverCache {
	private readonly entries = new Map<CacheKey, CacheEntry>();
	private readonly maxEntries: number;
	private hits = 0;
	private misses = 0;

	constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
		if (maxEntries <= 0) {
			throw new Error(`AliasResolverCache: maxEntries must be > 0, got ${maxEntries}`);
		}
		this.maxEntries = maxEntries;
	}

	/**
	 * Look up a previously-computed resolution for `(srcDir, specifier)`.
	 *
	 * Returns `{ hit: true, resolved }` on cache hit (resolved may be
	 * `undefined` for an unresolvable specifier), or `{ hit: false }` on
	 * miss. The caller is responsible for re-running the resolver and
	 * calling `set` to store the new entry.
	 */
	get(srcDir: string, specifier: string): { hit: true; resolved: string | undefined } | { hit: false } {
		const key = makeKey(srcDir, specifier);
		const existing = this.entries.get(key);
		if (existing) {
			this.hits += 1;
			// Refresh LRU position.
			this.entries.delete(key);
			this.entries.set(key, existing);
			return { hit: true, resolved: existing.resolved };
		}
		this.misses += 1;
		return { hit: false };
	}

	/**
	 * Store a resolution result.
	 *
	 * Pass `undefined` for `resolved` to memoize the negative case
	 * (specifier did not resolve) and avoid repeating the FS walk on
	 * every `@/...` import.
	 */
	set(srcDir: string, specifier: string, resolved: string | undefined): void {
		const key = makeKey(srcDir, specifier);
		this.entries.set(key, { srcDir, resolved });

		if (this.entries.size > this.maxEntries) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.entries.delete(oldestKey);
			}
		}
	}

	/**
	 * Drop all entries whose `srcDir` is under `rootDir`. Use this from
	 * the file watcher when files are added or removed under the app's
	 * source tree.
	 *
	 * Path comparison is path-aware (handles both POSIX `/` and
	 * Windows `\` separators) via `path.relative` so cached entries
	 * normalized on one platform still match the watcher's `rootDir`
	 * on another. Without this, a Windows build that sees
	 * `entry.srcDir === 'C:\app\src'` would miss
	 * `entry.srcDir.startsWith('C:/app/src/')` and leave stale entries.
	 */
	invalidateUnder(rootDir: string): number {
		const normalizedRoot = path.resolve(rootDir);
		let removed = 0;
		for (const [key, entry] of this.entries) {
			if (isUnderDirectory(path.resolve(entry.srcDir), normalizedRoot)) {
				this.entries.delete(key);
				removed += 1;
			}
		}
		return removed;
	}

	/** Clear all entries. */
	clear(): void {
		this.entries.clear();
		this.hits = 0;
		this.misses = 0;
	}

	/** Current cache size. */
	get size(): number {
		return this.entries.size;
	}

	/** Hit/miss counters for observability. */
	stats(): { hits: number; misses: number; size: number; hitRate: number } {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			size: this.entries.size,
			hitRate: total === 0 ? 0 : this.hits / total,
		};
	}
}

function makeKey(srcDir: string, specifier: string): string {
	return `${srcDir} ${specifier}`;
}

/**
 * Returns true if `candidate` is the same as `parent` or a descendant
 * of it. Uses `path.relative` so the comparison is path-aware and
 * works across POSIX and Windows separators.
 */
function isUnderDirectory(candidate: string, parent: string): boolean {
	if (candidate === parent) return true;
	const rel = path.relative(parent, candidate);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
	return true;
}
