import type { AssetDefinition } from './assets.types.ts';

/** Whether the production app-wide browser build can bundle this dependency as a script entry. */
export function isBundleableScript(dep: AssetDefinition): boolean {
	return dep.kind === 'script' && dep.bundle !== false && dep.classic !== true && dep.inline !== true;
}
