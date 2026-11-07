/** Stable attribution for a Component created by an Integration-owned module. */
export type ComponentIdentity = {
	id: string;
	/**
	 * Source file of the declaring module, relative to the app root with forward slashes (`src/components/x.tsx`,
	 * `../` for a linked workspace package), as the component meta transform writes it.
	 *
	 * @remarks
	 * Consumers resolve it against `appConfig.rootDir`, so an emitted module names no path of the machine that
	 * built it. A runtime-created identity may hold an absolute path, which resolves to itself.
	 */
	file: string;
	integration: string;
};
