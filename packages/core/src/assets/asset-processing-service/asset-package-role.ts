import type { AssetPackageRole } from './assets.types.ts';

export function isBrowserRuntimeAssetRole(role: AssetPackageRole | undefined): boolean {
	return role === 'runtime' || role === 'page-script';
}
