import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileStylesheetAsset, ProcessedAsset } from './assets.types.ts';
import { ProcessedAssetLedger } from './processed-asset-ledger.ts';

const buildRoot = path.resolve('/build/app');
const deployRoot = path.resolve('/srv/deploy/app');

function createDependency(rootDir: string): FileStylesheetAsset {
	return { kind: 'stylesheet', source: 'file', filepath: path.join(rootDir, 'src/pages/home.css') };
}

function createAsset(rootDir: string): ProcessedAsset {
	return {
		kind: 'stylesheet',
		filepath: path.join(rootDir, 'dist/client/assets/home-abc.css'),
		sourceFilepath: path.join(rootDir, 'src/pages/home.css'),
	};
}

describe('ProcessedAssetLedger', () => {
	it('finds a recorded dependency after the app root moves', () => {
		const built = new ProcessedAssetLedger(buildRoot);
		built.record(createDependency(buildRoot), createAsset(buildRoot));

		const deployed = new ProcessedAssetLedger(deployRoot);
		deployed.restore(JSON.parse(JSON.stringify(built.serialize())));

		expect(deployed.isRestored).toBe(true);
		expect(deployed.lookup(createDependency(deployRoot))).toEqual(createAsset(deployRoot));
	});

	it('does not find a dependency that was not recorded', () => {
		const ledger = new ProcessedAssetLedger(buildRoot);
		ledger.restore([]);

		expect(ledger.lookup(createDependency(buildRoot))).toBeUndefined();
	});

	it('records no path of the build machine', () => {
		const ledger = new ProcessedAssetLedger(buildRoot);
		ledger.record(createDependency(buildRoot), createAsset(buildRoot));

		expect(JSON.stringify(ledger.serialize())).not.toContain(buildRoot);
	});
});
