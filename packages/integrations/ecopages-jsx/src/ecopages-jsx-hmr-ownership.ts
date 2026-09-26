/**
 * Tracks the source files that produced the most recent JSX render.
 *
 * @remarks
 * The JSX renderer runs each page, component, or view render inside
 * {@link withEjsxHmrOwnershipScope} and records its components with
 * {@link recordEjsxHmrOwnership}. `EcopagesJsxHmrStrategy` reads the result to
 * decide whether a changed file affects SSR HTML without walking the component
 * tree on every watcher event.
 *
 * The state is module-scoped because the renderer and the HMR strategy share no
 * other lifecycle anchor. Publishing replaces it only when the file set changes,
 * so repeated renders of the same page keep the existing state.
 *
 * Only the latest top-level render is kept. With several pages open, a file
 * used only by a page that rendered earlier is not matched until that page
 * renders again.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
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

const pendingFileOwners = new AsyncLocalStorage<Set<string>>();

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
 * Walks each root through `getComponentIdentity`, `config.dependencies.components[*].config`,
 * and `config.layouts[*].config` recursively, collecting every file path. The
 * state is replaced only when the resulting file set has a different hash, so
 * the renderer's per-render hook is free in the steady state.
 */
export function updateEjsxHmrOwnership(
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent> | undefined>,
): void {
	publishEjsxHmrOwnership(collectFileOwners(components));
}

/**
 * Runs one render and publishes the files it recorded once the outermost scope ends.
 *
 * @remarks
 * Nested renders, such as components and foreign subtrees resolved inside a
 * page, join the outer scope, so the published set covers the whole render tree
 * instead of the last nested render.
 */
export async function withEjsxHmrOwnershipScope<T>(render: () => T | Promise<T>): Promise<T> {
	if (pendingFileOwners.getStore()) {
		return await render();
	}

	const fileOwners = new Set<string>();
	try {
		return await pendingFileOwners.run(fileOwners, render);
	} finally {
		if (fileOwners.size > 0) {
			publishEjsxHmrOwnership(fileOwners);
		}
	}
}

/**
 * Adds the source files of `components`, their declared dependencies and their
 * layouts to the active render scope.
 *
 * @throws Error when called outside {@link withEjsxHmrOwnershipScope}.
 */
export function recordEjsxHmrOwnership(components: ReadonlyArray<EcoComponent | undefined>): void {
	const fileOwners = pendingFileOwners.getStore();
	if (!fileOwners) {
		throw new Error('Ecopages JSX HMR ownership can only be recorded inside an active render scope.');
	}

	for (const file of collectFileOwners(components)) {
		fileOwners.add(file);
	}
}

/**
 * Resets the state to empty. Used by tests and by HMR manager teardown.
 */
export function resetEjsxHmrOwnership(): void {
	currentState = EMPTY_STATE;
}

function publishEjsxHmrOwnership(files: ReadonlySet<string>): void {
	const hash = hashFileSet(files);

	if (hash === currentState.hash) {
		return;
	}

	currentState = {
		fileOwners: new Set(files),
		hash,
	};
}

function collectFileOwners(components: ReadonlyArray<EcoComponent | Partial<EcoComponent> | undefined>): Set<string> {
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
