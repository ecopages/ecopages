/**
 * Tracks the source files that participate in the active SSR render tree.
 *
 * @remarks
 * The JSX integration renderer calls {@link updateEjsxHmrOwnership} after each
 * page, component, or view render so the HMR strategy can answer
 * "does this changed file affect SSR HTML?" without re-walking the tree on
 * every watcher event.
 *
 * The state is module-scoped because the HMR strategy and renderer live in
 * different call sites (server strategy vs SSR renderer) and share no other
 * lifecycle anchor. A fresh state is installed only when the source-file set
 * changes, so the renderer's per-render hook stays O(1) in the steady state.
 */

import { rapidhash } from '@ecopages/core/hash';
import { collectComponentConfigFilePaths } from '@ecopages/core/route-renderer/page-loading/file-scoped-dependency-components';
import type { EcoComponent } from '@ecopages/core';

export type EjsxHmrOwnershipState = {
	fileOwners: ReadonlySet<string>;
	hash: string;
};

const EMPTY_STATE: EjsxHmrOwnershipState = {
	fileOwners: new Set<string>(),
	hash: '',
};

let currentState: EjsxHmrOwnershipState = EMPTY_STATE;

/**
 * Returns the most recently recorded active render tree.
 */
export function getEjsxHmrOwnership(): EjsxHmrOwnershipState {
	return currentState;
}

/**
 * Updates the active render tree from one or more root components.
 *
 * @remarks
 * Walks each root's `config.__eco.file`, `config.dependencies.components[*].config`,
 * and `config.layouts[*].config` recursively, collecting every file path. The
 * state is replaced only when the resulting file set has a different hash, so
 * the renderer's per-render hook is free in the steady state.
 */
export function updateEjsxHmrOwnership(components: ReadonlyArray<EcoComponent | undefined>): void {
	publishEjsxHmrOwnership(collectFileOwners(components));
}

/**
 * Merges one render tree into a pending ownership set during an active render.
 */
export function mergeEjsxHmrOwnership(target: Set<string>, components: ReadonlyArray<EcoComponent | undefined>): void {
	for (const file of collectFileOwners(components)) {
		target.add(file);
	}
}

/**
 * Publishes the merged ownership set for the completed render.
 */
export function publishEjsxHmrOwnership(files: ReadonlySet<string>): void {
	const hash = hashFileSet(files);

	if (hash === currentState.hash) {
		return;
	}

	currentState = {
		fileOwners: new Set(files),
		hash,
	};
}

/**
 * Resets the state to empty. Used by tests and by HMR manager teardown.
 */
export function resetEjsxHmrOwnership(): void {
	currentState = EMPTY_STATE;
}

function collectFileOwners(components: ReadonlyArray<EcoComponent | undefined>): Set<string> {
	return collectComponentConfigFilePaths(components, { includeLayouts: true });
}

function hashFileSet(files: ReadonlySet<string>): string {
	if (files.size === 0) {
		return '';
	}

	const sorted = Array.from(files).sort();
	const joined = sorted.join('\n');
	return rapidhash(joined).toString(36);
}
