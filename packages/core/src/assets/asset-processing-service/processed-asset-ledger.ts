import path from 'node:path';
import { getAssetDependencyKey } from './asset-dependency-keys.ts';
import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

/** A processed asset whose file paths are relative to the app root, so the record survives a move. */
export type LedgerProcessedAsset = Omit<ProcessedAsset, 'filepath' | 'sourceFilepath' | 'bundledSourceFilepaths'> & {
	filepath?: string;
	sourceFilepath?: string;
	bundledSourceFilepaths?: string[];
};

export type LedgerEntry = { key: string; asset: LedgerProcessedAsset };

/** The portable form of a {@link ProcessedAssetLedger}. */
export type SerializedProcessedAssetLedger = {
	entries: LedgerEntry[];
	/** Every file the app-wide browser build emitted, chunks included; absent when no browser build ran. */
	browserOutputs?: string[];
};

/**
 * The emitted form of every dependency one production build processed or bundled, by dependency key.
 *
 * @remarks
 * `ecopages build` records here every dependency it processes, and each script the app-wide browser build
 * bundled, under the key of every dependency that declared it. It writes the record beside the server bundle;
 * `ecopages start` restores and seals it, so rendering resolves each dependency to its file in `dist/` and never
 * compiles, writes or reads the build machine's source tree. Keys and paths are relative to the app root, which
 * lets the deployed folder sit at any location.
 */
export class ProcessedAssetLedger {
	private readonly entries = new Map<string, LedgerProcessedAsset>();
	private browserOutputs: Set<string> | undefined;
	private sealed = false;

	private readonly rootDir: string;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
	}

	/** True once `ecopages start` sealed the restored record: a dependency it does not record is an error. */
	get isSealed(): boolean {
		return this.sealed;
	}

	/** Serves every dependency from this record from now on; asset processing compiles and writes nothing. */
	seal(): void {
		this.sealed = true;
	}

	/** True once the app-wide browser build recorded its outputs, in this process or in the restored build. */
	get hasBrowserBuild(): boolean {
		return this.browserOutputs !== undefined;
	}

	/**
	 * @remarks
	 * An inline asset carries its content and no file reaches `dist/`, so its `filepath` is not recorded.
	 */
	record(dep: AssetDefinition, asset: ProcessedAsset): void {
		const recorded = asset.inline ? { ...asset, filepath: undefined } : asset;
		this.entries.set(getAssetDependencyKey(dep, this.rootDir), this.toPortable(recorded));
	}

	/** Records the files one app-wide browser build emitted, which marks the ledger as holding that build. */
	recordBrowserOutputs(filepaths: readonly string[]): void {
		this.browserOutputs ??= new Set();
		for (const filepath of filepaths) this.browserOutputs.add(this.relative(filepath));
	}

	/**
	 * Forgets the app-wide browser build, so a retried production build records only its own outputs.
	 *
	 * @remarks
	 * Recorded dependencies stay: the next build records the ones it bundles again under the same keys.
	 */
	clearBrowserOutputs(): void {
		this.browserOutputs = undefined;
	}

	/** Returns the recorded asset with paths resolved against the current app root. */
	lookup(dep: AssetDefinition): ProcessedAsset | undefined {
		const asset = this.entries.get(getAssetDependencyKey(dep, this.rootDir));
		return asset ? this.toAbsolute(asset) : undefined;
	}

	/** Names `dep` in error messages: its app-root relative file, import path or content name. */
	describe(dep: AssetDefinition): string {
		if ('filepath' in dep) return this.relative(dep.filepath);
		if ('importPath' in dep) return dep.importPath;
		return 'name' in dep && dep.name ? `content ${dep.name}` : 'inline content';
	}

	serialize(): SerializedProcessedAssetLedger {
		const entries = [...this.entries]
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, asset]) => ({ key, asset }));
		return this.browserOutputs ? { entries, browserOutputs: [...this.browserOutputs].sort() } : { entries };
	}

	restore(ledger: SerializedProcessedAssetLedger): void {
		this.entries.clear();
		for (const { key, asset } of ledger.entries) this.entries.set(key, asset);
		this.browserOutputs = ledger.browserOutputs ? new Set(ledger.browserOutputs) : undefined;
	}

	private relative(filepath: string): string {
		return path.relative(this.rootDir, path.resolve(this.rootDir, filepath)).split(path.sep).join('/');
	}

	private toPortable(asset: ProcessedAsset): LedgerProcessedAsset {
		return {
			...asset,
			filepath: asset.filepath ? this.relative(asset.filepath) : undefined,
			sourceFilepath: asset.sourceFilepath ? this.relative(asset.sourceFilepath) : undefined,
			bundledSourceFilepaths: asset.bundledSourceFilepaths?.map((filepath) => this.relative(filepath)),
		};
	}

	private toAbsolute(asset: LedgerProcessedAsset): ProcessedAsset {
		const resolve = (filepath: string) => path.resolve(this.rootDir, filepath);
		return {
			...asset,
			filepath: asset.filepath ? resolve(asset.filepath) : undefined,
			sourceFilepath: asset.sourceFilepath ? resolve(asset.sourceFilepath) : undefined,
			bundledSourceFilepaths: asset.bundledSourceFilepaths?.map(resolve),
		};
	}
}
