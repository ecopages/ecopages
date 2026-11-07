import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { contentHash } from '../../../../utils/content-hash.ts';

/** A processed stylesheet and the other stylesheets its transform read. */
export interface ProcessedStylesheet {
	css: string;
	/** Absolute paths, without duplicates or the stylesheet itself. */
	dependencies: string[];
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
 * process the stylesheets they meet. An entry is reused while the source and every dependency its transform reported
 * hash the same, so an edit to an `@import` partial misses it. Input the key cannot see, such as the content Tailwind
 * scans, is evicted by the Processor's invalidation hook through {@link evict}. Concurrent misses for one source share
 * one transform. A transform that throws is not cached.
 */
export class ProcessedStylesheetCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<ProcessedStylesheet>>();

	async get(
		file: string,
		source: string,
		transform: () => Promise<ProcessedStylesheet>,
	): Promise<ProcessedStylesheet> {
		const key = path.resolve(file);
		const sourceHash = contentHash(source);
		const entry = this.entries.get(key);
		if (entry?.sourceHash === sourceHash && this.dependenciesUnchanged(entry)) return entry.result;

		const flightKey = `${key}\0${sourceHash}`;
		const pending = this.inFlight.get(flightKey);
		if (pending) return pending;
		const run = transform()
			.then((result) => {
				this.entries.set(key, {
					sourceHash,
					dependencyHashes: new Map(
						result.dependencies.map((dependency) => [dependency, hashFile(dependency)]),
					),
					result,
				});
				return result;
			})
			.finally(() => this.inFlight.delete(flightKey));
		this.inFlight.set(flightKey, run);
		return run;
	}

	/** Drops the entries of `files`, or every entry when none is given. */
	evict(files?: readonly string[]): void {
		if (!files) {
			this.entries.clear();
			return;
		}
		for (const file of files) this.entries.delete(path.resolve(file));
	}

	private dependenciesUnchanged(entry: CacheEntry): boolean {
		for (const [dependency, hash] of entry.dependencyHashes) {
			if (hashFile(dependency) !== hash) return false;
		}
		return true;
	}
}
