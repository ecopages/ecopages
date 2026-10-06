import { describe, expect, it } from 'vitest';
import { getAssetDependencyKey } from './asset-dependency-keys.ts';
import { AssetFactory } from './asset.factory.ts';

describe('getAssetDependencyKey', () => {
	it('keeps a classic and a module declaration of the same file apart', () => {
		const filepath = '/app/src/pages/greeting.ts';

		expect(getAssetDependencyKey(AssetFactory.createFileScript({ filepath, classic: true }))).not.toBe(
			getAssetDependencyKey(AssetFactory.createFileScript({ filepath })),
		);
	});
});
