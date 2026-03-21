export type RuntimeCapabilityTag =
	| 'bun-only'
	| 'node-compatible'
	| 'requires-native-bun-api'
	| 'requires-node-builtins';

/**
 * Declares the runtime assumptions a plugin makes so config finalization can
 * reject incompatible startup environments before bootstrapping the app.
 */
export interface RuntimeCapabilityDeclaration {
	tags: RuntimeCapabilityTag[];
	minRuntimeVersion?: string;
}
