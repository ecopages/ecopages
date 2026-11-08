/**
 * The Node.js range Ecopages supports, as written in every package's `engines.node`.
 */
export const SUPPORTED_NODE_RANGE = '^24.15.0 || >=26.0.0';

/**
 * Returns an error message when the running Node.js is outside {@link SUPPORTED_NODE_RANGE}, or `undefined` when it is supported.
 *
 * @remarks
 * Bun reports its own Node compatibility version in `process.versions.node`, which is not a Node release, so a Bun
 * launch is never checked.
 */
export function getUnsupportedNodeMessage(versions = process.versions) {
	if (versions.bun) return undefined;

	const [major = 0, minor = 0] = String(versions.node).split('.').map(Number);
	const supported = major >= 26 || (major === 24 && minor >= 15);
	if (supported) return undefined;

	return `Ecopages requires Node.js ${SUPPORTED_NODE_RANGE}, but this is Node.js ${versions.node}. Upgrade Node.js and run the command again.`;
}
