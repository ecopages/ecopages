/**
 * Process-wide parse cache for `oxc-parser.parseSync`.
 *
 * @remarks
 * Three of the heaviest build plugins (eco-component-meta, client-graph-
 * boundary, browser-runtime-import-rewrite) each call `parseSync` on the
 * same source file with overlapping options. This cache memoizes the
 * parse result keyed by `(absolute path, source, options)`. When the
 * source is unchanged, subsequent calls return the cached result without
 * re-parsing.
 *
 * The cache is LRU-bounded (10 000 entries) and key-stable across a
 * single HMR session. It is **content-hashed** rather than
 * mtime-hashed so that `touch`/`utimes` does not invalidate a
 * still-valid parse.
 *
 * Survives into the Rolldown migration (Phase 3): Rolldown's Rust-side
 * caching absorbs the bulk of the win, but this JS-side cache still
 * helps the post-build pass and any JS-only plugins we keep.
 */

import { parseSync, type ParseResult, type ParserOptions } from 'oxc-parser';
import { rapidhash } from '../utils/hash.ts';

const DEFAULT_MAX_ENTRIES = 10_000;

export type ModuleParseOptions = ParserOptions & {
	/**
	 * Optional parser language override. If omitted, derived from the file
	 * extension at lookup time. Set this explicitly if your caller already
	 * computed the language (avoids re-deriving inside the cache).
	 */
	lang?: ParserOptions['lang'];
};

type CacheKey = string;

type CacheEntry = {
	hash: number | bigint;
	result: ParseResult;
};

/**
 * LRU-bounded module parse cache.
 *
 * Single instance shared across the process. Constructed lazily; use
 * {@link moduleParseCache} for the default shared instance.
 */
export class ModuleParseCache {
	private readonly entries = new Map<CacheKey, CacheEntry>();
	private readonly maxEntries: number;
	private hits = 0;
	private misses = 0;

	constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
		if (maxEntries <= 0) {
			throw new Error(`ModuleParseCache: maxEntries must be > 0, got ${maxEntries}`);
		}
		this.maxEntries = maxEntries;
	}

	/**
	 * Parse `source` for `filePath`, memoizing by (filePath, source, options).
	 *
	 * @returns the {@link ParseResult} from `oxc-parser.parseSync`.
	 */
	getOrParse(filePath: string, source: string, options: ModuleParseOptions = {}): ParseResult {
		const hash = rapidhash(source);
		const key = makeKey(filePath, hash, options);

		const existing = this.entries.get(key);
		if (existing && existing.hash === hash) {
			this.hits += 1;
			// Refresh LRU position.
			this.entries.delete(key);
			this.entries.set(key, existing);
			return existing.result;
		}

		this.misses += 1;
		const result = parseSync(filePath, source, options);
		this.entries.set(key, { hash, result });

		if (this.entries.size > this.maxEntries) {
			// Map iteration order is insertion order; the first key is the
			// least recently used (we delete-then-set on hits, so the
			// oldest still-present entry is the LRU one).
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.entries.delete(oldestKey);
			}
		}

		return result;
	}

	/** Clear all cached entries. Useful in tests and on full-rebuild signals. */
	clear(): void {
		this.entries.clear();
		this.hits = 0;
		this.misses = 0;
	}

	/** Current cache size (for observability). */
	get size(): number {
		return this.entries.size;
	}

	/** Cumulative hit/miss counters (for observability). */
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

/**
 * Default shared cache. Use this from plugin code so the cache is
 * amortized across plugins and build invocations.
 */
export const moduleParseCache = new ModuleParseCache();

/**
 * Drop-in replacement for `oxc-parser.parseSync` that uses the shared
 * {@link moduleParseCache}. Use everywhere we currently call `parseSync`
 * on user/source files during a build.
 */
export function cachedParseSync(
	filePath: string,
	source: string,
	options: ModuleParseOptions = {},
): ParseResult {
	return moduleParseCache.getOrParse(filePath, source, options);
}

function makeKey(filePath: string, sourceHash: number | bigint, options: ModuleParseOptions): CacheKey {
	// Stringify only the option keys we actually use; `parseSync` does
	// not deeply equal-check options so any extra keys would be noise.
	const lang = options.lang ?? '';
	const sourceType = options.sourceType ?? '';
	return `${filePath} ${sourceHash.toString(36)} ${lang} ${sourceType}`;
}
