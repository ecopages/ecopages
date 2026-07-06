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

import path from 'node:path';
import { rapidhash } from '@ecopages/core/hash';
import type { EcoComponent, EcoComponentConfig } from '@ecopages/core';

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
	const files = collectFileOwners(components);
	const hash = hashFileSet(files);

	if (hash === currentState.hash) {
		return;
	}

	currentState = {
		fileOwners: files,
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
	const files = new Set<string>();
	const visited = new Set<string>();

	const visit = (config: EcoComponentConfig | undefined) => {
		const file = config?.__eco?.file;
		if (!file) {
			return;
		}

		const resolved = path.resolve(file);
		if (visited.has(resolved)) {
			return;
		}
		visited.add(resolved);
		files.add(resolved);

		for (const dependency of config?.dependencies?.components ?? []) {
			visit(dependency?.config);
		}

		for (const layout of config?.layouts ?? []) {
			visit(layout?.config);
		}
	};

	for (const component of components) {
		visit(component?.config);
	}

	return files;
}

function hashFileSet(files: ReadonlySet<string>): string {
	if (files.size === 0) {
		return '';
	}

	const sorted = Array.from(files).sort();
	const joined = sorted.join('\n');
	return rapidhash(joined).toString(36);
}
