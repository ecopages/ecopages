import type { ComponentIdentity } from '@ecopages/core';
import { readExportedComponentIdentities } from '@ecopages/core/build';
import { fileSystem } from '@ecopages/file-system';

/**
 * Returns a lookup of the static Eco Component identity of an export of a foreign file, for the React rewrite.
 *
 * @remarks
 * `rootDir` must be the app root core attributes identities against, so the ids match the ones the server
 * renders. Each file is read again on every lookup and parsed only when its source changed, so a development
 * edit is seen without a separate invalidation. A file that does not read, or no Integration owns, has no
 * identities.
 */
export function createComponentIdentityReader(options: {
	rootDir: string;
	integrationOf: (filePath: string) => string | undefined;
}): (filePath: string, exportName: string) => ComponentIdentity | undefined {
	const cache = new Map<string, { source: string; identities: Map<string, ComponentIdentity> }>();
	return (filePath, exportName) => {
		const integration = options.integrationOf(filePath);
		if (!integration) return undefined;
		let source: string;
		try {
			source = fileSystem.readFileSync(filePath);
		} catch {
			return undefined;
		}
		let cached = cache.get(filePath);
		if (!cached || cached.source !== source) {
			cached = {
				source,
				identities: readExportedComponentIdentities(source, filePath, {
					integration,
					projectRoot: options.rootDir,
				}),
			};
			cache.set(filePath, cached);
		}
		return cached.identities.get(exportName);
	};
}
