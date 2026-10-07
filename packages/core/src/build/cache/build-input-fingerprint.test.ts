import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Processor } from '../../plugins/processor.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import {
	createBuildInputsFingerprint,
	didBuildInputContributorChange,
	haveBuildInputsChanged,
	hashAppConfigFile,
	hashRecordedBuildInputs,
} from './build-input-fingerprint.ts';
import { getAppBuildInputIndex } from './build-input-dependency-index.ts';

describe('build-input-fingerprint', () => {
	it('reports stable build inputs when contributors do not signal changes', () => {
		const processor = new (class extends Processor {
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
			override readonly plugins = undefined;
			override didChange(): boolean {
				return true;
			}

			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return null;
			}
		})({ name: 'test-processor' });

		assert.equal(
			createBuildInputsFingerprint({
				processors: new Map([['test-processor', processor]]),
				integrations: [],
			} as any),
			'processor:test-processor',
		);
		assert.equal(
			haveBuildInputsChanged({
				processors: new Map([['test-processor', processor]]),
				integrations: [],
			} as any),
			true,
		);
	});

	it('changes the config hash when a file eco.config.ts imports changes', () => {
		const configRoot = mkdtempSync(path.join(tmpdir(), 'eco-config-hash-'));
		try {
			const configPath = path.join(configRoot, 'eco.config.ts');
			const optionsPath = path.join(configRoot, 'options.ts');
			writeFileSync(configPath, "import { options } from './options';\nexport default { options };\n");
			writeFileSync(optionsPath, 'export const options = { a: 1 };\n');
			const appConfig = {
				absolutePaths: { config: configPath, configModuleFiles: [configPath, optionsPath] },
			} as unknown as EcoPagesAppConfig;

			const before = hashAppConfigFile(appConfig);
			writeFileSync(optionsPath, 'export const options = { a: 2 };\n');

			expect(hashAppConfigFile(appConfig)).not.toBe(before);
		} finally {
			rmSync(configRoot, { recursive: true, force: true });
		}
	});
});

describe('hashAppConfigFile', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-config-hash-'));
		writeFileSync(path.join(rootDir, 'eco.config.ts'), 'export default {}');
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
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

describe('hashRecordedBuildInputs', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-recorded-inputs-'));
		mkdirSync(path.join(rootDir, 'src/content/docs'), { recursive: true });
		writeFileSync(path.join(rootDir, 'src/content/docs/intro.mdx'), '# Intro');
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	function createConfig(): EcoPagesAppConfig {
		const contentProcessor = {
			getWatchConfig: () => ({ paths: [path.join(rootDir, 'src/content/docs')] }),
		};
		return {
			rootDir,
			processors: new Map([['content', contentProcessor]]),
		} as unknown as EcoPagesAppConfig;
	}

	it('changes when a recorded file or Processor watch directory changes', () => {
		const appConfig = createConfig();
		const intro = path.join(rootDir, 'src/content/docs/intro.mdx');
		getAppBuildInputIndex(appConfig).recordWatchPath(intro);
		const initial = hashRecordedBuildInputs(appConfig);

		writeFileSync(intro, '# Intro, edited');
		utimesSync(intro, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
		expect(hashRecordedBuildInputs(appConfig)).not.toBe(initial);
	});

	it('reports none when nothing has been recorded and no Processor declares watch paths', () => {
		expect(hashRecordedBuildInputs({ rootDir, processors: new Map() } as EcoPagesAppConfig)).toBe('none');
	});
});
