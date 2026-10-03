/**
 * Returns the longest of `extensions` that `filePath` ends with.
 */
export function findLongestExtension(extensions: readonly string[], filePath: string): string | undefined {
	let longest: string | undefined;
	for (const extension of extensions) {
		if (filePath.endsWith(extension) && extension.length > (longest?.length ?? 0)) {
			longest = extension;
		}
	}
	return longest;
}

/**
 * Returns the Integration that owns `filePath`: the one with the longest registered extension
 * the path ends with.
 *
 * @remarks
 * The longest match keeps `about.kita.tsx` with the Integration that registers `.kita.tsx` when
 * another registers `.tsx`, and keeps dotted names such as `v1.2.html` or `my.page.tsx` with the
 * Integration that owns their final extension.
 */
export function findIntegrationForFile<T extends { extensions: readonly string[] }>(
	integrations: readonly T[],
	filePath: string,
): T | undefined {
	let owner: T | undefined;
	let ownerExtensionLength = 0;
	for (const integration of integrations) {
		for (const extension of integration.extensions) {
			if (extension.length > ownerExtensionLength && filePath.endsWith(extension)) {
				owner = integration;
				ownerExtensionLength = extension.length;
			}
		}
	}
	return owner;
}
