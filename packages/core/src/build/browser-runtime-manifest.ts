export type BrowserRuntimeMode = 'development' | 'production';

export type BrowserRuntimeAssetDeclaration = {
	/** Bare or virtual specifier used by authored/generated browser modules. */
	specifier: string;
	/** Integration, processor, or core subsystem that owns this runtime asset. */
	owner: string;
	/** Source import path used to build or resolve the runtime asset. */
	importPath: string;
	/** Concrete browser URL emitted or served for this runtime asset. */
	publicPath: string;
	/** Runtime mode this declaration applies to. Omit when the URL is mode-independent. */
	mode?: BrowserRuntimeMode;
	/** Specifiers that should be treated as external while building this runtime asset. */
	externals?: readonly string[];
};

export type BrowserRuntimeAsset = BrowserRuntimeAssetDeclaration & {
	externals: readonly string[];
};

export type BrowserRuntimeManifest = {
	assets: readonly BrowserRuntimeAsset[];
	bySpecifier: ReadonlyMap<string, BrowserRuntimeAsset>;
};

export class BrowserRuntimeManifestConflictError extends Error {
	readonly specifier: string;
	readonly existing: BrowserRuntimeAsset;
	readonly incoming: BrowserRuntimeAsset;

	constructor(specifier: string, existing: BrowserRuntimeAsset, incoming: BrowserRuntimeAsset) {
		super(
			`Browser runtime asset conflict for ${specifier}: ${existing.owner} maps to ${existing.publicPath}, ` +
				`${incoming.owner} maps to ${incoming.publicPath}`,
		);
		this.name = 'BrowserRuntimeManifestConflictError';
		this.specifier = specifier;
		this.existing = existing;
		this.incoming = incoming;
	}
}

function normalizeDeclaration(declaration: BrowserRuntimeAssetDeclaration): BrowserRuntimeAsset {
	return {
		...declaration,
		externals: declaration.externals ?? [],
	};
}

function hasCompatibleRuntimeAsset(existing: BrowserRuntimeAsset, incoming: BrowserRuntimeAsset): boolean {
	return (
		existing.owner === incoming.owner &&
		existing.importPath === incoming.importPath &&
		existing.publicPath === incoming.publicPath &&
		existing.mode === incoming.mode &&
		arrayEquals(existing.externals, incoming.externals)
	);
}

function arrayEquals(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

export function createBrowserRuntimeManifest(
	declarations: readonly BrowserRuntimeAssetDeclaration[] = [],
): BrowserRuntimeManifest {
	const assets: BrowserRuntimeAsset[] = [];
	const bySpecifier = new Map<string, BrowserRuntimeAsset>();

	for (const declaration of declarations) {
		const asset = normalizeDeclaration(declaration);
		const existing = bySpecifier.get(asset.specifier);

		if (existing) {
			if (!hasCompatibleRuntimeAsset(existing, asset)) {
				throw new BrowserRuntimeManifestConflictError(asset.specifier, existing, asset);
			}

			continue;
		}

		assets.push(asset);
		bySpecifier.set(asset.specifier, asset);
	}

	return {
		assets,
		bySpecifier,
	};
}

export function mergeBrowserRuntimeManifests(
	...manifests: Array<BrowserRuntimeManifest | undefined>
): BrowserRuntimeManifest {
	return createBrowserRuntimeManifest(manifests.flatMap((manifest) => manifest?.assets ?? []));
}

export function getBrowserRuntimeSpecifierMap(manifest: BrowserRuntimeManifest): ReadonlyMap<string, string> {
	return new Map(manifest.assets.map((asset) => [asset.specifier, asset.publicPath]));
}
