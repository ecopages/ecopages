import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { Processor } from '../plugins/processor.ts';
import {
	createBuildInputsFingerprint,
	didBuildInputContributorChange,
	haveBuildInputsChanged,
	hashAppConfigFile,
} from './build-input-fingerprint.ts';

describe('build-input-fingerprint', () => {
	it('reports stable build inputs when contributors do not signal changes', () => {
		const processor = new (class extends Processor {
			override readonly buildPlugins = undefined;
			override readonly plugins = undefined;
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return null;
			}
		})({ name: 'test-processor' });

		assert.equal(didBuildInputContributorChange(processor), false);
		assert.equal(
			createBuildInputsFingerprint({
				processors: new Map([['test-processor', processor]]),
				integrations: [],
			} as any),
			'stable',
		);
		assert.equal(
			haveBuildInputsChanged({
				processors: new Map([['test-processor', processor]]),
				integrations: [],
			} as any),
			false,
		);
	});

	it('reports changed build inputs when a contributor opts in', () => {
		const processor = new (class extends Processor {
			override readonly buildPlugins = undefined;
			override readonly plugins = undefined;
			override didChange(): boolean {
				return true;
			}

			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return null;
			}
		})({ name: 'changed-processor' });

		assert.equal(
			createBuildInputsFingerprint({
				processors: new Map([['changed-processor', processor]]),
				integrations: [],
			} as any),
			'processor:changed-processor',
		);
		assert.equal(
			haveBuildInputsChanged({
				processors: new Map([['changed-processor', processor]]),
				integrations: [],
			} as any),
			true,
		);
	});

	it('returns missing when eco.config.ts is unavailable', () => {
		assert.equal(
			hashAppConfigFile({
				absolutePaths: {},
			} as any),
			'missing',
		);
	});
});
