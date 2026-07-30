/**
 * Per-app persistent cache for `client-graph-boundary` plugin transforms.
 *
 * @remarks
 * The plugin's `transformModuleImports` function is the second most
 * expensive operation in the React build path (after `parseSync`).
 * It walks the AST to find reachable exports and prunes forbidden
 * imports. On a no-op rebuild (file unchanged, no plugin signature
 * change) the entire walk can be skipped if the inputs are identical.
 *
 * This cache is owned by the {@link ReactPlugin} for the app's lifetime.
 * It persists across HMR rebuilds but is invalidated per-file when the
 * watcher detects a source change. The `requestedExports` registry
 * remains per-build (it's mutated during cross-file propagation and
 * must not accumulate stale state across builds).
 *
 * The cache is content-hashed (via `rapidhash`) so a `touch`/`utimes`
 * does not invalidate a still-valid entry.
 *
 * Cache identity is `(filePath, source, allowListRules, inboundRules)`.
 * Allow-list hashing includes each package's permitted exports, not just
 * package names — otherwise `node:fs{readFileSync}` and
 * `node:fs{writeFileSync}` would collide.
 *
 * Modules that inline external file contents (`readFileSync` rewrite) are
 * not stored: their output depends on files outside the importer source.
 *
 * **`rulesAdded` semantics:** the map holds the **after-state** of
 * every registry key this transform touched — both newly added keys
 * and keys that were grown (Set union) or promoted to `'*'`. On
 * replay the cache applies each entry via the same merge rules the
 * live transform uses (`mergeRequestedExportRules`), so a key that
 * was already in the live registry when the transform ran and grew
 * during the transform is correctly grown on replay against a fresh
 * registry as well.
 */

import { rapidhash } from '@ecopages/core/utils/hash';

const DEFAULT_MAX_ENTRIES = 5_000;

export type RequestedExportRules = Set<string> | '*';

/** Globally declared modules with their permitted export rules. */
export type ClientGraphAllowList = ReadonlyMap<string, RequestedExportRules>;

export type CachedTransform = {
	/** Hash of the source string at the time the transform was cached. */
	sourceHash: number | bigint;
	/** Hash of the globally-allowed modules map at the time the transform was cached. */
	allowListHash: number | bigint;
	/** Hash of the requested export rules already propagated to this module. */
	inboundRulesHash: number | bigint;
	/** The transformed source (or original if `modified` is false). */
	transformed: string;
	/** Whether the transform changed the source. */
	modified: boolean;
	/**
	 * Map of `requestedExports` keys this transform touched, mapped to
	 * their **after-state**. Includes:
	 * - newly-added keys
	 * - keys whose Set grew (union of pre-existing and newly reachable exports)
	 * - keys promoted to `'*'`
	 *
	 * On cache hit, each entry is replayed via `mergeRequestedExportRules`,
	 * which handles all three cases correctly. Defensively copied at
	 * `set()` time to prevent later mutation from corrupting the cache.
	 */
	rulesAdded: Map<string, RequestedExportRules>;
};

/**
 * Clone a single rule value: `'*'` is a singleton, Sets get a shallow copy.
 */
function cloneRules(rules: RequestedExportRules): RequestedExportRules {
	return rules instanceof Set ? new Set(rules) : rules;
}

/**
 * LRU-bounded cache for client-graph-boundary transform results.
 *
 * One instance is owned by the React plugin for the app's lifetime and
 * shared across all builds. The cache key is
 * `(filePath, source, allowListRules, inboundRules)` so a file whose
 * source, allow-list export rules, or inbound requested exports change
 * gets a fresh entry.
 */
export class ClientGraphBoundaryCache {
	private readonly entries = new Map<string, CachedTransform>();
	private readonly maxEntries: number;
	private hits = 0;
	private misses = 0;

	constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
		if (maxEntries <= 0) {
			throw new Error(`ClientGraphBoundaryCache: maxEntries must be > 0, got ${maxEntries}`);
		}
		this.maxEntries = maxEntries;
	}

	/**
	 * Look up a cached transform for `filePath`.
	 *
	 * Returns `undefined` if the source, allow-list rules, or inbound
	 * requested exports have changed since the entry was stored.
	 */
	get(
		filePath: string,
		source: string,
		allowList: ClientGraphAllowList,
		inboundRules?: RequestedExportRules,
	): CachedTransform | undefined {
		const sourceHash = rapidhash(source);
		const allowListHash = hashAllowList(allowList);
		const inboundRulesHash = hashRequestedExportRules(inboundRules);

		const existing = this.entries.get(filePath);
		if (
			existing &&
			existing.sourceHash === sourceHash &&
			existing.allowListHash === allowListHash &&
			existing.inboundRulesHash === inboundRulesHash
		) {
			this.hits += 1;
			this.entries.delete(filePath);
			this.entries.set(filePath, existing);
			return existing;
		}

		this.misses += 1;
		return undefined;
	}

	/**
	 * Store a transform result.
	 *
	 * Evicts the least recently used entry if the cache exceeds its
	 * capacity. Defensively copies any `Set`-typed rules in `rulesAdded`
	 * so later mutations to the caller's sets cannot corrupt the cache.
	 */
	set(
		filePath: string,
		source: string,
		allowList: ClientGraphAllowList,
		entry: Omit<CachedTransform, 'sourceHash' | 'allowListHash' | 'inboundRulesHash'>,
		inboundRules?: RequestedExportRules,
	): void {
		const sourceHash = rapidhash(source);
		const allowListHash = hashAllowList(allowList);
		const inboundRulesHash = hashRequestedExportRules(inboundRules);

		const rulesAddedCopy = new Map<string, RequestedExportRules>();
		for (const [key, rules] of entry.rulesAdded) {
			rulesAddedCopy.set(key, cloneRules(rules));
		}

		const full: CachedTransform = {
			sourceHash,
			allowListHash,
			inboundRulesHash,
			transformed: entry.transformed,
			modified: entry.modified,
			rulesAdded: rulesAddedCopy,
		};

		this.entries.set(filePath, full);

		if (this.entries.size > this.maxEntries) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.entries.delete(oldestKey);
			}
		}
	}

	/**
	 * Invalidate a single file's entry. Call this from the file watcher
	 * when `filePath`'s content has changed.
	 */
	invalidate(filePath: string): void {
		this.entries.delete(filePath);
	}

	/**
	 * Invalidate every file whose key matches a predicate.
	 */
	invalidateMatching(predicate: (filePath: string) => boolean): number {
		let removed = 0;
		for (const key of this.entries.keys()) {
			if (predicate(key)) {
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

/**
 * Hash allow-list package names together with each package's permitted exports.
 */
export function hashAllowList(allowList: ClientGraphAllowList): number | bigint {
	const lines: string[] = [];
	for (const packageName of Array.from(allowList.keys()).sort()) {
		const rules = allowList.get(packageName);
		if (rules === '*') {
			lines.push(`${packageName}=*`);
			continue;
		}
		const named = rules ? Array.from(rules).sort().join(',') : '';
		lines.push(`${packageName}={${named}}`);
	}
	return rapidhash(lines.join('\n'));
}

function hashRequestedExportRules(rules: RequestedExportRules | undefined): number | bigint {
	if (rules === '*') return rapidhash('*');
	if (!rules) return rapidhash('');
	return rapidhash(Array.from(rules).sort().join('\n'));
}
