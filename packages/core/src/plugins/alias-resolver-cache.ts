/**
 * Per-plugin cache for tsconfig path alias resolution.
 *
 * @remarks
 * The `ecopages-alias-resolver` plugin resolves project path aliases to
 * concrete file paths using the app's tsconfig `paths`. Each resolution goes
 * through oxc-resolver and may read barrel re-export targets.
 *
 * This cache memoizes the result keyed by `(projectRoot, specifier)`. It is
 * process-local and not currently invalidated by the file watcher —
 * project contents are assumed to be stable for the lifetime of the process.
 */

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
			// Refresh LRU position.
			this.entries.delete(key);
			this.entries.set(key, existing);
			return { hit: true, resolved: existing.resolved };
		}
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
}

function makeKey(srcDir: string, specifier: string): string {
	return `${srcDir} ${specifier}`;
}
