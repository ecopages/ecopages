import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { contentHash } from '../../../../utils/content-hash.ts';

/** A processed stylesheet and the other stylesheets its transform read. */
export interface ProcessedStylesheet {
	css: string;
	/** Absolute paths, without duplicates or the stylesheet itself. */
	dependencies: string[];
	/** The class map of a CSS Module, from the same transform as `css`; absent for any other stylesheet. */
	exports?: Readonly<Record<string, string>>;
}

interface CacheEntry {
	sourceHash: string;
	dependencyHashes: ReadonlyMap<string, string | undefined>;
	result: ProcessedStylesheet;
}

const hashFile = (file: string) => (fileSystem.exists(file) ? fileSystem.hash(file) : undefined);

/**
 * The stylesheets one app's Processor produced, by source file, so every caller of one edit reads one output.
 *
 * @remarks
 * The dev stylesheet service, the dev transform server, server builds, browser bundles and the asset pipeline each
 * process the stylesheets they meet; within one edit they share one transform per stylesheet. The development
 * stylesheet service empties the cache at the start of every watcher batch, so any changed input, including content
 * Tailwind scans or a file only the Processor knows it read, is seen on the next transform. Outside development no
 * source changes while the process runs. Between batches an entry is reused only while the source and the
 * dependencies its transform reported hash the same, which covers an edit whose batch has not arrived yet.
 *
 * A transform that started before {@link evict} belongs to a superseded generation: its result is not stored, and its
 * caller transforms again. Concurrent misses within a generation share one transform. A failure is not cached.
 */
export class ProcessedStylesheetCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<ProcessedStylesheet>>();
	private generation = 0;

	async get(
		file: string,
		source: string,
		transform: () => Promise<ProcessedStylesheet>,
	): Promise<ProcessedStylesheet> {
		const key = path.resolve(file);
		const sourceHash = contentHash(source);
		const entry = this.entries.get(key);
		if (entry?.sourceHash === sourceHash && this.dependenciesUnchanged(entry)) return entry.result;

		const generation = this.generation;
		const flightKey = `${generation}\0${key}\0${sourceHash}`;
		let pending = this.inFlight.get(flightKey);
		if (!pending) {
			pending = transform().finally(() => this.inFlight.delete(flightKey));
			this.inFlight.set(flightKey, pending);
		}
		const result = await pending;
		if (generation !== this.generation) return this.get(file, source, transform);
		this.entries.set(key, {
			sourceHash,
			dependencyHashes: new Map(result.dependencies.map((dependency) => [dependency, hashFile(dependency)])),
			result,
		});
		return result;
	}

	/** Drops every entry and starts a new generation, so no transform already running fills the cache. */
	evict(): void {
		this.generation += 1;
		this.entries.clear();
		this.inFlight.clear();
	}

	private dependenciesUnchanged(entry: CacheEntry): boolean {
		for (const [dependency, hash] of entry.dependencyHashes) {
			if (hashFile(dependency) !== hash) return false;
		}
		return true;
	}
}
