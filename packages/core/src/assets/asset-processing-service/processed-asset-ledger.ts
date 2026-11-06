import path from 'node:path';
import { getAssetDependencyKey } from './asset-dependency-keys.ts';
import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

type FileAssetDefinition = Extract<AssetDefinition, { source: 'file' }>;

/** A processed asset whose file paths are relative to the app root, so the record survives a move. */
export type LedgerProcessedAsset = Omit<ProcessedAsset, 'filepath' | 'sourceFilepath' | 'bundledSourceFilepaths'> & {
	filepath?: string;
	sourceFilepath?: string;
	bundledSourceFilepaths?: string[];
};

export type LedgerEntry = { key: string; asset: LedgerProcessedAsset };

/**
 * The processed form of every file dependency one production build emitted.
 *
 * @remarks
 * `ecopages build` records each processed file stylesheet and script here and writes the record
 * beside the server bundle. `ecopages start` restores it, so request-time rendering links the
 * emitted assets in `dist/` and never reads the build machine's source tree. Keys and paths are
 * relative to the app root, which lets the deployed folder sit at any location.
 */
export class ProcessedAssetLedger {
	private readonly entries = new Map<string, LedgerProcessedAsset>();
	private restored = false;

	private readonly rootDir: string;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
	}

	/** True once a build's record was loaded, which makes source files optional for recorded dependencies. */
	get isRestored(): boolean {
		return this.restored;
	}

	record(dep: AssetDefinition, asset: ProcessedAsset): void {
		if (dep.source !== 'file') return;
		this.entries.set(this.keyOf(dep), this.toPortable(asset));
	}

	/** Returns the recorded asset with paths resolved against the current app root. */
	lookup(dep: AssetDefinition): ProcessedAsset | undefined {
		if (dep.source !== 'file') return undefined;
		const asset = this.entries.get(this.keyOf(dep));
		return asset ? this.toAbsolute(asset) : undefined;
	}

	/** The app-root relative path that names `dep` in error messages. */
	describe(dep: FileAssetDefinition): string {
		return this.relative(dep.filepath);
	}

	serialize(): LedgerEntry[] {
		return [...this.entries].map(([key, asset]) => ({ key, asset }));
	}

	restore(entries: readonly LedgerEntry[]): void {
		this.entries.clear();
		for (const { key, asset } of entries) this.entries.set(key, asset);
		this.restored = true;
	}

	private keyOf(dep: FileAssetDefinition): string {
		return getAssetDependencyKey(dep, this.rootDir);
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
