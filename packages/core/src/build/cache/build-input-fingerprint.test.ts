import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
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
	hashWatchedBuildInputs,
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

describe('hashWatchedBuildInputs', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-watched-inputs-'));
		mkdirSync(path.join(rootDir, 'src/content/docs/node_modules/pkg'), { recursive: true });
		writeFileSync(path.join(rootDir, 'src/content/docs/intro.mdx'), '# Intro');
		writeFileSync(path.join(rootDir, 'src/content/docs/notes.txt'), 'ignored');
		writeFileSync(path.join(rootDir, 'src/content/docs/node_modules/pkg/readme.mdx'), 'ignored');
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	function createConfig(extensions: string[] = ['.mdx']): EcoPagesAppConfig {
		const contentProcessor = {
			getWatchConfig: () => ({ paths: [path.join(rootDir, 'src/content/docs')], extensions }),
		};
		return {
			rootDir,
			additionalWatchPaths: ['src/content'],
			processors: new Map([['content', contentProcessor]]),
		} as unknown as EcoPagesAppConfig;
	}

	it('changes when a Processor-watched file changes, is added, or is removed', () => {
		const initial = hashWatchedBuildInputs(createConfig());

		writeFileSync(path.join(rootDir, 'src/content/docs/intro.mdx'), '# Intro, edited');
		const edited = hashWatchedBuildInputs(createConfig());
		writeFileSync(path.join(rootDir, 'src/content/docs/more.mdx'), '# More');
		const added = hashWatchedBuildInputs(createConfig());
		rmSync(path.join(rootDir, 'src/content/docs/more.mdx'));

		expect(edited).not.toBe(initial);
		expect(added).not.toBe(edited);
		expect(hashWatchedBuildInputs(createConfig())).toBe(edited);
	});

	it('notices a same-size edit through its modification time, without reading file contents', () => {
		const intro = path.join(rootDir, 'src/content/docs/intro.mdx');
		utimesSync(intro, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
		const initial = hashWatchedBuildInputs(createConfig());

		writeFileSync(intro, '# Outro');
		utimesSync(intro, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));

		expect(hashWatchedBuildInputs(createConfig())).not.toBe(initial);
	});

	it('ignores other extensions, node_modules, broken symlinks, and additionalWatchPaths', () => {
		symlinkSync(path.join(rootDir, 'missing.mdx'), path.join(rootDir, 'src/content/docs/broken.mdx'));
		const initial = hashWatchedBuildInputs(createConfig());

		writeFileSync(path.join(rootDir, 'src/content/docs/notes.txt'), 'still ignored');
		writeFileSync(path.join(rootDir, 'src/content/docs/node_modules/pkg/readme.mdx'), 'still ignored');
		expect(hashWatchedBuildInputs(createConfig())).toBe(initial);

		const allFiles = hashWatchedBuildInputs(createConfig([]));
		writeFileSync(path.join(rootDir, 'src/content/docs/notes.txt'), 'now watched');
		expect(hashWatchedBuildInputs(createConfig([]))).not.toBe(allFiles);
	});

	it('reports none when no Processor declares watch paths', () => {
		expect(hashWatchedBuildInputs({ ...createConfig(), processors: new Map() } as EcoPagesAppConfig)).toBe('none');
	});
});
