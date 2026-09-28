/**
 * Process-wide parse cache for `oxc-parser.parseSync`.
 *
 * @remarks
 * Several build plugins (eco-component-meta, client-graph-boundary,
 * browser-runtime) each call `parseSync` on the same source file with
 * overlapping options. This cache memoizes the parse result keyed by
 * `(absolute path, source, options)`. When the source is unchanged,
 * subsequent calls return the cached result without re-parsing.
 *
 * The cache is LRU-bounded (10 000 entries) and key-stable across a
 * single HMR session. It is **content-hashed** rather than
 * mtime-hashed so that `touch`/`utimes` does not invalidate a
 * still-valid parse.
 */

import { extname } from 'node:path';
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

type ParserLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

/** Resolves the Oxc dialect for a source module from its file extension. */
function parserLanguageForFile(filePath: string): ParserLanguage {
	const extension = extname(filePath).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

/** Parses an ECMAScript module with the shared, normalized cache contract. */
export function parseModuleSource(filePath: string, source: string, options: ModuleParseOptions = {}): ParseResult {
	return moduleParseCache.getOrParse(filePath, source, options);
}

type CacheKey = string;

type CacheEntry = {
	hash: number | bigint;
	result: ParseResult;
};

/**
 * LRU-bounded module parse cache.
 *
 * One instance is shared across the process; call {@link parseModuleSource}
 * to use it.
 */
export class ModuleParseCache {
	private readonly entries = new Map<CacheKey, CacheEntry>();
	private readonly maxEntries: number;

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
		const normalizedOptions = normalizeModuleParseOptions(filePath, options);
		const hash = rapidhash(source);
		const key = makeKey(filePath, hash, normalizedOptions);

		const existing = this.entries.get(key);
		if (existing && existing.hash === hash) {
			// Refresh LRU position.
			this.entries.delete(key);
			this.entries.set(key, existing);
			return existing.result;
		}

		const result = parseSync(filePath, source, normalizedOptions);
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
}

/**
 * Default shared cache, amortized across plugins and build invocations.
 */
const moduleParseCache = new ModuleParseCache();

function normalizeModuleParseOptions(filePath: string, options: ModuleParseOptions): ModuleParseOptions {
	return {
		...options,
		lang: options.lang ?? parserLanguageForFile(filePath),
		sourceType: options.sourceType ?? 'module',
	};
}

function makeKey(filePath: string, sourceHash: number | bigint, options: ModuleParseOptions): CacheKey {
	// Stringify only the option keys we actually use; `parseSync` does
	// not deeply equal-check options so any extra keys would be noise.
	const lang = options.lang ?? '';
	const sourceType = options.sourceType ?? '';
	return `${filePath} ${sourceHash.toString(36)} ${lang} ${sourceType}`;
}
