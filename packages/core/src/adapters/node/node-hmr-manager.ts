import type { EcoPagesAppConfig, IClientBridge } from '../../types/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import {
	InMemoryEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { SharedHmrManager } from '../shared/shared-hmr-manager.ts';

export interface NodeHmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
}

/**
 * Node development HMR manager.
 *
 * @remarks
 * This manager owns three separate concerns:
 * - runtime websocket event fanout
 * - entrypoint registration and dedupe
 * - strategy coordination for rebuilds and invalidation
 *
 * The strict page-entrypoint contract lives here: `registerEntrypoint()` is
 * reserved for integration-owned page bundles, while generic script assets must
 * go through `registerScriptEntrypoint()`.
 */
export class NodeHmrManager extends SharedHmrManager {
	/**
	 * Creates the Node HMR manager over the shared coordination pipeline.
	 *
	 * @remarks
	 * Unlike Bun, Node keeps websocket subscription wiring in the server adapter,
	 * so this manager only specializes the shared manager where runtime behavior
	 * actually differs: dependency-graph storage, missing-file tolerance, and how
	 * runtime bundle failures disable HMR.
	 */
	constructor({ appConfig, bridge }: NodeHmrManagerParams) {
		super({ appConfig, bridge });
	}

	/**
	 * Reuses the shared in-memory dependency graph when the app already has one and
	 * otherwise creates the default Node development graph.
	 */
	protected override createEntrypointDependencyGraph(existingEntrypointDependencyGraph: EntrypointDependencyGraph) {
		return existingEntrypointDependencyGraph instanceof InMemoryEntrypointDependencyGraph
			? existingEntrypointDependencyGraph
			: new InMemoryEntrypointDependencyGraph();
	}

	/**
	 * Tells the shared HMR manager to ignore missing-file events during Node watch
	 * mode.
	 *
	 * @remarks
	 * Node file watching can briefly report remove-and-recreate sequences while a
	 * file is being rewritten. Treating those transient gaps as fatal would disable
	 * otherwise healthy development sessions.
	 */
	protected override shouldSkipMissingFileChange(_filePath: string): boolean {
		return true;
	}

	/**
	 * Disables HMR after a runtime bundle failure so the Node dev server can keep
	 * serving requests without repeatedly emitting broken updates.
	 */
	protected override onRuntimeBundleFailure(error: unknown): void {
		this.enabled = false;
		appLogger.error('[HMR] Failed to build runtime script; continuing with HMR disabled.', error);
	}
}
